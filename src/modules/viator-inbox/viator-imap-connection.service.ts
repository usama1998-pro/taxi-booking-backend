import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { ImapFlow } from 'imapflow';
import { createImapClient } from './viator-imap-session';
import {
  getImapConfig,
  isImapConfigured,
  type HostingerInboxConfig,
} from './viator-inbox.config';

export type ImapSyncTrigger =
  | 'startup'
  | 'idle'
  | 'fallback'
  | 'manual-api'
  | 'manual-app';

type NewMailHandler = (
  client: ImapFlow,
  trigger: ImapSyncTrigger,
) => Promise<void>;

const RECONNECT_BASE_MS = 5_000;
const RECONNECT_MAX_MS = 60_000;
const EXISTS_DEBOUNCE_MS = 750;

@Injectable()
export class ViatorImapConnectionService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ViatorImapConnectionService.name);

  private cfg: HostingerInboxConfig | null = null;
  private client: ImapFlow | null = null;
  private mailboxLockRelease: (() => void) | null = null;
  private workChain: Promise<unknown> = Promise.resolve();
  private fallbackTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private existsDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private stopped = false;
  private connected = false;
  private newMailHandler: NewMailHandler | null = null;

  onModuleInit(): void {
    if (!isImapConfigured()) {
      this.logger.warn(
        'IMAP not configured — set IMAP_HOST (or SMTP_HOST), SMTP_USER, and SMTP_PASS',
      );
      return;
    }

    this.cfg = getImapConfig()!;
  }

  start(): void {
    if (this.stopped || !this.cfg || this.fallbackTimer) {
      return;
    }

    this.logger.log(
      `IMAP IDLE listener starting (${this.cfg.user}@${this.cfg.host}:${this.cfg.port}, fallback sync every ${this.cfg.fallbackSyncIntervalMs}ms)`,
    );

    void this.connectAndListen();

    this.fallbackTimer = setInterval(() => {
      void this.handleFallbackSync();
    }, this.cfg.fallbackSyncIntervalMs);
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.fallbackTimer) {
      clearInterval(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.existsDebounceTimer) {
      clearTimeout(this.existsDebounceTimer);
      this.existsDebounceTimer = null;
    }
    void this.disconnect();
  }

  registerNewMailHandler(handler: NewMailHandler): void {
    this.newMailHandler = handler;
  }

  isConnected(): boolean {
    return this.connected && this.client != null;
  }

  /** Serialize work on the singleton IMAP connection. */
  runExclusive<T>(work: (client: ImapFlow) => Promise<T>): Promise<T> {
    const next = this.workChain.then(async () => {
      if (!this.client || !this.connected) {
        throw new Error('IMAP connection is not ready');
      }
      return work(this.client);
    });
    this.workChain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private async connectAndListen(): Promise<void> {
    if (this.stopped || !this.cfg) {
      return;
    }

    try {
      await this.disconnect();

      const client = createImapClient(this.cfg);
      client.on('exists', () => this.scheduleIdleSync());
      client.on('close', () => {
        this.connected = false;
        if (!this.stopped) {
          this.logger.warn('IMAP connection closed — scheduling reconnect');
          this.scheduleReconnect();
        }
      });
      client.on('error', (err) => {
        this.logger.warn(
          `IMAP connection error: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });

      await client.connect();
      const lock = await client.getMailboxLock(this.cfg.mailbox);

      this.client = client;
      this.mailboxLockRelease = () => lock.release();
      this.connected = true;
      this.reconnectAttempt = 0;

      this.logger.log(
        `IMAP connected — mailbox "${this.cfg.mailbox}" open, IDLE active`,
      );

      await this.notifyNewMail('startup');
    } catch (err) {
      this.connected = false;
      this.logger.error(
        `IMAP connect failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.scheduleReconnect();
    }
  }

  private scheduleIdleSync(): void {
    if (this.existsDebounceTimer) {
      clearTimeout(this.existsDebounceTimer);
    }
    this.existsDebounceTimer = setTimeout(() => {
      this.existsDebounceTimer = null;
      void this.runExclusive(async () => {
        await this.notifyNewMail('idle');
      }).catch((err) => {
        this.logger.warn(
          `IDLE sync failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }, EXISTS_DEBOUNCE_MS);
  }

  private async handleFallbackSync(): Promise<void> {
    if (this.stopped) {
      return;
    }
    if (!this.isConnected()) {
      this.logger.debug('Fallback sync: reconnecting IMAP');
      await this.connectAndListen();
      return;
    }

    try {
      await this.runExclusive(async () => {
        await this.notifyNewMail('fallback');
      });
    } catch (err) {
      this.logger.warn(
        `Fallback sync failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.scheduleReconnect();
    }
  }

  private async notifyNewMail(trigger: ImapSyncTrigger): Promise<void> {
    if (!this.client || !this.newMailHandler) {
      return;
    }
    await this.newMailHandler(this.client, trigger);
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) {
      return;
    }

    const delay = Math.min(
      RECONNECT_BASE_MS * 2 ** this.reconnectAttempt,
      RECONNECT_MAX_MS,
    );
    this.reconnectAttempt += 1;

    this.logger.log(`IMAP reconnect scheduled in ${delay}ms`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connectAndListen();
    }, delay);
  }

  private async disconnect(): Promise<void> {
    this.connected = false;

    if (this.mailboxLockRelease) {
      this.mailboxLockRelease();
      this.mailboxLockRelease = null;
    }

    const client = this.client;
    this.client = null;
    if (client) {
      await client.logout().catch(() => undefined);
      client.close();
    }
  }
}

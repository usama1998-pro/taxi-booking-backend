import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { isImapConfigured } from './viator-inbox.config';
import { ViatorInboxService } from './viator-inbox.service';

const DEFAULT_POLL_INTERVAL_MS = 3 * 60 * 1000;

function resolvePollIntervalMs(): number {
  const raw = process.env.VIATOR_INBOX_POLL_INTERVAL_MS?.trim();
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 60_000) {
      return parsed;
    }
  }
  const minutesRaw = process.env.VIATOR_INBOX_POLL_INTERVAL_MINUTES?.trim();
  if (minutesRaw) {
    const minutes = Number(minutesRaw);
    if (Number.isFinite(minutes) && minutes >= 1) {
      return minutes * 60 * 1000;
    }
  }
  return DEFAULT_POLL_INTERVAL_MS;
}

function isAutoPollEnabled(): boolean {
  const raw = process.env.VIATOR_INBOX_AUTO_POLL?.trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off' && raw !== 'no';
}

/**
 * Periodically runs POST /viator/inbox/check so Viator emails are imported without
 * external cron or the driver app calling the endpoint.
 */
@Injectable()
export class ViatorInboxPoller implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ViatorInboxPoller.name);
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly viatorInbox: ViatorInboxService) {}

  onModuleInit(): void {
    if (!isImapConfigured()) {
      this.logger.warn(
        'Viator inbox auto-poll disabled: IMAP not configured (SMTP_USER/SMTP_PASS or IMAP_*).',
      );
      return;
    }
    if (!isAutoPollEnabled()) {
      this.logger.log('Viator inbox auto-poll disabled (VIATOR_INBOX_AUTO_POLL).');
      return;
    }

    const intervalMs = resolvePollIntervalMs();
    this.logger.log(
      `Viator inbox auto-poll enabled (every ${Math.round(intervalMs / 1000)}s).`,
    );
    setImmediate(() => this.viatorInbox.enqueueInboxCheck());
    this.timer = setInterval(
      () => this.viatorInbox.enqueueInboxCheck(),
      intervalMs,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}

import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ImapFlow } from 'imapflow';
import { randomUUID } from 'node:crypto';
import { BookingsService } from '../bookings/bookings.service';
import { getImapConfig, isImapConfigured } from './viator-inbox.config';
import { mergeBookingFields, type ViatorBookingFields } from './viator-booking-fields';
import {
  parseViatorEmailBody,
  type ViatorBookingDetails,
} from './parse-viator-email-body';
import { parseViatorNewBookingSubject } from './parse-viator-subject';
import { withImapSession } from './viator-imap-session';
import { mapViatorToCreateBookingDto } from './viator-to-booking.mapper';

export type ViatorNotificationDto = {
  id: string;
  subject: string;
  viatorReference: string;
  pickupDateLabel: string;
  receivedAt: string;
} & ViatorBookingFields;

export type ViatorPersistResult = {
  viatorReference: string;
  bookingUuid?: string;
  /** New row written on this request. */
  savedToDb: boolean;
  /** Reference was already in the bookings table (no duplicate insert). */
  alreadyInDatabase: boolean;
  error?: string;
};

export type ViatorLatestMailDto = {
  found: boolean;
  subject?: string;
  viatorReference?: string;
  pickupDateLabel?: string;
  receivedAt?: string;
  from?: string;
  message?: string;
  savedToDb?: boolean;
  alreadyInDatabase?: boolean;
  bookingUuid?: string;
} & ViatorBookingFields;

type PendingEntry = ViatorNotificationDto & { imapUid: number };

@Injectable()
export class ViatorInboxService implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly bookingsService: BookingsService) {}

  private readonly logger = new Logger(ViatorInboxService.name);
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private imapChain: Promise<unknown> = Promise.resolve();
  /** Active in-app alerts (not persisted). */
  private readonly pending = new Map<string, PendingEntry>();
  /** User-dismissed refs — stay out of the list until server restart. */
  private readonly dismissed = new Set<string>();

  /** One IMAP session at a time — avoids overlapping connections to Hostinger. */
  private runImapExclusive<T>(work: () => Promise<T>): Promise<T> {
    const next = this.imapChain.then(work, work);
    this.imapChain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  onModuleInit(): void {
    if (!isImapConfigured()) {
      this.logger.warn(
        'Hostinger mail not configured — cannot read Viator booking emails (set SMTP_HOST, SMTP_USER, SMTP_PASS)',
      );
      return;
    }
    const cfg = getImapConfig()!;
    void this.syncFromInbox().catch((err) =>
      this.logger.error('Initial Viator inbox sync failed', err),
    );
    this.pollTimer = setInterval(() => {
      void this.syncFromInbox().catch((err) =>
        this.logger.error('Viator inbox poll failed', err),
      );
    }, cfg.pollIntervalMs);
    this.logger.log(
      `Hostinger IMAP poll every ${cfg.pollIntervalMs}ms — watching for Viator "New Booking" emails (${cfg.user}@${cfg.host})`,
    );
  }

  onModuleDestroy(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  listNotifications(options?: {
    limit?: number;
  }): ViatorNotificationDto[] {
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
    return [...this.pending.values()]
      .sort(
        (a, b) =>
          new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
      )
      .slice(0, limit)
      .map(({ imapUid: _uid, ...dto }) => dto);
  }

  getUnreadCount(): number {
    return this.pending.size;
  }

  async dismissNotification(id: string): Promise<ViatorNotificationDto> {
    const entry = [...this.pending.values()].find((n) => n.id === id);
    if (!entry) {
      throw new NotFoundException('Notification not found');
    }
    this.dismissed.add(entry.viatorReference);
    this.pending.delete(entry.viatorReference);
    const { imapUid: _uid, ...dto } = entry;
    return dto;
  }

  async dismissAllNotifications(): Promise<{ updated: number }> {
    const entries = [...this.pending.values()];
    for (const entry of entries) {
      this.dismissed.add(entry.viatorReference);
      this.pending.delete(entry.viatorReference);
    }
    return { updated: entries.length };
  }

  private async isViatorReferenceSaved(viatorReference: string): Promise<boolean> {
    const existing = await this.bookingsService.findByBookingReference(
      viatorReference,
    );
    return existing != null;
  }

  private async persistViatorBooking(input: {
    viatorReference: string;
    pickupDateLabel: string;
    details: ViatorBookingDetails;
  }): Promise<ViatorPersistResult> {
    const { viatorReference } = input;
    try {
      const existing = await this.bookingsService.findByBookingReference(
        viatorReference,
      );
      if (existing) {
        return {
          viatorReference,
          bookingUuid: existing.uuid,
          savedToDb: false,
          alreadyInDatabase: true,
        };
      }

      const dto = mapViatorToCreateBookingDto(input);
      const { booking, created } =
        await this.bookingsService.createFromViator(dto);
      if (created) {
        this.logger.log(
          `Viator booking saved as reservation ${booking.bookingReference} (${booking.uuid})`,
        );
      } else {
        this.logger.log(
          `Viator booking already in database: ${booking.bookingReference}`,
        );
      }
      return {
        viatorReference,
        bookingUuid: booking.uuid,
        savedToDb: created,
        alreadyInDatabase: !created,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Could not save Viator booking ${viatorReference}: ${message}`,
      );
      return {
        viatorReference,
        savedToDb: false,
        alreadyInDatabase: false,
        error: message,
      };
    }
  }

  private async fetchBookingDetailsFromUid(
    client: ImapFlow,
    uid: number,
  ): Promise<ViatorBookingDetails> {
    const msg = await client.fetchOne(uid, { source: true }, { uid: true });
    if (!msg || !msg.source) {
      return {};
    }
    return await parseViatorEmailBody(msg.source);
  }

  async syncFromInbox(): Promise<{ added: number; scanned: number }> {
    return this.runImapExclusive(() => this.syncFromInboxInner());
  }

  private async syncFromInboxInner(): Promise<{ added: number; scanned: number }> {
    const cfg = getImapConfig();
    if (!cfg) {
      return { added: 0, scanned: 0 };
    }

    try {
      return await withImapSession(cfg, async (client) => {
        let added = 0;
        let scanned = 0;

        const lock = await client.getMailboxLock(cfg.mailbox);
        try {
          const uids = await client.search({
            seen: false,
            subject: 'New Booking for',
          });

          if (!uids || uids.length === 0) {
            return { added: 0, scanned: 0 };
          }

          for await (const msg of client.fetch(uids, {
            envelope: true,
            uid: true,
          })) {
            scanned += 1;
            const subject = msg.envelope?.subject ?? '';
            const parsed = parseViatorNewBookingSubject(subject);
            if (!parsed || msg.uid == null) {
              continue;
            }

            if (
              this.pending.has(parsed.viatorReference) ||
              this.dismissed.has(parsed.viatorReference)
            ) {
              continue;
            }

            if (await this.isViatorReferenceSaved(parsed.viatorReference)) {
              continue;
            }

            const details = await this.fetchBookingDetailsFromUid(
              client,
              msg.uid,
            );

            const persist = await this.persistViatorBooking({
              viatorReference: parsed.viatorReference,
              pickupDateLabel: parsed.pickupDateLabel,
              details,
            });
            if (persist.error) {
              continue;
            }

            const receivedAt = (msg.envelope?.date ?? new Date()).toISOString();
            const entry: PendingEntry = {
              id: randomUUID(),
              subject: subject.trim(),
              viatorReference: parsed.viatorReference,
              pickupDateLabel: parsed.pickupDateLabel,
              receivedAt,
              imapUid: msg.uid,
              ...mergeBookingFields(details),
            };
            this.pending.set(parsed.viatorReference, entry);
            added += 1;
            this.logger.log(
              `New Viator booking (unread): ${parsed.viatorReference}`,
            );
          }

          return { added, scanned };
        } finally {
          lock.release();
        }
      });
    } catch (err) {
      this.logger.warn(
        `Viator inbox sync skipped (IMAP): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return { added: 0, scanned: 0 };
    }
  }

  async getLatestViatorMail(): Promise<ViatorLatestMailDto> {
    return this.runImapExclusive(() => this.getLatestViatorMailInner());
  }

  private async getLatestViatorMailInner(): Promise<ViatorLatestMailDto> {
    const cfg = getImapConfig();
    if (!cfg) {
      throw new ServiceUnavailableException(
        'Hostinger mail not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS.',
      );
    }

    try {
      return await withImapSession(cfg, async (client) => {
        let latestUid: number | undefined;
        let latest: {
          subject: string;
          viatorReference: string;
          pickupDateLabel: string;
          receivedAt: Date;
          from: string;
        } | null = null;

        const lock = await client.getMailboxLock(cfg.mailbox);
        try {
          const since = new Date();
          since.setDate(since.getDate() - 90);

          const uids = await client.search({
            since,
            subject: 'New Booking for',
          });

          if (!uids || uids.length === 0) {
            return {
              found: false,
              message:
                'No emails with subject "New Booking for …" in the last 90 days.',
            };
          }

          for await (const msg of client.fetch(uids, {
            envelope: true,
            uid: true,
          })) {
            const subject = msg.envelope?.subject ?? '';
            const parsed = parseViatorNewBookingSubject(subject);
            if (!parsed) {
              continue;
            }

            const receivedAt = msg.envelope?.date ?? new Date(0);
            if (latest && receivedAt.getTime() <= latest.receivedAt.getTime()) {
              continue;
            }

            const from = (msg.envelope?.from ?? [])
              .map((a) => a.address ?? '')
              .filter(Boolean)
              .join(', ');

            latestUid = msg.uid;
            latest = {
              subject: subject.trim(),
              viatorReference: parsed.viatorReference,
              pickupDateLabel: parsed.pickupDateLabel,
              receivedAt,
              from,
            };
          }

          if (!latest || latestUid == null) {
            return {
              found: false,
              message:
                'Emails matched the search but none had a Viator booking subject (New Booking for … (#BR-…)).',
            };
          }

          const details = await this.fetchBookingDetailsFromUid(client, latestUid);

          const persist = await this.persistViatorBooking({
            viatorReference: latest.viatorReference,
            pickupDateLabel: latest.pickupDateLabel,
            details,
          });

          return {
            found: true,
            subject: latest.subject,
            viatorReference: latest.viatorReference,
            pickupDateLabel: latest.pickupDateLabel,
            receivedAt: latest.receivedAt.toISOString(),
            from: latest.from || undefined,
            savedToDb: persist.savedToDb,
            alreadyInDatabase: persist.alreadyInDatabase,
            bookingUuid: persist.bookingUuid,
            ...(persist.error
              ? {
                  message: `Email read but could not save booking: ${persist.error}`,
                }
              : {}),
            ...mergeBookingFields(details),
          };
        } finally {
          lock.release();
        }
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not read Hostinger inbox.';
      this.logger.warn(`getLatestViatorMail failed: ${message}`);
      throw new ServiceUnavailableException(
        `Could not read email inbox (${message}). Check SMTP credentials and Hostinger IMAP access.`,
      );
    }
  }
}

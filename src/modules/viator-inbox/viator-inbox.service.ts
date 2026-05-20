import {
  Injectable,
  Logger,
  NotFoundException,
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
import {
  ViatorImapConnectionService,
  type ImapSyncTrigger,
} from './viator-imap-connection.service';
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
export class ViatorInboxService implements OnModuleInit {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly imapConnection: ViatorImapConnectionService,
  ) {}

  private readonly logger = new Logger(ViatorInboxService.name);
  /** Active in-app alerts (not persisted). */
  private readonly pending = new Map<string, PendingEntry>();
  /** User-dismissed refs — stay out of the list until server restart. */
  private readonly dismissed = new Set<string>();

  onModuleInit(): void {
    if (!isImapConfigured()) {
      this.logger.warn(
        'Hostinger mail not configured — cannot read Viator booking emails (set IMAP_HOST, SMTP_USER, SMTP_PASS)',
      );
      return;
    }

    this.imapConnection.registerNewMailHandler(async (client, trigger) => {
      await this.syncUnreadOnClient(client, trigger);
    });
    this.imapConnection.start();
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

  async syncFromInbox(
    trigger: ImapSyncTrigger = 'manual-app',
  ): Promise<{ added: number; scanned: number }> {
    if (!isImapConfigured()) {
      this.logger.debug('Inbox sync skipped (imap config missing)');
      return { added: 0, scanned: 0 };
    }
    if (!this.imapConnection.isConnected()) {
      throw new ServiceUnavailableException(
        'IMAP connection is not ready. Wait for reconnect or check IMAP credentials.',
      );
    }

    this.logger.debug(`Inbox sync start (trigger=${trigger})`);
    const startedAt = Date.now();
    const result = await this.imapConnection.runExclusive((client) =>
      this.syncUnreadOnClient(client, trigger),
    );
    this.logger.debug(
      `Inbox sync done (trigger=${trigger}, scanned=${result.scanned}, added=${result.added}, unread=${this.pending.size}, elapsedMs=${Date.now() - startedAt})`,
    );
    return result;
  }

  private async syncUnreadOnClient(
    client: ImapFlow,
    trigger: ImapSyncTrigger,
  ): Promise<{ added: number; scanned: number }> {
    const cfg = getImapConfig();
    if (!cfg) {
      return { added: 0, scanned: 0 };
    }

    let added = 0;
    let scanned = 0;

    const uids = await client.search({
      seen: false,
      subject: 'New Booking for',
    });

    if (!uids || uids.length === 0) {
      this.logger.debug(`Inbox sync found no unread Viator emails (trigger=${trigger})`);
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

      const details = await this.fetchBookingDetailsFromUid(client, msg.uid);

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
        `New Viator booking (trigger=${trigger}): ${parsed.viatorReference}`,
      );
    }

    return { added, scanned };
  }

  async getLatestViatorMail(): Promise<ViatorLatestMailDto> {
    if (!isImapConfigured()) {
      throw new ServiceUnavailableException(
        'Hostinger mail not configured. Set IMAP_HOST, SMTP_USER, and SMTP_PASS.',
      );
    }
    if (!this.imapConnection.isConnected()) {
      throw new ServiceUnavailableException(
        'IMAP connection is not ready. Wait for reconnect or check IMAP credentials.',
      );
    }

    try {
      return await this.imapConnection.runExclusive((client) =>
        this.getLatestViatorMailOnClient(client),
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not read Hostinger inbox.';
      this.logger.warn(`getLatestViatorMail failed: ${message}`);
      throw new ServiceUnavailableException(
        `Could not read email inbox (${message}). Check IMAP credentials and Hostinger IMAP access.`,
      );
    }
  }

  private async getLatestViatorMailOnClient(
    client: ImapFlow,
  ): Promise<ViatorLatestMailDto> {
    const cfg = getImapConfig();
    if (!cfg) {
      throw new ServiceUnavailableException(
        'Hostinger mail not configured. Set IMAP_HOST, SMTP_USER, and SMTP_PASS.',
      );
    }

    let latestUid: number | undefined;
    let latest: {
      subject: string;
      viatorReference: string;
      pickupDateLabel: string;
      receivedAt: Date;
      from: string;
    } | null = null;

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
  }
}

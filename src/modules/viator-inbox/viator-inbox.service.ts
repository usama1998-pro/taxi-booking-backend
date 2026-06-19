import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ViatorAlert } from '@prisma/client';
import type { ImapFlow } from 'imapflow';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../core/database/prisma.service';
import { BookingsService } from '../bookings/bookings.service';
import {
  assertPickupNotInPast,
  getBookingTimeZone,
  parseScheduledTime,
} from '../bookings/booking-scheduled-time';
import { getImapConfig, isImapConfigured } from './viator-inbox.config';
import { VIATOR_INBOX_LOOKBACK_HOURS } from './viator-inbox.constants';
import { mergeBookingFields, type ViatorBookingFields } from './viator-booking-fields';
import {
  parseViatorBookingReferenceFromBody,
  parseViatorEmailBody,
  type ViatorBookingDetails,
} from './parse-viator-email-body';
import { parseViatorNewBookingSubject } from './parse-viator-subject';
import {
  isViatorTestBookingSubject,
  parseViatorTestBookingSubject,
} from './viator-test-email';
import { isAllowedViatorProductCode } from './viator-allowed-products';
import { withImapSession } from './viator-imap-session';
import { normalizeBookingReference } from '../bookings/booking-reference.where';
import { mapViatorToCreateBookingDto } from './viator-to-booking.mapper';

export type ViatorNotificationDto = {
  id: string;
  subject: string;
  viatorReference: string;
  pickupDateLabel: string;
  receivedAt: string;
  isTestBooking?: boolean;
} & ViatorBookingFields;

export type ViatorPersistResult = {
  viatorReference: string;
  bookingUuid?: string;
  savedToDb: boolean;
  alreadyInDatabase: boolean;
  error?: string;
};

type PendingEntry = ViatorNotificationDto & { imapUid: number };

export type ViatorInboxCheckResult = {
  added: number;
  scanned: number;
  skippedDuplicate: number;
  skippedProduct: number;
  skippedSubject: number;
  failedImport: number;
  lookbackHours: number;
  notifications: ViatorNotificationDto[];
};

export type ViatorInboxCheckEnqueueResponse = {
  accepted: boolean;
  status: 'started' | 'already_running';
  lookbackHours: number;
  message: string;
};

@Injectable()
export class ViatorInboxService {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly prisma: PrismaService,
  ) {}

  private readonly logger = new Logger(ViatorInboxService.name);
  private inboxCheckRunning = false;

  /** Acquire a pool connection only for Prisma work (not during IMAP). */
  private async withDbConnection<T>(fn: () => Promise<T>): Promise<T> {
    await this.prisma.acquireRequestConnection();
    try {
      return await fn();
    } finally {
      await this.prisma.releaseRequestConnection();
    }
  }

  private rowToDto(row: ViatorAlert): ViatorNotificationDto {
    const payload = (row.payload ?? {}) as ViatorBookingFields & {
      isTestBooking?: boolean;
    };
    const { isTestBooking, ...bookingFields } = payload;
    return {
      id: row.id,
      subject: row.subject,
      viatorReference: row.viatorReference,
      pickupDateLabel: row.pickupDateLabel,
      receivedAt: row.receivedAt.toISOString(),
      ...(isTestBooking ? { isTestBooking: true } : {}),
      ...bookingFields,
    };
  }

  async listNotifications(options?: {
    limit?: number;
  }): Promise<ViatorNotificationDto[]> {
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
    const rows = await this.prisma.viatorAlert.findMany({
      where: { dismissedAt: null },
      orderBy: { receivedAt: 'desc' },
      take: limit,
    });
    return rows.map((row) => this.rowToDto(row));
  }

  async getUnreadCount(): Promise<number> {
    return this.prisma.viatorAlert.count({
      where: { dismissedAt: null },
    });
  }

  async dismissNotification(id: string): Promise<ViatorNotificationDto> {
    const row = await this.prisma.viatorAlert.findUnique({ where: { id } });
    if (!row || row.dismissedAt) {
      throw new NotFoundException('Notification not found');
    }
    const updated = await this.prisma.viatorAlert.update({
      where: { id },
      data: { dismissedAt: new Date() },
    });
    return this.rowToDto(updated);
  }

  async dismissAllNotifications(): Promise<{ updated: number }> {
    const result = await this.prisma.viatorAlert.updateMany({
      where: { dismissedAt: null },
      data: { dismissedAt: new Date() },
    });
    return { updated: result.count };
  }

  private recentInboxCutoff(): Date {
    const cutoff = new Date();
    cutoff.setTime(
      cutoff.getTime() - VIATOR_INBOX_LOOKBACK_HOURS * 60 * 60 * 1000,
    );
    return cutoff;
  }

  private parseEmailForImport(subject: string): {
    viatorReference: string;
    pickupDateLabel: string;
    isTestBooking: boolean;
  } | null {
    const trimmed = subject.trim();
    const testParsed = parseViatorTestBookingSubject(trimmed);
    if (testParsed && isViatorTestBookingSubject(trimmed)) {
      return {
        pickupDateLabel: testParsed.pickupDateLabel,
        viatorReference: '',
        isTestBooking: true,
      };
    }
    const parsed = parseViatorNewBookingSubject(trimmed);
    if (!parsed) {
      return null;
    }
    return { ...parsed, isTestBooking: false };
  }

  /**
   * Viator emails often default missing times to 09:00 Madrid; same-day imports
   * would otherwise fail "pickup must be in the future" after 9am.
   */
  private bumpViatorScheduledTimeIfPast(scheduledTimeIso: string): string {
    let scheduled = parseScheduledTime(scheduledTimeIso);
    const now = new Date();
    let guard = 0;
    while (scheduled.getTime() < now.getTime() && guard < 400) {
      scheduled = new Date(scheduled.getTime() + 24 * 60 * 60 * 1000);
      guard += 1;
    }
    return scheduled.toISOString();
  }

  private async persistViatorBooking(input: {
    viatorReference: string;
    pickupDateLabel: string;
    details: ViatorBookingDetails;
    isTestBooking?: boolean;
  }): Promise<ViatorPersistResult> {
    const viatorReference = normalizeBookingReference(input.viatorReference);
    try {
      const reserved =
        await this.bookingsService.findReservedBookingByReference(
          viatorReference,
        );
      if (reserved) {
        if (reserved.deletedAt) {
          this.logger.log(
            `Skip Viator booking (reference in trash): ${viatorReference}`,
          );
        }
        const existing = await this.bookingsService.findByBookingReference(
          viatorReference,
        );
        return {
          viatorReference,
          bookingUuid: existing?.uuid ?? reserved.uuid,
          savedToDb: false,
          alreadyInDatabase: true,
        };
      }

      let dto = mapViatorToCreateBookingDto(input);
      dto = {
        ...dto,
        scheduledTime: this.bumpViatorScheduledTimeIfPast(dto.scheduledTime),
      };
      assertPickupNotInPast(parseScheduledTime(dto.scheduledTime));
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

  private async createAlertForNewBooking(
    entry: PendingEntry,
    bookingUuid?: string,
  ): Promise<ViatorNotificationDto | null> {
    const existing = await this.prisma.viatorAlert.findUnique({
      where: { viatorReference: entry.viatorReference },
    });
    if (existing) {
      return null;
    }

    const {
      imapUid: _uid,
      id: _id,
      subject: _subject,
      viatorReference: _ref,
      pickupDateLabel: _label,
      receivedAt: _receivedAt,
      isTestBooking,
      ...bookingFields
    } = entry;
    const row = await this.prisma.viatorAlert.create({
      data: {
        id: entry.id,
        viatorReference: entry.viatorReference,
        subject: entry.subject,
        pickupDateLabel: entry.pickupDateLabel,
        receivedAt: new Date(entry.receivedAt),
        bookingUuid: bookingUuid ?? null,
        payload: {
          ...mergeBookingFields(bookingFields),
          ...(isTestBooking ? { isTestBooking: true } : {}),
        },
      },
    });
    return this.rowToDto(row);
  }

  private async fetchEmailSourceFromUid(
    client: ImapFlow,
    uid: number,
  ): Promise<Buffer | undefined> {
    const timeoutMs = 45_000;
    try {
      const fetched = await Promise.race([
        client.fetchOne(
          uid,
          { source: { maxLength: 512 * 1024 } },
          { uid: true },
        ),
        new Promise<undefined>((_, reject) => {
          setTimeout(
            () => reject(new Error(`IMAP body fetch timeout (${timeoutMs}ms)`)),
            timeoutMs,
          );
        }),
      ]);
      if (fetched && 'source' in fetched && fetched.source) {
        return Buffer.isBuffer(fetched.source)
          ? fetched.source
          : Buffer.from(fetched.source);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Body fetch failed for uid=${uid}: ${message}`);
    }

    return undefined;
  }

  private async fetchBookingDetailsFromUid(
    client: ImapFlow,
    uid: number,
  ): Promise<ViatorBookingDetails> {
    const source = await this.fetchEmailSourceFromUid(client, uid);
    if (!source) {
      return {};
    }
    return parseViatorEmailBody(source);
  }

  private async isDuplicateViatorReference(
    viatorReference: string,
  ): Promise<boolean> {
    const ref = normalizeBookingReference(viatorReference);
    if (!ref) {
      return false;
    }
    const existingAlert = await this.prisma.viatorAlert.findUnique({
      where: { viatorReference: ref },
      select: { id: true },
    });
    if (existingAlert) {
      return true;
    }
    return this.bookingsService.isBookingReferenceReserved(ref);
  }

  private async logDuplicateViatorSkip(viatorReference: string): Promise<void> {
    const ref = normalizeBookingReference(viatorReference);
    const reserved =
      await this.bookingsService.findReservedBookingByReference(ref);
    if (reserved?.deletedAt) {
      this.logger.log(`Skip Viator booking (reference in trash): ${ref}`);
      return;
    }
    this.logger.log(`Skip Viator booking (already imported): ${ref}`);
  }

  /** Same #BR-TEST email (IMAP uid) is only imported once; each new message gets a new BR-…. */
  private async isDuplicateTestImapUid(imapUid: number): Promise<boolean> {
    const existing = await this.prisma.viatorAlert.findFirst({
      where: {
        payload: {
          path: '$.imapUid',
          equals: imapUid,
        },
      },
      select: { id: true },
    });
    return Boolean(existing);
  }

  /**
   * Starts an inbox check in the background and returns immediately so other API
   * requests are not blocked on IMAP.
   */
  enqueueInboxCheck(): ViatorInboxCheckEnqueueResponse {
    if (!isImapConfigured()) {
      throw new ServiceUnavailableException(
        'Hostinger mail not configured. Set IMAP_HOST, SMTP_USER, and SMTP_PASS (same mailbox that receives Viator emails).',
      );
    }

    if (this.inboxCheckRunning) {
      return {
        accepted: false,
        status: 'already_running',
        lookbackHours: VIATOR_INBOX_LOOKBACK_HOURS,
        message:
          'An inbox check is already running. New bookings will appear via GET /viator/notifications when it finishes.',
      };
    }

    this.inboxCheckRunning = true;
    setImmediate(() => {
      void this.runInboxCheckInBackground();
    });

    return {
      accepted: true,
      status: 'started',
      lookbackHours: VIATOR_INBOX_LOOKBACK_HOURS,
      message: `Inbox check started in the background (Viator + #BR-TEST, last ${VIATOR_INBOX_LOOKBACK_HOURS}h). Use GET /viator/notifications for alerts.`,
    };
  }

  private async runInboxCheckInBackground(): Promise<void> {
    try {
      await this.runInboxCheckWork();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not read Hostinger inbox.';
      this.logger.warn(`Viator inbox check failed: ${message}`);
    } finally {
      this.inboxCheckRunning = false;
    }
  }

  /** IMAP scan — runs off the request thread; do not await from HTTP handlers. */
  private async runInboxCheckWork(): Promise<ViatorInboxCheckResult | null> {
    const cfg = getImapConfig();
    if (!cfg) {
      return null;
    }

    const startedAt = Date.now();
    const cutoff = this.recentInboxCutoff();
    this.logger.log(
      `Viator inbox check started (lookback=${VIATOR_INBOX_LOOKBACK_HOURS}h, since=${cutoff.toISOString()}, tz=${getBookingTimeZone()}, now=${new Date().toISOString()})`,
    );

    const result = await withImapSession(cfg, async (client) => {
      const lock = await client.getMailboxLock(cfg.mailbox);
      try {
        return await this.syncViatorEmails(client);
      } finally {
        lock.release();
      }
    });

    const unread = await this.withDbConnection(() => this.getUnreadCount());
    this.logger.log(
      `Viator inbox check done (scanned=${result.scanned}, added=${result.added}, skippedDuplicate=${result.skippedDuplicate}, skippedProduct=${result.skippedProduct}, skippedSubject=${result.skippedSubject}, failedImport=${result.failedImport}, notifications=${result.notifications.length}, unread=${unread}, elapsedMs=${Date.now() - startedAt})`,
    );
    return result;
  }

  private async collectViatorUids(client: ImapFlow): Promise<number[]> {
    const since = this.recentInboxCutoff();
    const batch = await client.search({
      since,
      subject: 'New Booking for',
    });
    return Array.isArray(batch) ? batch : [];
  }

  private isWithinLookback(envelopeDate: Date | undefined): boolean {
    if (!envelopeDate) {
      // IMAP SEARCH already applied `since`; keep messages with missing envelope dates.
      return true;
    }
    return envelopeDate.getTime() >= this.recentInboxCutoff().getTime();
  }

  private async syncViatorEmails(client: ImapFlow): Promise<{
    added: number;
    scanned: number;
    skippedDuplicate: number;
    skippedProduct: number;
    skippedSubject: number;
    failedImport: number;
    lookbackHours: number;
    notifications: ViatorNotificationDto[];
  }> {
    let added = 0;
    let scanned = 0;
    let skippedDuplicate = 0;
    let skippedProduct = 0;
    let skippedSubject = 0;
    let failedImport = 0;
    const notifications: ViatorNotificationDto[] = [];
    const processedRefs = new Set<string>();

    const uids = await this.collectViatorUids(client);
    this.logger.log(
      `Inbox check IMAP search returned ${uids.length} candidate message(s) (lookback=${VIATOR_INBOX_LOOKBACK_HOURS}h)`,
    );
    if (uids.length === 0) {
      this.logger.log(
        `Inbox check found no "New Booking for" emails in the last ${VIATOR_INBOX_LOOKBACK_HOURS}h`,
      );
      return {
        added: 0,
        scanned: 0,
        skippedDuplicate: 0,
        skippedProduct: 0,
        skippedSubject: 0,
        failedImport: 0,
        lookbackHours: VIATOR_INBOX_LOOKBACK_HOURS,
        notifications,
      };
    }

    type EnvelopeRow = {
      uid: number;
      subject: string;
      receivedAt: Date;
    };
    const rows: EnvelopeRow[] = [];

    for await (const msg of client.fetch(uids, {
      envelope: true,
      uid: true,
    })) {
      scanned += 1;
      const subject = msg.envelope?.subject ?? '';
      const receivedAt = msg.envelope?.date ?? new Date();
      if (!this.isWithinLookback(receivedAt) || msg.uid == null) {
        continue;
      }
      rows.push({ uid: msg.uid, subject, receivedAt });
    }

    rows.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());

    for (const row of rows) {
      const { uid, subject, receivedAt } = row;
      const parsed = this.parseEmailForImport(subject);
      if (!parsed) {
        skippedSubject += 1;
        this.logger.debug(
          `Skip Viator email (unrecognized subject): uid=${uid} subject=${subject.slice(0, 120)}`,
        );
        continue;
      }

      if (!parsed.isTestBooking) {
        if (processedRefs.has(parsed.viatorReference)) {
          skippedDuplicate += 1;
          this.logger.debug(
            `Skip duplicate in batch: ${parsed.viatorReference}`,
          );
          continue;
        }
      }

      const earlyDuplicate = await this.withDbConnection(async () => {
        if (parsed.isTestBooking) {
          return (await this.isDuplicateTestImapUid(uid)) ? 'test_uid' : null;
        }
        if (await this.isDuplicateViatorReference(parsed.viatorReference)) {
          await this.logDuplicateViatorSkip(parsed.viatorReference);
          return 'reference';
        }
        return null;
      });
      if (earlyDuplicate === 'test_uid') {
        skippedDuplicate += 1;
        this.logger.log(
          `Skip test email (already imported for IMAP uid=${uid})`,
        );
        continue;
      }
      if (earlyDuplicate === 'reference') {
        skippedDuplicate += 1;
        continue;
      }

      const outcome = await this.processViatorEmail(client, {
        uid,
        subject: subject.trim(),
        parsed,
        receivedAt,
        isTestBooking: parsed.isTestBooking,
      });

      if (outcome === 'duplicate') {
        skippedDuplicate += 1;
        this.logger.log(
          `Skip duplicate after import attempt: ${parsed.viatorReference}`,
        );
      } else if (outcome === 'ignored_product') {
        skippedProduct += 1;
      } else if (outcome === null) {
        failedImport += 1;
      } else if (outcome?.dto) {
        if (!parsed.isTestBooking) {
          processedRefs.add(parsed.viatorReference);
        }
        notifications.push(outcome.dto);
        added += 1;
        this.logger.log(
          parsed.isTestBooking
            ? `Viator test booking: ${parsed.viatorReference}`
            : `New Viator booking: ${parsed.viatorReference}`,
        );
      }
    }

    return {
      added,
      scanned,
      skippedDuplicate,
      skippedProduct,
      skippedSubject,
      failedImport,
      lookbackHours: VIATOR_INBOX_LOOKBACK_HOURS,
      notifications,
    };
  }

  private async processViatorEmail(
    client: ImapFlow,
    input: {
      uid: number;
      subject: string;
      parsed: { viatorReference: string; pickupDateLabel: string };
      receivedAt: Date;
      isTestBooking?: boolean;
    },
  ): Promise<
    { dto: ViatorNotificationDto } | 'duplicate' | 'ignored_product' | null
  > {
    const { parsed } = input;

    const source = await this.fetchEmailSourceFromUid(client, input.uid);
    if (!source) {
      this.logger.warn(
        `Viator import skipped (no email body): uid=${input.uid}`,
      );
      return null;
    }

    let viatorReference = parsed.viatorReference;
    if (input.isTestBooking) {
      const fromBody = await parseViatorBookingReferenceFromBody(source, {
        allowTestMarker: true,
      });
      if (!fromBody) {
        this.logger.warn(
          `Viator test import skipped (no Booking Reference in body): uid=${input.uid}`,
        );
        return null;
      }
      viatorReference = fromBody;
      parsed.viatorReference = fromBody;
    }

    const details = await parseViatorEmailBody(source);

    if (!input.isTestBooking) {
      const fromBody = await parseViatorBookingReferenceFromBody(source);
      if (fromBody) {
        viatorReference = fromBody;
        parsed.viatorReference = fromBody;
      }
    }

    if (!isAllowedViatorProductCode(details.productCode)) {
      this.logger.log(
        `Skip Viator email (product not allowed): ${details.productCode ?? 'missing'} ref=${viatorReference} uid=${input.uid}`,
      );
      return 'ignored_product';
    }

    return this.withDbConnection(async () => {
      if (input.isTestBooking) {
        if (await this.isDuplicateTestImapUid(input.uid)) {
          return 'duplicate' as const;
        }
      } else if (await this.isDuplicateViatorReference(viatorReference)) {
        return 'duplicate' as const;
      }

      const persist = await this.persistViatorBooking({
        viatorReference,
        pickupDateLabel: parsed.pickupDateLabel,
        details,
        isTestBooking: input.isTestBooking,
      });
      if (persist.error) {
        this.logger.warn(
          `Viator import failed for ${viatorReference}: ${persist.error}`,
        );
        return null;
      }
      if (!persist.savedToDb && !persist.alreadyInDatabase) {
        return null;
      }
      if (!persist.savedToDb && persist.alreadyInDatabase) {
        return 'duplicate' as const;
      }

      const entry: PendingEntry = {
        id: randomUUID(),
        subject: input.subject,
        viatorReference,
        pickupDateLabel: parsed.pickupDateLabel,
        receivedAt: input.receivedAt.toISOString(),
        imapUid: input.uid,
        isTestBooking: input.isTestBooking,
        ...mergeBookingFields(details),
      };

      const dto = await this.createAlertForNewBooking(
        entry,
        persist.bookingUuid,
      );
      if (!dto) {
        return 'duplicate' as const;
      }

      return { dto };
    });
  }
}

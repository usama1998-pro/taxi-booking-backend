import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { hashPassword } from '../../common/utils/password.util';
import { PrismaService } from '../../core/database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { getBookingListScheduledDayBounds } from './booking-list-scheduled-bounds';
import {
  assertPickupNotInPast,
  getBookingTimeZone,
  parseScheduledTime,
} from './booking-scheduled-time';
import { scheduledCalendarDayBounds } from './booking-zoned-time';
import { calculateBookingPrice } from './booking-pricing';
import { CreateBookingDto } from './dto/create-booking.dto';
import {
  BookingTimeScope,
  ListBookingsQueryDto,
} from './dto/list-bookings-query.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { MailService } from '../mail/mail.service';
import { RoutingService } from '../routing/routing.service';
import { activeBookingWhere } from './booking-active.where';
import {
  bookingReferenceSearchLikePattern,
  displayBookingReference,
  normalizeBookingReference,
  reservedBookingReferenceWhere,
  trashedBookingReference,
} from './booking-reference.where';
import { trashedBookingWhere } from './booking-trash.where';
import {
  BOOKING_TRASH_PURGE_BATCH_SIZE,
  bookingTrashRetentionDays,
} from './booking-trash.constants';

const bookingInclude = {
  user: {
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      createdAt: true,
    },
  },
  driver: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      photoUrl: true,
      isAvailable: true,
      isActive: true,
    },
  },
} satisfies Prisma.BookingInclude;

type BookingWithRelations = Prisma.BookingGetPayload<{
  include: typeof bookingInclude;
}>;

/** Booking JSON for APIs: no internal `id` or trash metadata; clients use `uuid`. */
export type BookingPublic = Omit<BookingWithRelations, 'id' | 'deletedAt'>;

export type PaginatedBookings = {
  data: BookingPublic[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

/** Trashed booking row for admin/dispatcher trash list. */
export type BookingTrashPublic = BookingPublic & { deletedAt: string };

export type PaginatedTrashBookings = {
  data: BookingTrashPublic[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type ClearTrashResult = {
  purged: number;
  uuids: string[];
  remainingInTrash: number;
};

export type BookingCreateResult = BookingPublic & {
  assignmentMessage: string;
  notifications: {
    customerEmailSent: boolean;
    ownerEmailSent: boolean;
  };
};

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly routing: RoutingService,
  ) {}
  private readonly logger = new Logger(BookingsService.name);

  private extractLocationLabel(location: Record<string, unknown>): string | null {
    const label = location.label;
    if (typeof label === 'string' && label.trim()) {
      return label.trim();
    }
    return null;
  }

  private async resolveBookingDistanceKm(
    pickupLocation: Record<string, unknown>,
    dropoffLocation: Record<string, unknown>,
  ): Promise<number | undefined> {
    const from = this.extractLocationLabel(pickupLocation);
    const to = this.extractLocationLabel(dropoffLocation);
    if (!from || !to) {
      return undefined;
    }
    try {
      return await this.routing.getDrivingDistanceKm(from, to);
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : 'Distance lookup failed';
      this.logger.warn(`Booking distance lookup failed: ${detail}`);
      return undefined;
    }
  }

  private viatorReferencesForBooking(bookingReference: string): string[] {
    const refs = new Set<string>([
      bookingReference,
      normalizeBookingReference(bookingReference),
    ]);
    const trashIdx = bookingReference.toLowerCase().indexOf('#trash-');
    if (trashIdx > 0) {
      refs.add(normalizeBookingReference(bookingReference.slice(0, trashIdx)));
    }
    return [...refs];
  }

  /** Active or trashed row for a reference (used by Viator idempotency). */
  async findReservedBookingByReference(
    bookingReference: string,
  ): Promise<{ uuid: string; deletedAt: Date | null } | null> {
    const ref = normalizeBookingReference(bookingReference);
    if (!ref) {
      return null;
    }
    const row = await this.prisma.booking.findFirst({
      where: reservedBookingReferenceWhere(ref),
      select: { uuid: true, deletedAt: true },
      orderBy: [{ deletedAt: 'asc' }],
    });
    return row ?? null;
  }

  /** Active booking or trashed row with the same reference (blocks re-use until purge). */
  async isBookingReferenceReserved(
    bookingReference: string,
    excludeUuid?: string,
  ): Promise<boolean> {
    const ref = normalizeBookingReference(bookingReference);
    if (!ref) {
      return false;
    }
    const row = await this.prisma.booking.findFirst({
      where: {
        ...reservedBookingReferenceWhere(ref),
        ...(excludeUuid ? { uuid: { not: excludeUuid } } : {}),
      },
      select: { id: true },
    });
    return Boolean(row);
  }

  private async isBookingReferenceReservedInTx(
    tx: Prisma.TransactionClient,
    bookingReference: string,
  ): Promise<boolean> {
    const ref = normalizeBookingReference(bookingReference);
    if (!ref) {
      return false;
    }
    const row = await tx.booking.findFirst({
      where: reservedBookingReferenceWhere(ref),
      select: { id: true },
    });
    return Boolean(row);
  }

  private async findActiveBookingByUuid(
    uuid: string,
  ): Promise<BookingWithRelations | null> {
    return this.prisma.booking.findFirst({
      where: { uuid, ...activeBookingWhere },
      include: bookingInclude,
    });
  }

  /**
   * Partial ref search via raw SQL — Prisma `contains` triggers
   * `Illegal mix of collations` on MariaDB/MySQL production hosts.
   */
  private async bookingIdsForReferenceSearch(
    rawQuery: string,
  ): Promise<string[] | null> {
    const pattern = bookingReferenceSearchLikePattern(rawQuery);
    if (!pattern) {
      return null;
    }
    const rows = await this.prisma.$queryRaw<{ id: string }[]>(
      Prisma.sql`
        SELECT id
        FROM Booking
        WHERE deleted_at IS NULL
          AND booking_reference COLLATE utf8mb4_unicode_ci
            LIKE ${pattern} COLLATE utf8mb4_unicode_ci
      `,
    );
    return rows.map((row) => row.id);
  }

  private async hardDeleteBookingInTx(
    tx: Prisma.TransactionClient,
    booking: Pick<
      BookingWithRelations,
      'uuid' | 'bookingReference' | 'driverId'
    >,
  ): Promise<void> {
    const viatorRefs = this.viatorReferencesForBooking(booking.bookingReference);
    await tx.viatorAlert.deleteMany({
      where: {
        OR: [
          { bookingUuid: booking.uuid },
          { viatorReference: { in: viatorRefs } },
        ],
      },
    });
    await tx.booking.delete({ where: { uuid: booking.uuid } });
    if (booking.driverId) {
      const remaining = await tx.booking.count({
        where: { driverId: booking.driverId, ...activeBookingWhere },
      });
      if (remaining === 0) {
        await tx.driver.update({
          where: { id: booking.driverId },
          data: { isAvailable: true },
        });
      }
    }
  }

  private async allocateBookingReference(
    tx: Prisma.TransactionClient,
    requested?: string | null,
  ): Promise<string> {
    const trimmed = requested?.trim();
    if (trimmed) {
      const normalized = normalizeBookingReference(trimmed);
      if (await this.isBookingReferenceReservedInTx(tx, normalized)) {
        throw new BadRequestException('That booking reference is already in use');
      }
      return normalized;
    }
    for (let i = 0; i < 24; i++) {
      const candidate = `BK-${randomBytes(4).toString('hex').toUpperCase()}`;
      if (!(await this.isBookingReferenceReservedInTx(tx, candidate))) {
        return candidate;
      }
    }
    throw new InternalServerErrorException('Could not allocate booking reference');
  }

  private async resolveOrCreatePublicBookingUserId(
    dto: CreateBookingDto,
  ): Promise<string> {
    const name = dto.customerName?.trim();
    const email = dto.customerEmail?.trim().toLowerCase();
    const phone = dto.customerPhone?.trim();

    if (!name || !email || !phone) {
      throw new BadRequestException(
        'customerName, customerEmail, and customerPhone are required for public booking creation',
      );
    }

    const byEmail = await this.prisma.user.findUnique({ where: { email } });
    if (byEmail) {
      const isViatorGuest =
        email.startsWith('viator.') && email.endsWith('@taxibarcelona24.guest');
      if (isViatorGuest && name !== byEmail.fullName) {
        await this.prisma.user.update({
          where: { id: byEmail.id },
          data: { fullName: name, phone },
        });
      }
      return byEmail.id;
    }
    const byPhone = await this.prisma.user.findUnique({ where: { phone } });
    if (byPhone) {
      return byPhone.id;
    }

    const created = await this.prisma.user.create({
      data: {
        fullName: name,
        email,
        phone,
        password: await hashPassword(randomUUID()),
        isAdmin: false,
      },
      select: { id: true },
    });
    return created.id;
  }

  private toPublicBooking(row: BookingWithRelations): BookingPublic {
    const { id: _id, deletedAt: _deletedAt, ...rest } = row;
    void _id;
    void _deletedAt;
    return {
      ...rest,
      bookingReference: displayBookingReference(rest.bookingReference),
    };
  }

  private toPublicTrashBooking(row: BookingWithRelations): BookingTrashPublic {
    return {
      ...this.toPublicBooking(row),
      deletedAt: row.deletedAt?.toISOString() ?? new Date(0).toISOString(),
    };
  }

  private trashPurgeWhere(): Prisma.BookingWhereInput {
    const retentionDays = bookingTrashRetentionDays();
    if (retentionDays > 0) {
      const deletedBefore = new Date(
        Date.now() - retentionDays * 24 * 60 * 60 * 1000,
      );
      return {
        deletedAt: { not: null, lt: deletedBefore },
      };
    }
    return { ...trashedBookingWhere };
  }

  private assertCanViewBooking(
    booking: BookingWithRelations,
    requester: AuthenticatedUser,
  ): void {
    if (requester.is_admin) {
      return;
    }
    if (requester.typ === 'user') {
      if (booking.userId !== requester.sub) {
        throw new ForbiddenException('You may only view your own bookings');
      }
      return;
    }
    // Driver app works in dispatcher mode now: drivers can view all bookings.
    return;
  }

  private assertCanModifyBooking(
    booking: BookingWithRelations,
    requester: AuthenticatedUser,
  ): void {
    if (requester.is_admin) {
      return;
    }
    if (requester.typ === 'user') {
      if (booking.userId !== requester.sub) {
        throw new ForbiddenException('You may only update your own bookings');
      }
      return;
    }
    // Driver app works in dispatcher mode now: drivers can update all bookings.
    return;
  }

  private assertCanDeleteBooking(
    booking: BookingWithRelations,
    requester: AuthenticatedUser,
  ): void {
    if (requester.is_admin) {
      return;
    }
    if (requester.typ === 'driver') {
      // Driver app works in dispatcher mode now: drivers can remove reservations.
      return;
    }
    if (booking.userId !== requester.sub) {
      throw new ForbiddenException('You may only delete your own bookings');
    }
  }

  /**
   * Finds a booking by reference on active rows or trash (same table).
   * Used for Viator idempotency — a trashed reference still counts as existing.
   */
  async findByBookingReference(
    bookingReference: string,
  ): Promise<BookingPublic | null> {
    const ref = normalizeBookingReference(bookingReference);
    if (!ref) {
      return null;
    }
    const booking = await this.prisma.booking.findFirst({
      where: reservedBookingReferenceWhere(ref),
      include: bookingInclude,
      orderBy: [{ deletedAt: 'asc' }],
    });
    return booking ? this.toPublicBooking(booking) : null;
  }

  /**
   * Idempotent: returns existing booking if reference already saved.
   * Skips confirmation emails (Viator already notified the partner).
   */
  async createFromViator(
    dto: CreateBookingDto,
  ): Promise<{ booking: BookingPublic; created: boolean }> {
    const ref = dto.bookingReference
      ? normalizeBookingReference(dto.bookingReference)
      : '';
    if (ref) {
      const existing = await this.findByBookingReference(ref);
      if (existing) {
        return { booking: existing, created: false };
      }
    }
    try {
      const viatorUserId = await this.resolveViatorBookingUserId();
      const created = await this.create({ ...dto, userId: viatorUserId });
      return { booking: created, created: true };
    } catch (err) {
      if (ref) {
        const duplicate =
          (err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === 'P2002') ||
          (err instanceof BadRequestException &&
            String(err.message).includes('already in use'));
        if (duplicate) {
          const existing = await this.findByBookingReference(ref);
          if (existing) {
            return { booking: existing, created: false };
          }
        }
      }
      throw err;
    }
  }

  /**
   * Viator imports must not create passenger users. They are attached to an existing
   * staff account so `create()` skips `resolveOrCreatePublicBookingUserId()`.
   */
  private isAppGuestBookingEmail(email: string | undefined): boolean {
    const normalized = email?.trim().toLowerCase() ?? '';
    return normalized.startsWith('guest.') && normalized.endsWith('@taxibarcelona24.guest');
  }

  private isViatorEmailImport(dto: CreateBookingDto): boolean {
    if (this.isAppGuestBookingEmail(dto.customerEmail)) {
      return false;
    }
    const ref = dto.bookingReference?.trim() ?? '';
    if (ref.startsWith('BR-')) {
      return true;
    }
    const email = dto.customerEmail?.trim().toLowerCase() ?? '';
    if (email.startsWith('viator.')) {
      return true;
    }
    const note = dto.note?.trim() ?? '';
    return note.startsWith('[Viator');
  }

  /** App and Viator imports skip outbound booking emails (driver/Viator already has the details). */
  private shouldSkipBookingEmails(dto: CreateBookingDto): boolean {
    return (
      this.isAppGuestBookingEmail(dto.customerEmail) ||
      this.isViatorEmailImport(dto)
    );
  }

  private async resolveViatorBookingUserId(): Promise<string> {
    const configuredStaffEmail = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
    if (configuredStaffEmail) {
      const configuredStaff = await this.prisma.user.findUnique({
        where: { email: configuredStaffEmail },
        select: { id: true, isAdmin: true },
      });
      if (configuredStaff?.isAdmin) {
        return configuredStaff.id;
      }
      this.logger.warn(
        `SUPER_ADMIN_EMAIL is set but not a staff user in DB: ${configuredStaffEmail}`,
      );
    }

    const anyStaff = await this.prisma.user.findFirst({
      where: { isAdmin: true },
      select: { id: true, email: true },
      orderBy: { createdAt: 'asc' },
    });
    if (anyStaff) {
      this.logger.warn(
        `Viator import fallback: using staff user ${anyStaff.email} as booking owner`,
      );
      return anyStaff.id;
    }

    throw new InternalServerErrorException(
      'Cannot save Viator booking: no staff user found to attach booking owner.',
    );
  }

  async create(dto: CreateBookingDto): Promise<BookingCreateResult> {
    const isViatorImport = this.isViatorEmailImport(dto);
    const userId =
      dto.userId ??
      (isViatorImport
        ? await this.resolveViatorBookingUserId()
        : await this.resolveOrCreatePublicBookingUserId(dto));
    const infantCarrierCount = dto.infantCarrierCount ?? 0;
    const childSeatCount = dto.childSeatCount ?? 0;
    const boosterCount = dto.boosterCount ?? 0;
    const distanceKm = await this.resolveBookingDistanceKm(
      dto.pickupLocation,
      dto.dropoffLocation,
    );
    const computedPrice = calculateBookingPrice({
      passengerCount: dto.passengerCount,
      luggageCount: dto.luggageCount,
      infantCarrierCount,
      childSeatCount,
      boosterCount,
      isReturnTrip: Boolean(dto.returnTime),
      distanceKm,
    });

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    const scheduledTime = parseScheduledTime(dto.scheduledTime);
    assertPickupNotInPast(scheduledTime);

    let driverId: string | undefined;
    if (dto.driverId) {
      const driver = await this.prisma.driver.findUnique({
        where: { id: dto.driverId },
        select: { id: true, isActive: true },
      });
      if (!driver) {
        throw new NotFoundException(`Driver ${dto.driverId} not found`);
      }
      if (!driver.isActive) {
        throw new BadRequestException(`Driver ${dto.driverId} account is disabled`);
      }
      driverId = driver.id;
    }

    const created = await this.prisma.$transaction(
      async (tx) => {
        const bookingReference = await this.allocateBookingReference(
          tx,
          dto.bookingReference,
        );

        const createdBooking = await tx.booking.create({
          data: {
            userId,
            driverId,
            bookingReference,
            customerName: dto.customerName,
            customerEmail: dto.customerEmail,
            customerPhone: dto.customerPhone,
            flightNumber: dto.flightNumber,
            returnTime: dto.returnTime ? new Date(dto.returnTime) : undefined,
            pickupLocation: dto.pickupLocation as Prisma.InputJsonValue,
            dropoffLocation: dto.dropoffLocation as Prisma.InputJsonValue,
            scheduledTime: new Date(dto.scheduledTime),
            price: computedPrice,
            status: dto.status,
            luggageCount: dto.luggageCount,
            passengerCount: dto.passengerCount,
            infantCarrierCount,
            childSeatCount,
            boosterCount,
            note: dto.note,
          },
          include: bookingInclude,
        });
        return createdBooking;
      },
    );

    // Reload from DB so nested `driver` matches persisted rows (not stale relation snapshots).
    const persisted = await this.prisma.booking.findUnique({
      where: { uuid: created.uuid },
      include: bookingInclude,
    });
    if (!persisted) {
      throw new InternalServerErrorException('Booking was not persisted');
    }

    const publicBooking = this.toPublicBooking(persisted);
    const skipEmails = this.shouldSkipBookingEmails(dto);
    let notifications = { customerEmailSent: false, ownerEmailSent: false };
    if (!skipEmails) {
      try {
        notifications = await this.mailService.sendBookingEmails(publicBooking);
      } catch (err) {
        this.logger.warn(
          `Booking ${publicBooking.uuid}: confirmation emails failed`,
          err instanceof Error ? err.stack : err,
        );
      }
    }

    return {
      ...publicBooking,
      assignmentMessage: 'Booking created successfully.',
      notifications,
    };
  }

  /** Public booking lookup by uuid (no auth) — used by mail endpoints. */
  async findOnePublicByUuid(uuid: string): Promise<BookingPublic> {
    const booking = await this.findActiveBookingByUuid(uuid);
    if (!booking) {
      throw new NotFoundException(`Booking ${uuid} not found`);
    }
    return this.toPublicBooking(booking);
  }

  async findAll(
    _requester: AuthenticatedUser,
    query: ListBookingsQueryDto,
  ): Promise<PaginatedBookings> {
    const baseWhere: Prisma.BookingWhereInput = { ...activeBookingWhere };

    const terminalOr: Prisma.BookingWhereInput = {
      OR: [
        { status: 'completed' },
        { status: 'cancelled' },
        { status: 'canceled' },
      ],
    };

    const notTerminal: Prisma.BookingWhereInput = { NOT: terminalOr };

    const scheduledDayFilter = query.scheduledOn
      ? (() => {
          const { start, end } = scheduledCalendarDayBounds(
            query.scheduledOn,
            getBookingTimeZone(),
          );
          return { scheduledTime: { gte: start, lt: end } } satisfies Prisma.BookingWhereInput;
        })()
      : null;

    const refSearchIds = query.bookingReference
      ? await this.bookingIdsForReferenceSearch(query.bookingReference)
      : null;

    let where: Prisma.BookingWhereInput = baseWhere;
    let orderBy: Prisma.BookingOrderByWithRelationInput | Prisma.BookingOrderByWithRelationInput[] =
      { createdAt: 'desc' };

    if (refSearchIds !== null) {
      const idFilter: Prisma.BookingWhereInput =
        refSearchIds.length > 0
          ? { id: { in: refSearchIds } }
          : { id: '__booking_ref_search_no_match__' };
      where = {
        AND: [
          baseWhere,
          idFilter,
          ...(scheduledDayFilter ? [scheduledDayFilter] : []),
        ],
      };
      orderBy = { scheduledTime: 'desc' };
    } else if (query.timeScope === BookingTimeScope.Past) {
      const { startOfToday } = getBookingListScheduledDayBounds();
      where = {
        AND: [
          baseWhere,
          {
            OR: [
              terminalOr,
              {
                AND: [
                  notTerminal,
                  { scheduledTime: { lt: startOfToday } },
                ],
              },
            ],
          },
          ...(scheduledDayFilter ? [scheduledDayFilter] : []),
        ],
      };
      orderBy = [
        { completedAt: { sort: 'desc', nulls: 'last' } },
        { scheduledTime: 'desc' },
        { createdAt: 'desc' },
      ];
    } else if (query.timeScope === BookingTimeScope.Current) {
      if (scheduledDayFilter) {
        /** Date search: all open trips on that calendar day (not only "today"). */
        where = { AND: [baseWhere, notTerminal, scheduledDayFilter] };
      } else {
        /** Open bookings due today (local TZ). */
        const { startOfToday, startOfTomorrow } = getBookingListScheduledDayBounds();
        where = {
          AND: [
            baseWhere,
            notTerminal,
            {
              scheduledTime: { gte: startOfToday, lt: startOfTomorrow },
            },
          ],
        };
      }
      orderBy = { scheduledTime: 'asc' };
    } else if (query.timeScope === BookingTimeScope.Upcoming) {
      if (scheduledDayFilter) {
        /** Date search: trips on that day even when it is today or earlier than "tomorrow". */
        where = { AND: [baseWhere, notTerminal, scheduledDayFilter] };
      } else {
        /** Open bookings from tomorrow onward (local TZ). */
        const { startOfTomorrow } = getBookingListScheduledDayBounds();
        where = {
          AND: [
            baseWhere,
            notTerminal,
            { scheduledTime: { gte: startOfTomorrow } },
          ],
        };
      }
      orderBy = { scheduledTime: 'asc' };
    } else if (scheduledDayFilter) {
      where = { AND: [baseWhere, scheduledDayFilter] };
      orderBy = { scheduledTime: 'asc' };
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        include: bookingInclude,
      }),
    ]);

    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

    return {
      data: rows.map((b) => this.toPublicBooking(b)),
      page,
      pageSize,
      total,
      totalPages,
    };
  }

  async findTrash(
    _requester: AuthenticatedUser,
    query: ListBookingsQueryDto,
  ): Promise<PaginatedTrashBookings> {
    const where: Prisma.BookingWhereInput = { ...trashedBookingWhere };
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({
        where,
        orderBy: { deletedAt: 'desc' },
        skip,
        take: pageSize,
        include: bookingInclude,
      }),
    ]);

    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

    return {
      data: rows.map((b) => this.toPublicTrashBooking(b)),
      page,
      pageSize,
      total,
      totalPages,
    };
  }

  async findOne(
    uuid: string,
    requester: AuthenticatedUser,
  ): Promise<BookingPublic> {
    const booking = await this.findActiveBookingByUuid(uuid);
    if (!booking) {
      throw new NotFoundException(`Booking ${uuid} not found`);
    }
    this.assertCanViewBooking(booking, requester);
    return this.toPublicBooking(booking);
  }

  async update(
    uuid: string,
    dto: UpdateBookingDto,
    requester: AuthenticatedUser,
  ): Promise<BookingPublic> {
    const booking = await this.prisma.booking.findUnique({
      where: { uuid },
      include: bookingInclude,
    });
    if (!booking) {
      throw new NotFoundException(`Booking ${uuid} not found`);
    }
    this.assertCanModifyBooking(booking, requester);

    const data: Prisma.BookingUpdateInput = {};
    const d = dto as UpdateBookingDto & { driverId?: string | null };

    if (d.userId !== undefined) {
      if (requester.typ === 'driver') {
        throw new ForbiddenException('Drivers cannot reassign the passenger');
      }
      if (
        requester.typ === 'user' &&
        !requester.is_admin &&
        d.userId !== requester.sub
      ) {
        throw new ForbiddenException(
          'You may only keep bookings on your own account',
        );
      }
      const user = await this.prisma.user.findUnique({
        where: { id: d.userId },
      });
      if (!user) {
        throw new NotFoundException(`User ${d.userId} not found`);
      }
      data.user = { connect: { id: d.userId } };
    }
    if (d.driverId === null) {
      if (requester.typ === 'driver') {
        throw new ForbiddenException('Drivers cannot unassign themselves here');
      }
      data.driver = { disconnect: true };
    } else if (d.driverId !== undefined) {
      const driver = await this.prisma.driver.findUnique({
        where: { id: d.driverId },
      });
      if (!driver) {
        throw new NotFoundException(`Driver ${d.driverId} not found`);
      }
      if (!driver.isActive) {
        throw new BadRequestException(
          `Driver ${d.driverId} account is disabled`,
        );
      }
      data.driver = { connect: { id: d.driverId } };
    }
    if (d.pickupLocation !== undefined) {
      data.pickupLocation = d.pickupLocation as Prisma.InputJsonValue;
    }
    if (d.dropoffLocation !== undefined) {
      data.dropoffLocation = d.dropoffLocation as Prisma.InputJsonValue;
    }
    if (d.scheduledTime !== undefined) {
      const nextScheduled = parseScheduledTime(d.scheduledTime);
      assertPickupNotInPast(nextScheduled);
      data.scheduledTime = nextScheduled;
    }
    const nextPassengerCount = d.passengerCount ?? booking.passengerCount;
    const nextLuggageCount = d.luggageCount ?? booking.luggageCount;
    const nextInfantCarrierCount =
      d.infantCarrierCount ?? booking.infantCarrierCount;
    const nextChildSeatCount = d.childSeatCount ?? booking.childSeatCount;
    const nextBoosterCount = d.boosterCount ?? booking.boosterCount;
    const nextReturnTime =
      d.returnTime !== undefined
        ? d.returnTime
          ? new Date(d.returnTime)
          : null
        : booking.returnTime;

    const seatsOrTripCountsChanged =
      d.passengerCount !== undefined ||
      d.luggageCount !== undefined ||
      d.infantCarrierCount !== undefined ||
      d.childSeatCount !== undefined ||
      d.boosterCount !== undefined ||
      d.returnTime !== undefined ||
      d.pickupLocation !== undefined ||
      d.dropoffLocation !== undefined;

    if (d.price !== undefined) {
      data.price = d.price;
    } else if (seatsOrTripCountsChanged) {
      const pickupLocation = (d.pickupLocation ??
        booking.pickupLocation) as Record<string, unknown>;
      const dropoffLocation = (d.dropoffLocation ??
        booking.dropoffLocation) as Record<string, unknown>;
      const distanceKm = await this.resolveBookingDistanceKm(
        pickupLocation,
        dropoffLocation,
      );
      data.price = calculateBookingPrice({
        passengerCount: nextPassengerCount,
        luggageCount: nextLuggageCount,
        infantCarrierCount: nextInfantCarrierCount,
        childSeatCount: nextChildSeatCount,
        boosterCount: nextBoosterCount,
        isReturnTrip: Boolean(nextReturnTime),
        distanceKm,
      });
    }
    if (d.status !== undefined) {
      const nextRaw = String(d.status).trim();
      const nextLower = nextRaw.toLowerCase();
      const curLower = booking.status.toLowerCase();
      const alreadyTerminal =
        curLower === 'completed' ||
        curLower === 'cancelled' ||
        curLower === 'canceled';
      if (alreadyTerminal) {
        throw new BadRequestException('Cannot change status of a closed booking');
      }
      if (requester.typ === 'driver') {
        if (nextLower === 'completed') {
          if (curLower !== 'in_progress') {
            throw new BadRequestException(
              'Start the ride before marking it complete',
            );
          }
          data.status = 'completed';
          data.completedAt = new Date();
        } else if (nextLower === 'in_progress') {
          data.status = 'in_progress';
        } else {
          throw new ForbiddenException(
            'Drivers may only start a ride (in progress) or mark it complete',
          );
        }
      } else {
        data.status = nextRaw;
        if (nextLower === 'completed') {
          data.completedAt = new Date();
        } else if (nextLower === 'cancelled' || nextLower === 'canceled') {
          data.completedAt = null;
        }
      }
    }
    if (d.luggageCount !== undefined) {
      data.luggageCount = d.luggageCount;
    }
    if (d.passengerCount !== undefined) {
      data.passengerCount = d.passengerCount;
    }
    if (d.infantCarrierCount !== undefined) {
      data.infantCarrierCount = d.infantCarrierCount;
    }
    if (d.childSeatCount !== undefined) {
      data.childSeatCount = d.childSeatCount;
    }
    if (d.boosterCount !== undefined) {
      data.boosterCount = d.boosterCount;
    }
    if (d.note !== undefined) {
      data.note = d.note;
    }
    if (d.customerName !== undefined) {
      data.customerName = d.customerName;
    }
    if (d.customerEmail !== undefined) {
      data.customerEmail = d.customerEmail;
    }
    if (d.customerPhone !== undefined) {
      data.customerPhone = d.customerPhone;
    }
    if (d.flightNumber !== undefined) {
      data.flightNumber = d.flightNumber;
    }
    if (d.returnTime !== undefined) {
      data.returnTime = d.returnTime ? new Date(d.returnTime) : null;
    }
    if (d.bookingReference !== undefined) {
      if (requester.typ === 'driver') {
        throw new ForbiddenException('Drivers cannot change booking reference');
      }
      const ref = d.bookingReference?.trim();
      if (!ref) {
        throw new BadRequestException('bookingReference cannot be empty');
      }
      if (await this.isBookingReferenceReserved(ref, uuid)) {
        throw new BadRequestException('That booking reference is already in use');
      }
      data.bookingReference = ref;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update');
    }

    const becameCompleted =
      typeof data.status === 'string' && data.status.toLowerCase() === 'completed';

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.booking.update({
        where: { uuid },
        data,
        include: bookingInclude,
      });

      if (becameCompleted && booking.driverId) {
        const activeOther = await tx.booking.count({
          where: {
            driverId: booking.driverId,
            uuid: { not: uuid },
            ...activeBookingWhere,
            NOT: {
              OR: [
                { status: 'completed' },
                { status: 'cancelled' },
                { status: 'canceled' },
              ],
            },
          },
        });
        if (activeOther === 0) {
          await tx.driver.update({
            where: { id: booking.driverId },
            data: { isAvailable: true },
          });
        }
      }

      return row;
    });

    return this.toPublicBooking(updated);
  }

  async completeReservation(
    uuid: string,
    requester: AuthenticatedUser,
  ): Promise<BookingPublic> {
    const booking = await this.findActiveBookingByUuid(uuid);
    if (!booking) {
      throw new NotFoundException(`Booking ${uuid} not found`);
    }
    this.assertCanModifyBooking(booking, requester);

    const curLower = booking.status.toLowerCase();
    if (
      curLower === 'completed' ||
      curLower === 'cancelled' ||
      curLower === 'canceled'
    ) {
      throw new BadRequestException('Cannot complete a closed booking');
    }

    const updated = await this.prisma.booking.update({
      where: { uuid },
      data: { status: 'completed', completedAt: new Date() },
      include: bookingInclude,
    });
    return this.toPublicBooking(updated);
  }

  async remove(
    uuid: string,
    requester: AuthenticatedUser,
  ): Promise<{ success: true; message: string; uuid: string }> {
    const booking = await this.findActiveBookingByUuid(uuid);
    if (!booking) {
      throw new NotFoundException(`Booking ${uuid} not found`);
    }
    this.assertCanDeleteBooking(booking, requester);

    const driverId = booking.driverId;
    const originalReference = booking.bookingReference;
    const trashedReference = trashedBookingReference(originalReference, uuid);
    const viatorRefs = this.viatorReferencesForBooking(originalReference);

    await this.prisma.$transaction(async (tx) => {
      await tx.viatorAlert.updateMany({
        where: {
          OR: [
            { bookingUuid: uuid },
            { viatorReference: { in: viatorRefs } },
          ],
        },
        data: { dismissedAt: new Date() },
      });
      await tx.booking.update({
        where: { uuid },
        data: {
          deletedAt: new Date(),
          bookingReference: trashedReference,
        },
      });
      if (driverId) {
        const remaining = await tx.booking.count({
          where: { driverId, ...activeBookingWhere },
        });
        if (remaining === 0) {
          await tx.driver.update({
            where: { id: driverId },
            data: { isAvailable: true },
          });
        }
      }
    });

    return {
      success: true,
      message: 'Booking moved to trash.',
      uuid,
    };
  }

  /**
   * Permanently deletes up to {@link BOOKING_TRASH_PURGE_BATCH_SIZE} trashed bookings
   * (oldest first). Intended for an external scheduler — same pattern as Viator inbox check.
   */
  async purgeTrashBatch(): Promise<{
    purged: number;
    batchSize: number;
    uuids: string[];
    remainingInTrash: number;
  }> {
    const where = this.trashPurgeWhere();

    const candidates = await this.prisma.booking.findMany({
      where,
      orderBy: { deletedAt: 'asc' },
      take: BOOKING_TRASH_PURGE_BATCH_SIZE,
      select: {
        uuid: true,
        bookingReference: true,
        driverId: true,
      },
    });

    if (candidates.length === 0) {
      const remainingInTrash = await this.prisma.booking.count({ where });
      return {
        purged: 0,
        batchSize: BOOKING_TRASH_PURGE_BATCH_SIZE,
        uuids: [],
        remainingInTrash,
      };
    }

    await this.prisma.$transaction(async (tx) => {
      for (const row of candidates) {
        await this.hardDeleteBookingInTx(tx, row);
      }
    });

    const remainingInTrash = await this.prisma.booking.count({ where });

    this.logger.log(
      `Trash purge batch: removed ${candidates.length} booking(s); ${remainingInTrash} still in trash`,
    );

    return {
      purged: candidates.length,
      batchSize: BOOKING_TRASH_PURGE_BATCH_SIZE,
      uuids: candidates.map((r) => r.uuid),
      remainingInTrash,
    };
  }

  /** Permanently deletes all eligible trashed bookings (flush trash). */
  async clearTrash(): Promise<ClearTrashResult> {
    const where = this.trashPurgeWhere();
    const candidates = await this.prisma.booking.findMany({
      where,
      orderBy: { deletedAt: 'asc' },
      select: {
        uuid: true,
        bookingReference: true,
        driverId: true,
      },
    });

    if (candidates.length === 0) {
      return { purged: 0, uuids: [], remainingInTrash: 0 };
    }

    const uuids: string[] = [];
    for (let i = 0; i < candidates.length; i += BOOKING_TRASH_PURGE_BATCH_SIZE) {
      const chunk = candidates.slice(i, i + BOOKING_TRASH_PURGE_BATCH_SIZE);
      await this.prisma.$transaction(async (tx) => {
        for (const row of chunk) {
          await this.hardDeleteBookingInTx(tx, row);
          uuids.push(row.uuid);
        }
      });
    }

    const remainingInTrash = await this.prisma.booking.count({ where });

    this.logger.log(
      `Trash cleared: permanently removed ${uuids.length} booking(s); ${remainingInTrash} still in trash`,
    );

    return {
      purged: uuids.length,
      uuids,
      remainingInTrash,
    };
  }
}

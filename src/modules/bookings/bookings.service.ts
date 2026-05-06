import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { hashPassword } from '../../common/utils/password.util';
import { PrismaService } from '../../core/database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { getBookingListScheduledDayBounds } from './booking-list-scheduled-bounds';
import { calculateBookingPrice } from './booking-pricing';
import { CreateBookingDto } from './dto/create-booking.dto';
import {
  BookingTimeScope,
  ListBookingsQueryDto,
} from './dto/list-bookings-query.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';

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

/** Booking JSON for APIs: no internal `id`; clients use `uuid`. */
export type BookingPublic = Omit<BookingWithRelations, 'id'>;

export type PaginatedBookings = {
  data: BookingPublic[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type BookingCreateResult = BookingPublic & {
  assignmentMessage: string;
};

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService) {}

  private async allocateBookingReference(
    tx: Prisma.TransactionClient,
    requested?: string | null,
  ): Promise<string> {
    const trimmed = requested?.trim();
    if (trimmed) {
      const taken = await tx.booking.findFirst({
        where: { bookingReference: trimmed },
        select: { id: true },
      });
      if (taken) {
        throw new BadRequestException('That booking reference is already in use');
      }
      return trimmed;
    }
    for (let i = 0; i < 24; i++) {
      const candidate = `BK-${randomBytes(4).toString('hex').toUpperCase()}`;
      const taken = await tx.booking.findFirst({
        where: { bookingReference: candidate },
        select: { id: true },
      });
      if (!taken) {
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
    const { id: _id, ...rest } = row;
    void _id;
    return rest;
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

  async create(dto: CreateBookingDto): Promise<BookingCreateResult> {
    const userId =
      dto.userId ?? (await this.resolveOrCreatePublicBookingUserId(dto));
    const infantCarrierCount = dto.infantCarrierCount ?? 0;
    const childSeatCount = dto.childSeatCount ?? 0;
    const boosterCount = dto.boosterCount ?? 0;
    const computedPrice = calculateBookingPrice({
      passengerCount: dto.passengerCount,
      luggageCount: dto.luggageCount,
      infantCarrierCount,
      childSeatCount,
      boosterCount,
    });

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
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
            driverId: undefined,
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

    return {
      ...this.toPublicBooking(persisted),
      assignmentMessage: 'Booking created successfully.',
    };
  }

  async findAll(
    _requester: AuthenticatedUser,
    query: ListBookingsQueryDto,
  ): Promise<PaginatedBookings> {
    const baseWhere: Prisma.BookingWhereInput = {};

    const terminalOr: Prisma.BookingWhereInput = {
      OR: [
        { status: 'completed' },
        { status: 'cancelled' },
        { status: 'canceled' },
      ],
    };

    const notTerminal: Prisma.BookingWhereInput = { NOT: terminalOr };

    let where: Prisma.BookingWhereInput = baseWhere;
    let orderBy: Prisma.BookingOrderByWithRelationInput | Prisma.BookingOrderByWithRelationInput[] =
      { createdAt: 'desc' };

    if (query.timeScope === BookingTimeScope.Past) {
      where = { AND: [baseWhere, terminalOr] };
      orderBy = [
        { completedAt: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
      ];
    } else if (query.timeScope === BookingTimeScope.Current) {
      /** Open bookings whose pickup is scheduled on today's calendar date (server `TZ`). */
      const { startOfToday, startOfTomorrow } = getBookingListScheduledDayBounds();
      where = {
        AND: [
          baseWhere,
          notTerminal,
          {
            scheduledTime: {
              gte: startOfToday,
              lt: startOfTomorrow,
            },
          },
        ],
      };
      orderBy = { scheduledTime: 'asc' };
    } else if (query.timeScope === BookingTimeScope.Upcoming) {
      /** Open bookings from tomorrow onward (local TZ). */
      const { startOfTomorrow } = getBookingListScheduledDayBounds();
      where = {
        AND: [
          baseWhere,
          notTerminal,
          { scheduledTime: { gte: startOfTomorrow } },
        ],
      };
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

  async findOne(
    uuid: string,
    requester: AuthenticatedUser,
  ): Promise<BookingPublic> {
    const booking = await this.prisma.booking.findUnique({
      where: { uuid },
      include: bookingInclude,
    });
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
      data.scheduledTime = new Date(d.scheduledTime);
    }
    const nextPassengerCount = d.passengerCount ?? booking.passengerCount;
    const nextLuggageCount = d.luggageCount ?? booking.luggageCount;
    const nextInfantCarrierCount =
      d.infantCarrierCount ?? booking.infantCarrierCount;
    const nextChildSeatCount = d.childSeatCount ?? booking.childSeatCount;
    const nextBoosterCount = d.boosterCount ?? booking.boosterCount;

    const seatsOrTripCountsChanged =
      d.passengerCount !== undefined ||
      d.luggageCount !== undefined ||
      d.infantCarrierCount !== undefined ||
      d.childSeatCount !== undefined ||
      d.boosterCount !== undefined;

    if (d.price !== undefined) {
      data.price = d.price;
    } else if (seatsOrTripCountsChanged) {
      data.price = calculateBookingPrice({
        passengerCount: nextPassengerCount,
        luggageCount: nextLuggageCount,
        infantCarrierCount: nextInfantCarrierCount,
        childSeatCount: nextChildSeatCount,
        boosterCount: nextBoosterCount,
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
      const clash = await this.prisma.booking.findFirst({
        where: { bookingReference: ref, uuid: { not: uuid } },
        select: { id: true },
      });
      if (clash) {
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
    const booking = await this.prisma.booking.findUnique({
      where: { uuid },
      include: bookingInclude,
    });
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
    const booking = await this.prisma.booking.findUnique({
      where: { uuid },
      include: bookingInclude,
    });
    if (!booking) {
      throw new NotFoundException(`Booking ${uuid} not found`);
    }
    this.assertCanDeleteBooking(booking, requester);

    const driverId = booking.driverId;

    await this.prisma.$transaction(async (tx) => {
      await tx.booking.delete({ where: { uuid } });
      if (driverId) {
        const remaining = await tx.booking.count({
          where: { driverId },
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
      message: 'Booking deleted successfully.',
      uuid,
    };
  }
}

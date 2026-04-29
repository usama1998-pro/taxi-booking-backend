import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { hashPassword } from '../../common/utils/password.util';
import { PrismaService } from '../../core/database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateBookingDto } from './dto/create-booking.dto';
import { ListBookingsQueryDto } from './dto/list-bookings-query.dto';
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

  /**
   * Drivers are set `isAvailable: false` when assigned. If a booking was deleted
   * without restoring availability (older code, manual DB edits, etc.), auto-assign
   * would skip them. Release any active driver who has zero bookings.
   */
  private async releaseIdleUnavailableDrivers(
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const idle = await tx.driver.findMany({
      where: {
        isActive: true,
        isAvailable: false,
        bookings: { none: {} },
      },
      select: { id: true },
    });
    if (idle.length === 0) {
      return;
    }
    await tx.driver.updateMany({
      where: { id: { in: idle.map((d) => d.id) } },
      data: { isAvailable: true },
    });
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
    if (booking.driverId !== requester.sub) {
      throw new ForbiddenException(
        'You may only view bookings assigned to you',
      );
    }
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
    if (booking.driverId !== requester.sub) {
      throw new ForbiddenException(
        'You may only update bookings assigned to you',
      );
    }
  }

  private assertCanDeleteBooking(
    booking: BookingWithRelations,
    requester: AuthenticatedUser,
  ): void {
    if (requester.is_admin) {
      return;
    }
    if (requester.typ === 'driver') {
      throw new ForbiddenException('Drivers cannot delete bookings');
    }
    if (booking.userId !== requester.sub) {
      throw new ForbiddenException('You may only delete your own bookings');
    }
  }

  async create(dto: CreateBookingDto): Promise<BookingCreateResult> {
    const userId =
      dto.userId ?? (await this.resolveOrCreatePublicBookingUserId(dto));

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    const { created, assignmentMessage } = await this.prisma.$transaction(
      async (tx) => {
        await this.releaseIdleUnavailableDrivers(tx);

        let assignedDriver: {
          id: string;
          name: string | null;
          email: string | null;
        } | null = null;

        if (dto.driverId) {
          const driver = await tx.driver.findUnique({
            where: { id: dto.driverId },
            select: {
              id: true,
              name: true,
              email: true,
              isActive: true,
              isAvailable: true,
            },
          });
          if (!driver) {
            throw new NotFoundException(`Driver ${dto.driverId} not found`);
          }
          if (!driver.isActive) {
            throw new BadRequestException(
              `Driver ${dto.driverId} account is disabled`,
            );
          }
          if (!driver.isAvailable) {
            throw new BadRequestException(
              `Driver ${dto.driverId} is not available right now`,
            );
          }
          assignedDriver = {
            id: driver.id,
            name: driver.name,
            email: driver.email,
          };
        } else {
          const availableDriver = await tx.driver.findFirst({
            where: { isActive: true, isAvailable: true },
            orderBy: { name: 'asc' },
            select: { id: true, name: true, email: true },
          });
          if (availableDriver) {
            assignedDriver = availableDriver;
          }
        }

        const createdBooking = await tx.booking.create({
          data: {
            userId,
            driverId: assignedDriver?.id,
            customerName: dto.customerName,
            customerEmail: dto.customerEmail,
            customerPhone: dto.customerPhone,
            flightNumber: dto.flightNumber,
            returnTime: dto.returnTime ? new Date(dto.returnTime) : undefined,
            pickupLocation: dto.pickupLocation as Prisma.InputJsonValue,
            dropoffLocation: dto.dropoffLocation as Prisma.InputJsonValue,
            scheduledTime: new Date(dto.scheduledTime),
            price: dto.price,
            status: dto.status,
            luggageCount: dto.luggageCount,
            passengerCount: dto.passengerCount,
            note: dto.note,
          },
          include: bookingInclude,
        });

        if (assignedDriver?.id) {
          await tx.driver.update({
            where: { id: assignedDriver.id },
            data: { isAvailable: false },
          });
        }

        const message = assignedDriver
          ? `Driver ${assignedDriver.name ?? assignedDriver.email ?? assignedDriver.id} assigned successfully.`
          : 'No drivers available yet. We will assign a driver soon.';

        return { created: createdBooking, assignmentMessage: message };
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
      assignmentMessage,
    };
  }

  async findAll(
    requester: AuthenticatedUser,
    query: ListBookingsQueryDto,
  ): Promise<PaginatedBookings> {
    const where: Prisma.BookingWhereInput = requester.is_admin
      ? {}
      : requester.typ === 'user'
        ? { userId: requester.sub }
        : { driverId: requester.sub };
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({
        where,
        orderBy: { createdAt: 'desc' },
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
    if (d.price !== undefined) {
      data.price = d.price;
    }
    if (d.status !== undefined) {
      data.status = d.status;
    }
    if (d.luggageCount !== undefined) {
      data.luggageCount = d.luggageCount;
    }
    if (d.passengerCount !== undefined) {
      data.passengerCount = d.passengerCount;
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

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update');
    }

    const updated = await this.prisma.booking.update({
      where: { uuid },
      data,
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

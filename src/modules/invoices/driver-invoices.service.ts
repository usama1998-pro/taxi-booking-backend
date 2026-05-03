import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceAddressKind, Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateDriverInvoiceDto } from './dto/create-driver-invoice.dto';
import { ListDriverInvoicesQueryDto } from './dto/list-driver-invoices-query.dto';
import { buildDriverInvoicePdf } from './invoice-pdf.builder';

const TAX_RATE = new Prisma.Decimal('0.10');

function assertDriver(user: AuthenticatedUser): void {
  if (user.typ !== 'driver') {
    throw new ForbiddenException('Only drivers can manage invoices');
  }
}

function formatChildSeatsLine(
  infant: number,
  child: number,
  booster: number,
): string | null {
  if (!infant && !child && !booster) {
    return null;
  }
  const parts: string[] = [];
  if (infant > 0) {
    parts.push(`${infant} infant carrier${infant === 1 ? '' : 's'}`);
  }
  if (child > 0) {
    parts.push(`${child} child seat${child === 1 ? '' : 's'}`);
  }
  if (booster > 0) {
    parts.push(`${booster} booster${booster === 1 ? '' : 's'}`);
  }
  return parts.join(', ');
}

function assertAddressFields(
  label: string,
  kind: InvoiceAddressKind,
  address: string | undefined,
  airline: string | undefined,
  flightNo: string | undefined,
): void {
  if (kind === InvoiceAddressKind.LOCATION) {
    if (!address?.trim()) {
      throw new BadRequestException(`${label}: address is required for Location`);
    }
  } else {
    if (!flightNo?.trim()) {
      throw new BadRequestException(
        `${label}: flight number is required for Airport (airline name is optional)`,
      );
    }
  }
}

function toMoneyResponse(d: Prisma.Decimal): number {
  return Number(d.toString());
}

function mapInvoice(row: {
  id: string;
  driverId: string;
  fullName: string;
  phoneNumber: string;
  bookingReference: string;
  pickupDate: Date;
  pickupKind: InvoiceAddressKind;
  pickupAddress: string | null;
  pickupAirline: string | null;
  pickupFlightNo: string | null;
  dropoffKind: InvoiceAddressKind;
  dropoffAddress: string | null;
  dropoffAirline: string | null;
  dropoffFlightNo: string | null;
  priceAmount: Prisma.Decimal;
  taxRate: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  sourceBookingUuid: string | null;
  childSeatsSummary: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    driverId: row.driverId,
    fullName: row.fullName,
    phoneNumber: row.phoneNumber,
    bookingReference: row.bookingReference,
    pickupDate: row.pickupDate.toISOString(),
    pickupKind: row.pickupKind,
    pickupAddress: row.pickupAddress,
    pickupAirline: row.pickupAirline,
    pickupFlightNo: row.pickupFlightNo,
    dropoffKind: row.dropoffKind,
    dropoffAddress: row.dropoffAddress,
    dropoffAirline: row.dropoffAirline,
    dropoffFlightNo: row.dropoffFlightNo,
    priceAmount: toMoneyResponse(row.priceAmount),
    taxRate: toMoneyResponse(row.taxRate),
    taxAmount: toMoneyResponse(row.taxAmount),
    totalAmount: toMoneyResponse(row.totalAmount),
    sourceBookingUuid: row.sourceBookingUuid,
    childSeatsSummary: row.childSeatsSummary,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class DriverInvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  async suggestedPriceFromBookingReference(
    user: AuthenticatedUser,
    bookingReference: string,
  ): Promise<{ price: number; currency: string }> {
    assertDriver(user);
    const ref = bookingReference.trim();
    const booking = await this.prisma.booking.findFirst({
      where: {
        bookingReference: ref,
        driverId: user.sub,
      },
      select: { price: true },
    });
    if (!booking) {
      throw new NotFoundException(
        'No assigned booking found with that reference for your account',
      );
    }
    return { price: booking.price, currency: 'GBP' };
  }

  async create(user: AuthenticatedUser, dto: CreateDriverInvoiceDto) {
    assertDriver(user);
    assertAddressFields(
      'Pick-up',
      dto.pickupKind,
      dto.pickupAddress,
      dto.pickupAirline,
      dto.pickupFlightNo,
    );
    assertAddressFields(
      'Drop-off',
      dto.dropoffKind,
      dto.dropoffAddress,
      dto.dropoffAirline,
      dto.dropoffFlightNo,
    );

    const linkedBooking = await this.prisma.booking.findFirst({
      where: {
        bookingReference: dto.bookingReference.trim(),
        driverId: user.sub,
      },
      select: {
        uuid: true,
        infantCarrierCount: true,
        childSeatCount: true,
        boosterCount: true,
      },
    });
    const sourceBookingUuid = linkedBooking?.uuid ?? null;

    const dtoSeats = dto.childSeatsSummary?.trim();
    let childSeatsSummary: string | null = null;
    if (dtoSeats) {
      childSeatsSummary = dtoSeats;
    } else if (linkedBooking) {
      childSeatsSummary = formatChildSeatsLine(
        linkedBooking.infantCarrierCount,
        linkedBooking.childSeatCount,
        linkedBooking.boosterCount,
      );
    }

    const priceAmount = new Prisma.Decimal(dto.priceAmount).toDP(2);
    const taxAmount = priceAmount.mul(TAX_RATE).toDP(2);
    const totalAmount = priceAmount.add(taxAmount).toDP(2);

    const row = await this.prisma.driverInvoice.create({
      data: {
        driverId: user.sub,
        fullName: dto.fullName.trim(),
        phoneNumber: dto.phoneNumber.trim(),
        bookingReference: dto.bookingReference.trim(),
        pickupDate: new Date(dto.pickupDate),
        pickupKind: dto.pickupKind,
        pickupAddress: dto.pickupKind === 'LOCATION' ? dto.pickupAddress!.trim() : null,
        pickupAirline:
          dto.pickupKind === 'AIRPORT' ? dto.pickupAirline?.trim() || null : null,
        pickupFlightNo:
          dto.pickupKind === 'AIRPORT' ? dto.pickupFlightNo!.trim() : null,
        dropoffKind: dto.dropoffKind,
        dropoffAddress:
          dto.dropoffKind === 'LOCATION' ? dto.dropoffAddress!.trim() : null,
        dropoffAirline:
          dto.dropoffKind === 'AIRPORT' ? dto.dropoffAirline?.trim() || null : null,
        dropoffFlightNo:
          dto.dropoffKind === 'AIRPORT' ? dto.dropoffFlightNo!.trim() : null,
        priceAmount,
        taxRate: TAX_RATE,
        taxAmount,
        totalAmount,
        sourceBookingUuid,
        childSeatsSummary,
      },
    });

    return mapInvoice(row);
  }

  async findAllPaginated(user: AuthenticatedUser, query: ListDriverInvoicesQueryDto) {
    assertDriver(user);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.driverInvoice.count({ where: { driverId: user.sub } }),
      this.prisma.driverInvoice.findMany({
        where: { driverId: user.sub },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return {
      data: rows.map(mapInvoice),
      page,
      pageSize,
      total,
      totalPages,
    };
  }

  async findOne(user: AuthenticatedUser, id: string) {
    assertDriver(user);
    const row = await this.prisma.driverInvoice.findFirst({
      where: { id, driverId: user.sub },
    });
    if (!row) {
      throw new NotFoundException('Invoice not found');
    }
    return mapInvoice(row);
  }

  async buildPdfBuffer(user: AuthenticatedUser, id: string): Promise<Buffer> {
    const inv = await this.findOne(user, id);
    return buildDriverInvoicePdf(inv);
  }

  /**
   * Aggregates for Performance / dashboard: totals, 7-day series, 6-month series, booking links.
   */
  async getAnalytics(user: AuthenticatedUser) {
    assertDriver(user);
    const driverId = user.sub;

    const from6m = new Date();
    from6m.setUTCMonth(from6m.getUTCMonth() - 6);
    from6m.setUTCHours(0, 0, 0, 0);

    const [totals, linkedFromBookingCount, rows] = await Promise.all([
      this.prisma.driverInvoice.aggregate({
        where: { driverId },
        _sum: {
          priceAmount: true,
          taxAmount: true,
          totalAmount: true,
        },
        _count: { _all: true },
      }),
      this.prisma.driverInvoice.count({
        where: { driverId, sourceBookingUuid: { not: null } },
      }),
      this.prisma.driverInvoice.findMany({
        where: { driverId, createdAt: { gte: from6m } },
        select: { createdAt: true, totalAmount: true, priceAmount: true },
      }),
    ]);

    const count = totals._count._all;
    const sumSub = totals._sum.priceAmount;
    const sumTax = totals._sum.taxAmount;
    const sumTotal = totals._sum.totalAmount;
    const subtotal = sumSub != null ? toMoneyResponse(sumSub) : 0;
    const tax = sumTax != null ? toMoneyResponse(sumTax) : 0;
    const invoiced = sumTotal != null ? toMoneyResponse(sumTotal) : 0;
    const averageInvoiceTotal = count > 0 ? invoiced / count : 0;

    const dayKeys = last7UtcDayKeys();
    const dayTotals = new Map<string, { total: number; count: number }>();
    for (const k of dayKeys) {
      dayTotals.set(k, { total: 0, count: 0 });
    }

    const monthKeys = last6UtcMonthKeysAsc();
    const monthTotals = new Map<string, { total: number; subtotal: number; count: number }>();
    for (const k of monthKeys) {
      monthTotals.set(k, { total: 0, subtotal: 0, count: 0 });
    }

    for (const r of rows) {
      const dk = utcDayKey(r.createdAt);
      const day = dayTotals.get(dk);
      if (day) {
        day.total += toMoneyResponse(r.totalAmount);
        day.count += 1;
      }
      const mk = utcMonthKey(r.createdAt);
      const month = monthTotals.get(mk);
      if (month) {
        month.total += toMoneyResponse(r.totalAmount);
        month.subtotal += toMoneyResponse(r.priceAmount);
        month.count += 1;
      }
    }

    const last7Days = dayKeys.map((date) => {
      const b = dayTotals.get(date)!;
      return { date, total: b.total, count: b.count };
    });

    const last6Months = monthKeys.map((month) => {
      const b = monthTotals.get(month)!;
      return {
        month,
        total: b.total,
        subtotal: b.subtotal,
        count: b.count,
      };
    });

    return {
      count,
      sums: { subtotal, tax, total: invoiced },
      averageInvoiceTotal,
      linkedFromBookingCount,
      last7Days,
      last6Months,
    };
  }
}

function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function utcMonthKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

/** Oldest → newest (7 calendar days in UTC ending today). */
function last7UtcDayKeys(): string[] {
  const keys: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - i);
    keys.push(utcDayKey(d));
  }
  return keys;
}

/** Six UTC months oldest → newest ending current month. */
function last6UtcMonthKeysAsc(): string[] {
  const keys: string[] = [];
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 5);
  d.setUTCHours(0, 0, 0, 0);
  for (let i = 0; i < 6; i++) {
    keys.push(utcMonthKey(d));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return keys;
}

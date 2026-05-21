import type { Prisma } from '@prisma/client';

/** Soft-deleted (trash) bookings only. */
export const trashedBookingWhere = {
  deletedAt: { not: null },
} satisfies Prisma.BookingWhereInput;

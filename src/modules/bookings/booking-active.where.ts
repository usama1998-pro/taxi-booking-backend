import type { Prisma } from '@prisma/client';

/** Active (non-trashed) bookings only. */
export const activeBookingWhere = {
  deletedAt: null,
} satisfies Prisma.BookingWhereInput;

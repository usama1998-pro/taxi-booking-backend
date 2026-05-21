import type { Prisma } from '@prisma/client';

/**
 * Match a booking reference on active rows or trashed rows (same `Booking` table).
 * Legacy soft-deletes may have `BR-…#trash-{uuid}` — included via prefix match.
 */
export function reservedBookingReferenceWhere(
  bookingReference: string,
): Prisma.BookingWhereInput {
  const ref = bookingReference.trim();
  if (!ref) {
    return { id: '__none__' };
  }
  return {
    OR: [
      { bookingReference: ref },
      { bookingReference: { startsWith: `${ref}#trash-` } },
    ],
  };
}

import type { Prisma } from '@prisma/client';

const TRASH_SUFFIX = '#trash-';

/** Normalize Viator / manual booking references for lookups. */
export function normalizeBookingReference(bookingReference: string): string {
  const trimmed = bookingReference.trim();
  const trashIdx = trimmed.toLowerCase().indexOf(TRASH_SUFFIX);
  if (trashIdx > 0) {
    return trimmed.slice(0, trashIdx).toUpperCase() + trimmed.slice(trashIdx);
  }
  return trimmed.toUpperCase();
}

/**
 * Reference stored on a soft-deleted row so the live `BR-…` slot stays reserved
 * (see `reservedBookingReferenceWhere` prefix match).
 */
/** Strip `#trash-{uuid}` for API display (storage keeps the suffix). */
export function displayBookingReference(bookingReference: string): string {
  const trashIdx = bookingReference.toLowerCase().indexOf(TRASH_SUFFIX);
  if (trashIdx > 0) {
    return bookingReference.slice(0, trashIdx);
  }
  return bookingReference;
}

export function trashedBookingReference(
  bookingReference: string,
  bookingUuid: string,
): string {
  const trimmed = bookingReference.trim();
  if (trimmed.toLowerCase().includes(TRASH_SUFFIX)) {
    return normalizeBookingReference(trimmed);
  }
  return `${normalizeBookingReference(trimmed)}${TRASH_SUFFIX}${bookingUuid}`;
}

/**
 * Inclusive range for `BR-…#trash-{uuid}` rows (avoids MySQL `LIKE` collation errors).
 * `lt` is the smallest string strictly greater than any `…#trash-{uuid}` value.
 */
export function trashedBookingReferenceRange(liveReference: string): {
  gte: string;
  lt: string;
} {
  const ref = normalizeBookingReference(liveReference);
  return {
    gte: `${ref}${TRASH_SUFFIX}`,
    lt: `${ref}#trash.`,
  };
}

/**
 * Match a booking reference on active rows or trashed rows (same `Booking` table).
 * Legacy soft-deletes may have `BR-…#trash-{uuid}` — matched via string range, not `LIKE`.
 */
export function reservedBookingReferenceWhere(
  bookingReference: string,
): Prisma.BookingWhereInput {
  const ref = normalizeBookingReference(bookingReference);
  if (!ref) {
    return { id: '__none__' };
  }
  const trashRange = trashedBookingReferenceRange(ref);
  return {
    OR: [
      { bookingReference: ref },
      {
        bookingReference: {
          gte: trashRange.gte,
          lt: trashRange.lt,
        },
      },
    ],
  };
}

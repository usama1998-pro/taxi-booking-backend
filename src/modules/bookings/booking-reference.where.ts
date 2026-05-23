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
 * Match a booking reference on active rows or trashed rows (same `Booking` table).
 * Legacy soft-deletes may have `BR-…#trash-{uuid}` — included via prefix match.
 */
export function reservedBookingReferenceWhere(
  bookingReference: string,
): Prisma.BookingWhereInput {
  const ref = normalizeBookingReference(bookingReference);
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

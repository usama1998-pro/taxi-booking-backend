/** Max bookings permanently removed per purge request (scheduler runs). */
export const BOOKING_TRASH_PURGE_BATCH_SIZE = 30;

/**
 * Only purge trash older than this many days. `0` = no minimum age (purge oldest trash).
 * Env: `BOOKING_TRASH_RETENTION_DAYS`
 */
export function bookingTrashRetentionDays(): number {
  const raw = process.env.BOOKING_TRASH_RETENTION_DAYS?.trim();
  if (!raw) {
    return 0;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

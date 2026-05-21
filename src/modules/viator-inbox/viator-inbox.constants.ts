/** Default lookback when VIATOR_INBOX_LOOKBACK_HOURS is unset (cron delay + IMAP lag). */
const DEFAULT_LOOKBACK_HOURS = 6;

/** How far back POST /viator/inbox/check searches for Viator booking emails. */
export const VIATOR_INBOX_LOOKBACK_HOURS = resolveLookbackHours();

function resolveLookbackHours(): number {
  const raw = process.env.VIATOR_INBOX_LOOKBACK_HOURS?.trim();
  if (!raw) {
    return DEFAULT_LOOKBACK_HOURS;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(parsed, 168)
    : DEFAULT_LOOKBACK_HOURS;
}

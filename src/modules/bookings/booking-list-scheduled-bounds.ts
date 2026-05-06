/**
 * Calendar-day boundaries for booking list scopes, using an IANA timezone
 * (defaults to `process.env.TZ`, e.g. Europe/Madrid from bootstrap-env).
 */

function zonedCalendarDayKey(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Smallest UTC instant in [hintMs - 96h, hintMs + 96h] on that calendar day in `timeZone`. */
function startOfZonedDayWithKey(
  targetKey: string,
  hintMs: number,
  timeZone: string,
): Date {
  let lo = hintMs - 96 * 3600_000;
  let hi = hintMs + 96 * 3600_000;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const k = zonedCalendarDayKey(new Date(mid), timeZone);
    if (k < targetKey) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return new Date(lo);
}

/**
 * `startOfToday`: first instant of "today" in the zone.
 * `startOfTomorrow`: first instant of the next calendar day after today in the zone.
 */
export function getBookingListScheduledDayBounds(
  timeZone: string = process.env.TZ || 'Europe/Madrid',
  now: Date = new Date(),
): { startOfToday: Date; startOfTomorrow: Date } {
  const todayKey = zonedCalendarDayKey(now, timeZone);
  const startOfToday = startOfZonedDayWithKey(todayKey, now.getTime(), timeZone);
  let probe = startOfToday.getTime() + 6 * 3600_000;
  while (zonedCalendarDayKey(new Date(probe), timeZone) === todayKey) {
    probe += 3600_000;
  }
  const tomorrowKey = zonedCalendarDayKey(new Date(probe), timeZone);
  const startOfTomorrow = startOfZonedDayWithKey(tomorrowKey, probe, timeZone);
  return { startOfToday, startOfTomorrow };
}

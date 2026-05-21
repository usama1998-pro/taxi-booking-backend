/**
 * Calendar-day boundaries for booking list scopes, using an IANA timezone
 * (defaults to `process.env.TZ`, e.g. Europe/Madrid from bootstrap-env).
 */

import {
  startOfZonedDayWithKey,
  zonedCalendarDayKey,
} from './booking-zoned-time';

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

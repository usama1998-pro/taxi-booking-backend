import { getBookingTimeZone } from './booking-scheduled-time';

export function zonedCalendarDayKey(
  d: Date,
  timeZone: string = getBookingTimeZone(),
): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Smallest UTC instant on a calendar day in `timeZone` (near `hintMs`). */
export function startOfZonedDayWithKey(
  targetKey: string,
  hintMs: number,
  timeZone: string = getBookingTimeZone(),
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

export function getZonedDateTimeParts(
  d: Date,
  timeZone: string = getBookingTimeZone(),
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  });
  const map: Record<string, number> = {};
  for (const part of fmt.formatToParts(d)) {
    if (part.type !== 'literal') {
      map[part.type] = Number.parseInt(part.value, 10);
    }
  }
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour,
    minute: map.minute,
  };
}

/** Wall-clock date/time in `timeZone` → UTC instant (for Viator pickup parsing). */
export function wallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string = getBookingTimeZone(),
): Date {
  const pad = (n: number) => String(n).padStart(2, '0');
  const targetKey = `${year}-${pad(month)}-${pad(day)}`;
  let ms = startOfZonedDayWithKey(
    targetKey,
    Date.UTC(year, month - 1, day, 12),
    timeZone,
  ).getTime();

  for (let i = 0; i < 4; i += 1) {
    const parts = getZonedDateTimeParts(new Date(ms), timeZone);
    const wantMin = hour * 60 + minute;
    const haveMin = parts.hour * 60 + parts.minute;
    ms += (wantMin - haveMin) * 60_000;
  }

  return new Date(ms);
}

/** Viator subject / body travel date, e.g. "Wed, Sep 17, 2026". */
const VIATOR_PICKUP_DATE_LABEL_RE =
  /^(?:\w+,\s*)?([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/;

const MONTH_NAME_TO_NUMBER: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

/**
 * Calendar parts from a Viator travel-date label.
 * Parses the printed month/day/year (not `Date.parse`, which depends on server TZ).
 */
export function calendarPartsFromPickupDateLabel(
  pickupDateLabel: string,
  _timeZone: string = getBookingTimeZone(),
): { year: number; month: number; day: number } {
  const trimmed = pickupDateLabel.trim();
  const match = trimmed.match(VIATOR_PICKUP_DATE_LABEL_RE);
  if (match) {
    const month = MONTH_NAME_TO_NUMBER[match[1].toLowerCase()];
    if (!month) {
      throw new Error(`Could not parse Viator travel date: ${pickupDateLabel}`);
    }
    const day = Number.parseInt(match[2], 10);
    const year = Number.parseInt(match[3], 10);
    if (
      !Number.isFinite(day) ||
      day < 1 ||
      day > 31 ||
      !Number.isFinite(year) ||
      year < 2000
    ) {
      throw new Error(`Could not parse Viator travel date: ${pickupDateLabel}`);
    }
    return { year, month, day };
  }

  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    throw new Error(`Could not parse Viator travel date: ${pickupDateLabel}`);
  }
  const parts = getZonedDateTimeParts(new Date(parsed), _timeZone);
  return { year: parts.year, month: parts.month, day: parts.day };
}

/** `[start, end)` bounds for one calendar day in `timeZone` (`dayKey` = `YYYY-MM-DD`). */
export function scheduledCalendarDayBounds(
  dayKey: string,
  timeZone: string = getBookingTimeZone(),
): { start: Date; end: Date } {
  const start = startOfZonedDayWithKey(
    dayKey,
    Date.parse(`${dayKey}T12:00:00Z`),
    timeZone,
  );
  let probe = start.getTime() + 6 * 3600_000;
  while (zonedCalendarDayKey(new Date(probe), timeZone) === dayKey) {
    probe += 3600_000;
  }
  const nextKey = zonedCalendarDayKey(new Date(probe), timeZone);
  const end = startOfZonedDayWithKey(nextKey, probe, timeZone);
  return { start, end };
}

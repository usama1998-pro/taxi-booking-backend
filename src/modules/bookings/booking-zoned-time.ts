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

export function calendarPartsFromPickupDateLabel(
  pickupDateLabel: string,
  timeZone: string = getBookingTimeZone(),
): { year: number; month: number; day: number } {
  const parsed = Date.parse(pickupDateLabel.trim());
  if (Number.isNaN(parsed)) {
    throw new Error(`Could not parse Viator travel date: ${pickupDateLabel}`);
  }
  const parts = getZonedDateTimeParts(new Date(parsed), timeZone);
  return { year: parts.year, month: parts.month, day: parts.day };
}

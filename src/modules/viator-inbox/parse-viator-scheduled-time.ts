import { getBookingTimeZone } from '../bookings/booking-scheduled-time';
import {
  calendarPartsFromPickupDateLabel,
  wallClockToUtc,
} from '../bookings/booking-zoned-time';

/** e.g. "6:45 am", "14:30", "07:30" */
function parseTimeParts(
  timeLabel: string,
): { hour: number; minute: number } | null {
  const match = timeLabel.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!match) {
    return null;
  }
  let hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === 'pm' && hour < 12) {
    hour += 12;
  }
  if (meridiem === 'am' && hour === 12) {
    hour = 0;
  }
  return { hour, minute };
}

export type ViatorPickupTimeInput = {
  arrivalTime?: string;
  departureTime?: string;
  tourGradeCode?: string;
  /** True when picking up at the airport (inbound flight). */
  isAirportPickup?: boolean;
  /** Cruise / city→airport routes: pickup from Tour Grade Code only — not disembarkation or flight times. */
  preferTourGradeCodeTime?: boolean;
};

/** Extract time from tour grade code, e.g. "TG1~12:30" → "12:30". */
function extractTimeFromTourGradeCode(tourGradeCode?: string): string | undefined {
  if (!tourGradeCode) {
    return undefined;
  }
  const match = tourGradeCode.match(/~(\d{1,2}:\d{2})\b/);
  return match?.[1];
}

/**
 * Pickup `scheduledTime`: airport inbound uses arrival time; hotel→airport uses departure time.
 * Cruise and city→airport routes use Tour Grade Code only (not disembarkation/arrival/departure times).
 */
export function resolveViatorPickupTimeLabel(input: ViatorPickupTimeInput): string | undefined {
  const arrival = input.arrivalTime?.trim();
  const departure = input.departureTime?.trim();
  const tourGradeTime = extractTimeFromTourGradeCode(input.tourGradeCode);

  if (input.preferTourGradeCodeTime) {
    return tourGradeTime;
  }

  if (input.isAirportPickup) {
    return arrival || departure || tourGradeTime;
  }
  return departure || arrival || tourGradeTime;
}

/**
 * Combines Viator subject date with pickup time in {@link getBookingTimeZone} (Europe/Madrid).
 */
export function parseViatorScheduledTimeIso(
  pickupDateLabel: string,
  timeInput?: string | ViatorPickupTimeInput,
): { iso: string; hasTime: boolean } {
  const timeZone = getBookingTimeZone();
  const { year, month, day } = calendarPartsFromPickupDateLabel(
    pickupDateLabel,
    timeZone,
  );

  let pickupTime: string | undefined;
  if (typeof timeInput === 'string') {
    pickupTime = timeInput.trim() || undefined;
  } else if (timeInput) {
    pickupTime = resolveViatorPickupTimeLabel(timeInput);
  }

  let hour = 0;
  let minute = 0;
  let hasTime = false;
  if (pickupTime) {
    const parsed = parseTimeParts(pickupTime);
    if (parsed) {
      hour = parsed.hour;
      minute = parsed.minute;
      hasTime = true;
    }
  }

  return {
    iso: wallClockToUtc(year, month, day, hour, minute, timeZone).toISOString(),
    hasTime,
  };
}

export function viatorGuestEmail(viatorReference: string): string {
  const slug = viatorReference.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return `viator.${slug}@taxibarcelona24.guest`;
}

export function parseViatorPassengerCount(travelers?: string): number {
  const match = travelers?.match(/(\d+)/);
  const n = match ? Number.parseInt(match[1], 10) : 1;
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 20) : 1;
}

export { getBookingTimeZone };

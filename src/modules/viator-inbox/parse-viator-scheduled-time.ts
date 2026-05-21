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
  /** True when picking up at the airport (inbound flight). */
  isAirportPickup?: boolean;
};

/**
 * Pickup `scheduledTime`: airport inbound uses arrival time; hotel→airport uses departure time.
 */
export function resolveViatorPickupTimeLabel(input: ViatorPickupTimeInput): string | undefined {
  const arrival = input.arrivalTime?.trim();
  const departure = input.departureTime?.trim();

  if (input.isAirportPickup) {
    return arrival || departure;
  }
  return departure || arrival;
}

/**
 * Combines Viator subject date with pickup time in {@link getBookingTimeZone} (Europe/Madrid).
 */
export function parseViatorScheduledTimeIso(
  pickupDateLabel: string,
  timeInput?: string | ViatorPickupTimeInput,
): string {
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

  let hour = 9;
  let minute = 0;
  if (pickupTime) {
    const parsed = parseTimeParts(pickupTime);
    if (parsed) {
      hour = parsed.hour;
      minute = parsed.minute;
    }
  }

  return wallClockToUtc(year, month, day, hour, minute, timeZone).toISOString();
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

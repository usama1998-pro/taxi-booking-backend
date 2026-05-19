import { getBookingTimeZone } from '../bookings/booking-scheduled-time';

/** e.g. "6:45 am", "14:30", "07:30" */
function parseTimeOnDate(base: Date, timeLabel: string): Date {
  const match = timeLabel.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!match) {
    return base;
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
  const out = new Date(base);
  out.setHours(hour, minute, 0, 0);
  return out;
}

/**
 * Combines Viator subject date label (e.g. "Tue, Sep 29, 2026") with optional arrival time.
 */
export function parseViatorScheduledTimeIso(
  pickupDateLabel: string,
  arrivalTime?: string,
): string {
  const parsed = Date.parse(pickupDateLabel.trim());
  if (Number.isNaN(parsed)) {
    throw new Error(`Could not parse Viator travel date: ${pickupDateLabel}`);
  }
  let scheduled = new Date(parsed);
  if (arrivalTime?.trim()) {
    scheduled = parseTimeOnDate(scheduled, arrivalTime);
  } else {
    scheduled.setHours(9, 0, 0, 0);
  }
  return scheduled.toISOString();
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

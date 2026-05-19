import { BadRequestException } from '@nestjs/common';

/** Grace for client/server clock skew (ms). */
const PAST_PICKUP_GRACE_MS = 60_000;

export function getBookingTimeZone(): string {
  return process.env.TZ?.trim() || 'Europe/Madrid';
}

export function parseScheduledTime(isoOrDate: string | Date): Date {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException('Invalid pickup date and time.');
  }
  return d;
}

/** Rejects pickup instants that are already in the past. */
export function assertPickupNotInPast(
  scheduledTime: Date,
  now: Date = new Date(),
): void {
  if (scheduledTime.getTime() < now.getTime() - PAST_PICKUP_GRACE_MS) {
    throw new BadRequestException(
      'Pickup date and time must be now or in the future.',
    );
  }
}

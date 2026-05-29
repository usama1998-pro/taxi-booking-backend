import {
  calendarPartsFromPickupDateLabel,
  scheduledCalendarDayBounds,
  zonedCalendarDayKey,
} from './booking-zoned-time';

const TZ = 'Europe/Madrid';

describe('calendarPartsFromPickupDateLabel', () => {
  it('uses the printed calendar day (not server-local Date.parse)', () => {
    expect(calendarPartsFromPickupDateLabel('Wed, Sep 17, 2026', TZ)).toEqual({
      year: 2026,
      month: 9,
      day: 17,
    });
  });

  it('parses other Viator subject formats', () => {
    expect(calendarPartsFromPickupDateLabel('Thu, Jun 12, 2026', TZ)).toEqual({
      year: 2026,
      month: 6,
      day: 12,
    });
  });
});

describe('scheduledCalendarDayBounds', () => {
  it('includes late-evening pickups on the same Madrid calendar day', () => {
    const { start, end } = scheduledCalendarDayBounds('2026-09-17', TZ);
    const latePickup = new Date('2026-09-17T21:45:00.000Z'); // 23:45 CEST
    expect(latePickup.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(latePickup.getTime()).toBeLessThan(end.getTime());
    expect(zonedCalendarDayKey(latePickup, TZ)).toBe('2026-09-17');
  });
});

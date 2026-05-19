import { parseViatorNewBookingSubject } from './parse-viator-subject';

describe('parseViatorNewBookingSubject', () => {
  it('parses standard Viator new booking subject', () => {
    expect(
      parseViatorNewBookingSubject(
        'New Booking for Thu, May 28, 2026 (#BR-1399266959)',
      ),
    ).toEqual({
      pickupDateLabel: 'Thu, May 28, 2026',
      viatorReference: 'BR-1399266959',
    });
  });

  it('returns null for unrelated subjects', () => {
    expect(parseViatorNewBookingSubject('Your receipt')).toBeNull();
  });
});

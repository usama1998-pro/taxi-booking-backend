import { reservedBookingReferenceWhere } from './booking-reference.where';

describe('reservedBookingReferenceWhere', () => {
  it('matches exact reference on active or trash rows', () => {
    expect(reservedBookingReferenceWhere('BR-123')).toEqual({
      OR: [
        { bookingReference: 'BR-123' },
        { bookingReference: { startsWith: 'BR-123#trash-' } },
      ],
    });
  });
});

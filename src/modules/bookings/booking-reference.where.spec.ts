import {
  bookingReferenceSearchWhere,
  normalizeBookingReference,
  reservedBookingReferenceWhere,
  trashedBookingReference,
  trashedBookingReferenceRange,
} from './booking-reference.where';

describe('normalizeBookingReference', () => {
  it('trims and uppercases', () => {
    expect(normalizeBookingReference('  br-123  ')).toBe('BR-123');
  });
});

describe('trashedBookingReference', () => {
  it('appends #trash-{uuid} once', () => {
    const uuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    expect(trashedBookingReference('BR-123', uuid)).toBe(
      `BR-123#trash-${uuid}`,
    );
    expect(
      trashedBookingReference(`BR-123#trash-${uuid}`, uuid),
    ).toBe(`BR-123#trash-${uuid}`);
  });
});

describe('trashedBookingReferenceRange', () => {
  it('bounds all #trash-{uuid} suffix rows without LIKE', () => {
    expect(trashedBookingReferenceRange('BR-123')).toEqual({
      gte: 'BR-123#trash-',
      lt: 'BR-123#trash.',
    });
  });
});

describe('bookingReferenceSearchWhere', () => {
  it('returns contains filter with uppercase needle', () => {
    expect(bookingReferenceSearchWhere('  br-1399  ')).toEqual({
      bookingReference: { contains: 'BR-1399' },
    });
  });

  it('returns null for empty query', () => {
    expect(bookingReferenceSearchWhere('   ')).toBeNull();
  });
});

describe('reservedBookingReferenceWhere', () => {
  it('matches exact reference on active or trash rows', () => {
    expect(reservedBookingReferenceWhere('BR-123')).toEqual({
      OR: [
        { bookingReference: 'BR-123' },
        {
          bookingReference: {
            gte: 'BR-123#trash-',
            lt: 'BR-123#trash.',
          },
        },
      ],
    });
  });

  it('matches a trashed suffix row when looking up the live reference', () => {
    const uuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const trashed = trashedBookingReference('BR-1399266959', uuid);
    const where = reservedBookingReferenceWhere('BR-1399266959');
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { bookingReference: 'BR-1399266959' },
        {
          bookingReference: {
            gte: 'BR-1399266959#trash-',
            lt: 'BR-1399266959#trash.',
          },
        },
      ]),
    );
    expect(trashed.startsWith('BR-1399266959#trash-')).toBe(true);
  });
});

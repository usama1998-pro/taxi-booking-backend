import {
  bookingReferenceSearchLikePattern,
  bookingReferenceSearchNeedle,
  escapeMysqlLikePattern,
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

describe('bookingReferenceSearchNeedle', () => {
  it('trims and uppercases', () => {
    expect(bookingReferenceSearchNeedle('  br-1399  ')).toBe('BR-1399');
  });

  it('returns null for empty query', () => {
    expect(bookingReferenceSearchNeedle('   ')).toBeNull();
  });
});

describe('bookingReferenceSearchLikePattern', () => {
  it('wraps escaped needle for LIKE', () => {
    expect(bookingReferenceSearchLikePattern('br-13%9')).toBe('%BR-13\\%9%');
  });
});

describe('escapeMysqlLikePattern', () => {
  it('escapes wildcards and backslashes', () => {
    expect(escapeMysqlLikePattern('a%b_c\\d')).toBe('a\\%b\\_c\\\\d');
  });
});

describe('reservedBookingReferenceWhere', () => {
  it('matches only the exact live reference', () => {
    expect(reservedBookingReferenceWhere('BR-123')).toEqual({
      bookingReference: 'BR-123',
    });
  });

  it('does not match a trashed suffix row when looking up the live reference', () => {
    const uuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const trashed = trashedBookingReference('BR-1399266959', uuid);
    const where = reservedBookingReferenceWhere('BR-1399266959');
    expect(where).toEqual({ bookingReference: 'BR-1399266959' });
    expect(trashed.startsWith('BR-1399266959#trash-')).toBe(true);
  });
});

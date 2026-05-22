import { parseViatorBookingReferenceFromText } from './parse-viator-email-body';
import {
  generateViatorTestBookingReference,
  isViatorTestBookingSubject,
  parseViatorNewBookingSubject,
  parseViatorTestBookingSubject,
} from './parse-viator-subject';
import { buildViatorTestEmailBodies } from './viator-test-email';

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

  it('parses subjects with Re: prefix', () => {
    expect(
      parseViatorNewBookingSubject(
        'Re: New Booking for Fri, May 22, 2026 (#BR-1400460161)',
      ),
    ).toEqual({
      pickupDateLabel: 'Fri, May 22, 2026',
      viatorReference: 'BR-1400460161',
    });
  });
});

describe('parseViatorTestBookingSubject', () => {
  it('parses #BR-TEST subject', () => {
    expect(
      parseViatorTestBookingSubject(
        'New Booking for Thu, May 28, 2026 (#BR-TEST)',
      ),
    ).toEqual({
      pickupDateLabel: 'Thu, May 28, 2026',
      templateMarker: 'BR-TEST',
    });
  });

  it('generates unique BR references for test emails', () => {
    const a = generateViatorTestBookingReference();
    const b = generateViatorTestBookingReference();
    expect(a).toMatch(/^BR-\d{10}$/);
    expect(b).toMatch(/^BR-\d{10}$/);
    expect(a).not.toBe(b);
  });

  it('parses Booking Reference from test email body', () => {
    const ref = generateViatorTestBookingReference();
    const { text } = buildViatorTestEmailBodies({ bookingReference: ref });
    expect(parseViatorBookingReferenceFromText(text)).toBe(ref);
    expect(parseViatorBookingReferenceFromText(text, { allowTestMarker: true })).toBe(
      ref,
    );
  });

  it('parses BR-TEST from body when allowTestMarker', () => {
    const { text } = buildViatorTestEmailBodies({ bookingReference: 'BR-TEST' });
    expect(parseViatorBookingReferenceFromText(text)).toBeNull();
    expect(parseViatorBookingReferenceFromText(text, { allowTestMarker: true })).toBe(
      'BR-TEST',
    );
  });

  it('detects test subjects', () => {
    expect(isViatorTestBookingSubject('New Booking for Mon (#BR-TEST)')).toBe(
      true,
    );
    expect(
      isViatorTestBookingSubject('New Booking for Mon (#BR-1399266959)'),
    ).toBe(false);
  });
});

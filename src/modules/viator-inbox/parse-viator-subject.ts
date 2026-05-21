/** Subject line Viator sends into your Hostinger inbox (not a separate mail system). */
const VIATOR_NEW_BOOKING_SUBJECT =
  /^New Booking for (.+?) \(#(BR-\d+)\)\s*$/i;

export type ParsedViatorNewBooking = {
  pickupDateLabel: string;
  viatorReference: string;
};

export function parseViatorNewBookingSubject(
  subject: string,
): ParsedViatorNewBooking | null {
  const match = subject.trim().match(VIATOR_NEW_BOOKING_SUBJECT);
  if (!match) {
    return null;
  }
  return {
    pickupDateLabel: match[1].trim(),
    viatorReference: match[2].trim().toUpperCase(),
  };
}

export function isViatorNewBookingSubject(subject: string): boolean {
  return parseViatorNewBookingSubject(subject) !== null;
}

export {
  generateViatorTestBookingReference,
  isViatorTestBookingSubject,
  parseViatorTestBookingSubject,
  VIATOR_TEST_SUBJECT_MARKER,
} from './viator-test-email';

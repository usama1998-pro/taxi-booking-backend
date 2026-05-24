import { getBookingTimeZone } from '../bookings/booking-scheduled-time';
import { calendarPartsFromPickupDateLabel } from '../bookings/booking-zoned-time';
import {
  pickRandomAllowedViatorProductCode,
  VIATOR_CITY_TO_CRUISE_PRODUCT_CODES,
} from './viator-allowed-products';

/** Subject marker for app/script test messages (not real Viator). */
export const VIATOR_TEST_SUBJECT_MARKER =
  process.env.VIATOR_TEST_SUBJECT_MARKER?.trim() || 'BR-TEST';

const VIATOR_TEST_SUBJECT = new RegExp(
  `^(?:Re:\\s*)?New Booking for (.+?) \\(#${escapeRegExp(VIATOR_TEST_SUBJECT_MARKER)}\\)\\s*$`,
  'i',
);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isViatorTestBookingSubject(subject: string): boolean {
  return VIATOR_TEST_SUBJECT.test(subject.trim());
}

export function parseViatorTestBookingSubject(
  subject: string,
): { pickupDateLabel: string; templateMarker: string } | null {
  const match = subject.trim().match(VIATOR_TEST_SUBJECT);
  if (!match) {
    return null;
  }
  return {
    pickupDateLabel: match[1].trim(),
    templateMarker: VIATOR_TEST_SUBJECT_MARKER.toUpperCase(),
  };
}

/** BR-… for test emails only (import reads this from the message body). */
export function generateViatorTestBookingReference(): string {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-10);
  return `BR-${suffix}`;
}

export function buildViatorTestEmailSubject(pickupDateLabel?: string): string {
  const label =
    pickupDateLabel?.trim() ||
    new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: getBookingTimeZone(),
    }).format(new Date());
  return `New Booking for ${label} (#${VIATOR_TEST_SUBJECT_MARKER})`;
}

export function buildViatorTestEmailBodies(options: {
  bookingReference: string;
  pickupDateLabel?: string;
  productCode?: string;
  sentAt?: Date;
}): { text: string; html: string; productCode: string } {
  const sentAt = options.sentAt ?? new Date();
  const pickupDateLabel =
    options.pickupDateLabel ?? defaultTestPickupDateLabel();
  const bookingReference = options.bookingReference.trim().toUpperCase();
  const productCode =
    options.productCode?.trim().toUpperCase() ??
    pickRandomAllowedViatorProductCode();

  const text = [
    'Viator Test Booking',
    '',
    `Booking Reference: ${bookingReference}`,
    `Product Code: ${productCode}`,
    `Travel Date: ${pickupDateLabel}`,
    'Tour Name: Barcelona Airport Transfer (TEST)',
    'Lead Traveler Name: Test Traveler',
    'Travelers: 2',
    'Tour Language: English',
    'Hotel Pickup: Barcelona El Prat Airport (TEST)',
    'Arrival Flight No: XX9999',
    'Arrival Time: 10:30',
    'Arrival Airline: Test Air',
    'Drop Off Location: Hotel Arts Barcelona (TEST)',
    'Phone: +34600111222',
    'Email: viator.test@example.com',
    '',
    `Sent at: ${sentAt.toISOString()}`,
  ].join('\n');

  const html = `<!DOCTYPE html><html><body style="font-family:sans-serif">
<h2>Viator Test Booking</h2>
<p><b>Booking Reference:</b> ${bookingReference}</p>
<p><b>Product Code:</b> ${productCode}</p>
<p><b>Travel Date:</b> ${pickupDateLabel}</p>
<p><b>Tour Name:</b> Barcelona Airport Transfer (TEST)</p>
<p><b>Lead Traveler Name:</b> Test Traveler</p>
<p><b>Travelers:</b> 2</p>
<p><b>Tour Language:</b> English</p>
<p><b>Hotel Pickup:</b> Barcelona El Prat Airport (TEST)</p>
<p><b>Arrival Flight No:</b> XX9999</p>
<p><b>Arrival Time:</b> 10:30</p>
<p><b>Arrival Airline:</b> Test Air</p>
<p><b>Drop Off Location:</b> Hotel Arts Barcelona (TEST)</p>
<p><b>Phone:</b> +34600111222</p>
<p><b>Email:</b> viator.test@example.com</p>
</body></html>`;

  return { text, html, productCode };
}

export function buildViatorTestCruiseShipEmailBodies(options: {
  bookingReference: string;
  pickupDateLabel?: string;
  productCode?: string;
  cruiseShipName?: string;
  sentAt?: Date;
}): { text: string; html: string; productCode: string } {
  const sentAt = options.sentAt ?? new Date();
  const pickupDateLabel =
    options.pickupDateLabel ?? defaultTestPickupDateLabel();
  const bookingReference = options.bookingReference.trim().toUpperCase();
  const productCode =
    options.productCode?.trim().toUpperCase() ??
    VIATOR_CITY_TO_CRUISE_PRODUCT_CODES[0];
  const cruiseShipName = options.cruiseShipName?.trim() || 'Celebrity Equinox';

  const text = [
    'Viator Test Booking',
    '',
    `Booking Reference: ${bookingReference}`,
    `Product Code: ${productCode}`,
    `Travel Date: ${pickupDateLabel}`,
    'Tour Name: Barcelona City to Cruise Port Transfer (TEST)',
    'Lead Traveler Name: Test Cruise Traveler',
    'Travelers: 2',
    'Tour Language: English',
    'Hotel Pickup: Hotel SERHS Ravoli Rambla La Rambla, 128 08002 (TEST)',
    'Departure Time: 10:00 am',
    `Cruise Ship: ${cruiseShipName}`,
    'Phone: +34600111222',
    'Email: viator.test@example.com',
    '',
    `Sent at: ${sentAt.toISOString()}`,
  ].join('\n');

  const html = `<!DOCTYPE html><html><body style="font-family:sans-serif">
<h2>Viator Test Booking</h2>
<p><b>Booking Reference:</b> ${bookingReference}</p>
<p><b>Product Code:</b> ${productCode}</p>
<p><b>Travel Date:</b> ${pickupDateLabel}</p>
<p><b>Tour Name:</b> Barcelona City to Cruise Port Transfer (TEST)</p>
<p><b>Lead Traveler Name:</b> Test Cruise Traveler</p>
<p><b>Travelers:</b> 2</p>
<p><b>Tour Language:</b> English</p>
<p><b>Hotel Pickup:</b> Hotel SERHS Ravoli Rambla La Rambla, 128 08002 (TEST)</p>
<p><b>Departure Time:</b> 10:00 am</p>
<p><b>Cruise Ship:</b> ${cruiseShipName}</p>
<p><b>Phone:</b> +34600111222</p>
<p><b>Email:</b> viator.test@example.com</p>
</body></html>`;

  return { text, html, productCode };
}

/** Pickup label at least one week ahead (avoids "pickup must be in the future" on import). */
export function defaultTestPickupDateLabel(): string {
  const future = new Date();
  future.setDate(future.getDate() + 7);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: getBookingTimeZone(),
  }).format(future);
}

export function parseTestPickupDateLabel(label: string): {
  year: number;
  month: number;
  day: number;
} {
  return calendarPartsFromPickupDateLabel(label, getBookingTimeZone());
}

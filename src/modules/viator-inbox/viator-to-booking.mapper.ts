import type { CreateBookingDto } from '../bookings/dto/create-booking.dto';
import type { ViatorBookingDetails } from './parse-viator-email-body';
import {
  parseViatorPassengerCount,
  parseViatorScheduledTimeIso,
  viatorGuestEmail,
} from './parse-viator-scheduled-time';

const AIRPORT_PATTERN = /airport|el prat|aeropuerto/i;

/** MySQL `Booking.note` and several customer columns are VARCHAR(191). */
const DB_STRING_MAX = 191;

function truncateDbString(
  value: string | undefined,
  max = DB_STRING_MAX,
): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  if (max <= 1) {
    return trimmed.slice(0, max);
  }
  return `${trimmed.slice(0, max - 1)}…`;
}

/**
 * Address in `label` only; airport pickups also get `airline` + `flight` keys
 * (same as manual driver entry — shown separately in the app, not in the address line).
 */
function toPickupLocationJson(
  label: string | undefined,
  fallback: string,
  arrival?: { airline?: string; flightNo?: string },
): Record<string, unknown> {
  const text = (label?.trim() || fallback).slice(0, 500);
  const isAirport = AIRPORT_PATTERN.test(text);
  if (isAirport) {
    const loc: Record<string, unknown> = {
      kind: 'airport',
      label: text.includes('Airport') ? text : 'Barcelona-El Prat Airport',
    };
    const airline = arrival?.airline?.trim();
    const flight = arrival?.flightNo?.trim();
    if (airline) {
      loc.airline = airline;
    }
    if (flight) {
      loc.flight = flight;
    }
    return loc;
  }
  return { kind: 'location', label: text };
}

function toDropoffLocationJson(
  label: string | undefined,
  fallback: string,
): Record<string, unknown> {
  const text = (label?.trim() || fallback).slice(0, 500);
  return { kind: 'location', label: text };
}

/**
 * Booking `note` — only Special Requirements from the Viator email (if any).
 * Tour/product/travelers stay in their own fields; reference is `bookingReference`.
 */
function buildNote(details: ViatorBookingDetails): string | undefined {
  const text = details.specialRequirements?.trim();
  if (!text) {
    return undefined;
  }
  return truncateDbString(text);
}

/** Customer display name — lead traveler only (not product title or full group list). */
function resolveLeadTravelerCustomerName(
  details: ViatorBookingDetails,
): string {
  const lead = details.leadTraveler?.trim();
  if (lead && !looksLikeInvalidPersonName(lead)) {
    return lead;
  }
  const firstListed = details.travelerNames
    ?.split(/[,;]/)
    .map((s) => s.trim())
    .find(Boolean);
  if (firstListed && !looksLikeInvalidPersonName(firstListed)) {
    return firstListed;
  }
  return 'Viator guest';
}

function looksLikeInvalidPersonName(value: string): boolean {
  if (value.length > 120) {
    return true;
  }
  return /\b(adults?|children|infants?|transfer|airport|viator|pickup|tour)\b/i.test(
    value,
  );
}

function isAirportPickup(details: ViatorBookingDetails): boolean {
  return AIRPORT_PATTERN.test(details.pickupLocation ?? '');
}

function buildFlightInfo(details: ViatorBookingDetails): {
  airline?: string;
  flightNo?: string;
} {
  if (isAirportPickup(details)) {
    return {
      airline: details.arrivalAirline?.trim(),
      flightNo: details.arrivalFlightNo?.trim(),
    };
  }
  return {
    airline: details.departureAirline?.trim() || details.arrivalAirline?.trim(),
    flightNo: details.departureFlightNo?.trim() || details.arrivalFlightNo?.trim(),
  };
}

function buildFlightNumber(details: ViatorBookingDetails): string | undefined {
  const { airline, flightNo } = buildFlightInfo(details);
  const parts = [airline, flightNo].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : undefined;
}

export function mapViatorToCreateBookingDto(input: {
  viatorReference: string;
  pickupDateLabel: string;
  details: ViatorBookingDetails;
}): CreateBookingDto {
  const { viatorReference, pickupDateLabel, details } = input;
  const phone =
    details.phone?.trim() ||
    '+34000000000';
  const customerName = resolveLeadTravelerCustomerName(details);

  const airportPickup = isAirportPickup(details);
  const flight = buildFlightInfo(details);

  const scheduledTime = parseViatorScheduledTimeIso(pickupDateLabel, {
    arrivalTime: details.arrivalTime,
    departureTime: details.departureTime,
    isAirportPickup: airportPickup,
  });

  const passengerCount = parseViatorPassengerCount(details.travelers);

  return {
    bookingReference: viatorReference,
    customerName: truncateDbString(customerName),
    customerEmail: truncateDbString(
      details.email?.trim() || viatorGuestEmail(viatorReference),
    ),
    customerPhone: truncateDbString(phone),
    pickupLocation: toPickupLocationJson(details.pickupLocation, 'Pickup TBC', {
      airline: flight.airline,
      flightNo: flight.flightNo,
    }),
    dropoffLocation: toDropoffLocationJson(
      details.dropoffLocation,
      'Drop-off TBC',
    ),
    scheduledTime,
    price: 0,
    status: 'PENDING',
    luggageCount: 0,
    passengerCount,
    flightNumber: truncateDbString(buildFlightNumber(details)),
    note: buildNote(details),
  };
}

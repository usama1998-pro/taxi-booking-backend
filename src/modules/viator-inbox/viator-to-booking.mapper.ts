import type { CreateBookingDto } from '../bookings/dto/create-booking.dto';
import type { ViatorBookingDetails } from './parse-viator-email-body';
import {
  parseViatorPassengerCount,
  parseViatorScheduledTimeIso,
  viatorGuestEmail,
} from './parse-viator-scheduled-time';

const AIRPORT_PATTERN = /airport|el prat|aeropuerto/i;

function toLocationJson(
  label: string | undefined,
  fallback: string,
  flight?: { airline?: string; flightNo?: string },
): Record<string, unknown> {
  const text = (label?.trim() || fallback).slice(0, 500);
  const isAirport = AIRPORT_PATTERN.test(text);
  if (isAirport) {
    const loc: Record<string, unknown> = {
      kind: 'airport',
      label: text.includes('Airport') ? text : 'Barcelona-El Prat Airport',
    };
    if (flight?.airline) {
      loc.airline = flight.airline;
    }
    if (flight?.flightNo) {
      loc.flight = flight.flightNo;
    }
    return loc;
  }
  return { kind: 'location', label: text };
}

function buildNote(
  details: ViatorBookingDetails,
  viatorReference: string,
): string | undefined {
  const parts: string[] = [`[Viator ${viatorReference}]`];
  if (details.productName) {
    parts.push(details.productName);
  }
  if (details.tourGrade) {
    parts.push(`Grade: ${details.tourGrade}`);
  }
  if (details.travelerNames) {
    parts.push(`Travelers: ${details.travelerNames}`);
  }
  if (details.language) {
    parts.push(`Language: ${details.language}`);
  }
  if (details.specialRequirements) {
    parts.push(details.specialRequirements);
  }
  return parts.length > 1 ? parts.join(' · ') : parts[0];
}

function buildFlightNumber(details: ViatorBookingDetails): string | undefined {
  const parts = [details.arrivalAirline, details.arrivalFlightNo]
    .map((s) => s?.trim())
    .filter(Boolean);
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
  const customerName =
    details.leadTraveler?.trim() ||
    details.travelerNames?.split(',')[0]?.trim() ||
    'Viator guest';

  const scheduledTime = parseViatorScheduledTimeIso(
    pickupDateLabel,
    details.arrivalTime,
  );

  const passengerCount = parseViatorPassengerCount(details.travelers);

  return {
    bookingReference: viatorReference,
    customerName,
    customerEmail: details.email?.trim() || viatorGuestEmail(viatorReference),
    customerPhone: phone,
    pickupLocation: toLocationJson(details.pickupLocation, 'Pickup TBC', {
      airline: details.arrivalAirline,
      flightNo: details.arrivalFlightNo,
    }),
    dropoffLocation: toLocationJson(
      details.dropoffLocation,
      'Drop-off TBC',
    ),
    scheduledTime,
    price: 0,
    status: 'PENDING',
    luggageCount: 0,
    passengerCount,
    flightNumber: buildFlightNumber(details),
    note: buildNote(details, viatorReference),
  };
}

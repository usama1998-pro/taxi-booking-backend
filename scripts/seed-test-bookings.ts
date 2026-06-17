/**
 * Creates test bookings that mimic the public website and the driver app payloads.
 * Use this to verify source icons in the mobile app (globe = website, phone = app).
 *
 * Usage:
 *   npm run seed-test-bookings              # website + app (default)
 *   npm run seed-test-bookings -- --website # website only (globe icon)
 *   npm run seed-test-bookings -- --app       # app only (phone icon)
 *
 * Requires the API running (default http://localhost:3000 from APP_URL / PORT in .env).
 */
import '../src/bootstrap-env';
import { calculateBookingPrice } from '../src/modules/bookings/booking-pricing';

const BARCELONA_AIRPORT =
  'Barcelona-El Prat International Airport (BCN)';

const AIRPORT_LABEL =
  /^barcelona[- ]?el\s+prat|barcelona.*\(bcn\)|\bbcn\b/i;

type RouteType = 'fromAirport' | 'toAirport' | 'pointToPoint';

type BookingLocationJson = {
  kind: 'airport' | 'location';
  label: string;
  flight?: string;
  airline?: string;
};

function isAirportLabel(label: string): boolean {
  const trimmed = label.trim();
  if (!trimmed) {
    return false;
  }
  if (AIRPORT_LABEL.test(trimmed)) {
    return true;
  }
  return /airport|aeropuerto/i.test(trimmed);
}

function buildBookingLocation(
  label: string,
  options?: { flight?: string; airline?: string },
): BookingLocationJson {
  const trimmed = label.trim();
  const flight = options?.flight?.trim();
  const airline = options?.airline?.trim();

  if (isAirportLabel(trimmed)) {
    const loc: BookingLocationJson = {
      kind: 'airport',
      label: trimmed,
    };
    if (flight) {
      loc.flight = flight;
    }
    if (airline) {
      loc.airline = airline;
    }
    return loc;
  }

  return { kind: 'location', label: trimmed || 'Address TBC' };
}

/** Same rules as frontend/src/lib/bookingLocation.ts */
function buildBookingLocations(
  quote: { pickup: string; dropoff: string; routeType: RouteType },
  flight?: string,
): { pickupLocation: BookingLocationJson; dropoffLocation: BookingLocationJson } {
  const trimmedFlight = flight?.trim();
  const pickupIsAirport =
    quote.routeType === 'fromAirport' || isAirportLabel(quote.pickup);
  const dropoffIsAirport =
    quote.routeType === 'toAirport' || isAirportLabel(quote.dropoff);

  if (trimmedFlight && pickupIsAirport && !dropoffIsAirport) {
    return {
      pickupLocation: buildBookingLocation(quote.pickup, { flight: trimmedFlight }),
      dropoffLocation: buildBookingLocation(quote.dropoff),
    };
  }
  if (trimmedFlight && dropoffIsAirport) {
    return {
      pickupLocation: buildBookingLocation(quote.pickup),
      dropoffLocation: buildBookingLocation(quote.dropoff, { flight: trimmedFlight }),
    };
  }

  return {
    pickupLocation: buildBookingLocation(quote.pickup),
    dropoffLocation: buildBookingLocation(quote.dropoff),
  };
}

function guestEmailFromPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const core = digits.length > 0 ? digits : 'unknown';
  return `guest.${core}@taxibarcelona24.guest`;
}

function pickupIso(hoursFromNow = 48): string {
  const d = new Date();
  d.setHours(d.getHours() + hoursFromNow, 0, 0, 0);
  return d.toISOString();
}

function apiBaseUrl(): string {
  const fromEnv = process.env.APP_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, '');
  }
  const port = process.env.PORT?.trim() || '3000';
  return `http://localhost:${port}`;
}

function estimateWebsitePrice(
  passengers: number,
  luggage: number,
  infant = 0,
  child = 0,
  booster = 0,
): number {
  return calculateBookingPrice({
    passengerCount: passengers,
    luggageCount: luggage,
    infantCarrierCount: infant,
    childSeatCount: child,
    boosterCount: booster,
    isReturnTrip: false,
  });
}

function buildWebsitePayload(scheduledTime: string): Record<string, unknown> {
  const quote = {
    routeType: 'fromAirport' as const,
    pickup: BARCELONA_AIRPORT,
    dropoff: 'Hotel Arts Barcelona, Carrer de la Marina, 19-21',
  };
  const flight = 'VY1451';
  const { pickupLocation, dropoffLocation } = buildBookingLocations(quote, flight);

  return {
    customerName: 'Website Test Passenger',
    customerEmail: 'website.test@barcelonataxi24.com',
    customerPhone: '+34 600 111 222',
    flightNumber: flight,
    pickupLocation,
    dropoffLocation,
    scheduledTime,
    price: estimateWebsitePrice(2, 2, 1, 0, 0),
    status: 'PENDING',
    luggageCount: 2,
    passengerCount: 2,
    infantCarrierCount: 1,
    childSeatCount: 0,
    boosterCount: 0,
    note: 'Wheelchair accessible vehicle: Test booking from seed-test-bookings script (website).',
  };
}

function buildAppPayload(scheduledTime: string): Record<string, unknown> {
  const phone = '+34600222333';

  return {
    customerName: 'App Test Passenger',
    customerPhone: phone,
    customerEmail: guestEmailFromPhone(phone),
    pickupLocation: {
      kind: 'airport',
      label: 'Barcelona-El Prat Airport',
      airline: 'Vueling',
      flight: 'VY9999',
    },
    dropoffLocation: {
      kind: 'location',
      label: 'Plaça de Catalunya, Barcelona',
    },
    flightNumber: 'Vueling VY9999',
    scheduledTime,
    price: 0,
    status: 'PENDING',
    luggageCount: 0,
    passengerCount: 3,
    infantCarrierCount: 0,
    childSeatCount: 0,
    boosterCount: 0,
    note: 'Test booking from seed-test-bookings script (driver app).',
  };
}

type CreateResult = {
  uuid: string;
  bookingReference: string;
  customerEmail?: string | null;
};

async function postBooking(body: Record<string, unknown>): Promise<CreateResult> {
  const url = `${apiBaseUrl()}/bookings`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => null)) as
    | (CreateResult & { message?: string | string[] })
    | null;

  if (!res.ok) {
    const msg = json?.message;
    const text = Array.isArray(msg) ? msg.join(' ') : msg;
    throw new Error(text ?? `POST ${url} failed with ${res.status}`);
  }

  if (!json?.uuid || !json.bookingReference) {
    throw new Error('Booking created but uuid/reference missing in response.');
  }

  return json;
}

function expectedIcon(source: 'website' | 'app'): string {
  return source === 'website' ? 'globe (website)' : 'phone-portrait (app)';
}

async function seedOne(
  label: string,
  source: 'website' | 'app',
  body: Record<string, unknown>,
): Promise<void> {
  console.log(`\n--- ${label} ---`);
  const created = await postBooking(body);
  const email =
    typeof body.customerEmail === 'string'
      ? body.customerEmail
      : created.customerEmail ?? '—';
  console.log(`  reference:  ${created.bookingReference}`);
  console.log(`  uuid:       ${created.uuid}`);
  console.log(`  email:      ${email}`);
  console.log(`  app icon:   ${expectedIcon(source)}`);
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const websiteOnly = args.has('--website');
  const appOnly = args.has('--app');
  const both = !websiteOnly && !appOnly;

  const scheduledWebsite = pickupIso(48);
  const scheduledApp = pickupIso(50);

  console.log(`API: ${apiBaseUrl()}/bookings`);

  if (both || websiteOnly) {
    await seedOne(
      'Website booking (POST /bookings — same payload as barcelonataxi24.com)',
      'website',
      buildWebsitePayload(scheduledWebsite),
    );
  }

  if (both || appOnly) {
    await seedOne(
      'App booking (guest email + airport JSON — same as New Reservation screen)',
      'app',
      buildAppPayload(scheduledApp),
    );
  }

  console.log('\nDone. Open the driver app bookings list to compare icons.');
  console.log('  globe  = website booking');
  console.log('  phone  = app booking');
  console.log('  mail   = Viator email (BR-…)\n');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

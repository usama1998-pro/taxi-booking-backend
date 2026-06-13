/** Fixed EUR tiers: smallest vehicle band that fits passengers and luggage. */
export const PASSENGER_LUGGAGE_RATE_TIERS = [
  { passengers: 1, luggage: 1, price: 52 },
  { passengers: 2, luggage: 2, price: 52 },
  { passengers: 3, luggage: 3, price: 57 },
  { passengers: 4, luggage: 4, price: 62 },
  { passengers: 5, luggage: 5, price: 72 },
  { passengers: 6, luggage: 6, price: 77 },
  { passengers: 7, luggage: 7, price: 84 },
  { passengers: 8, luggage: 8, price: 110 },
  { passengers: 8, luggage: 12, price: 127 },
  { passengers: 8, luggage: 16, price: 153 },
] as const;

const MAX_TIER_PRICE =
  PASSENGER_LUGGAGE_RATE_TIERS[PASSENGER_LUGGAGE_RATE_TIERS.length - 1].price;

const INFANT_CARRIER_FARE = 7;
const CHILD_SEAT_FARE = 7;
const BOOSTER_FARE = 7;

/** Short trips: passenger/luggage tiers only (no per-km surcharge). */
export const DISTANCE_SHORT_TRIP_MAX_KM = 17;
/** Mid-range per-km rate (EUR), inclusive 17–32 km. */
export const DISTANCE_MID_RATE_EUR_PER_KM = 4;
export const DISTANCE_MID_MAX_KM = 32;
/** Long-range per-km rate (EUR) above 32 km. */
export const DISTANCE_LONG_RATE_EUR_PER_KM = 2;

type BookingPriceInputs = {
  passengerCount: number;
  luggageCount: number;
  infantCarrierCount: number;
  childSeatCount: number;
  boosterCount: number;
  isReturnTrip?: boolean;
  distanceKm?: number;
};

/** Base fare from passenger/luggage tiers (e.g. 1 pax + 16 bags → €153). */
export function calculatePassengerLuggageFare(
  passengerCount: number,
  luggageCount: number,
): number {
  const passengers = Math.max(1, Math.floor(passengerCount));
  const luggage = Math.max(0, Math.floor(luggageCount));
  const effectiveLuggage = luggage === 0 ? 1 : luggage;

  const fitting = PASSENGER_LUGGAGE_RATE_TIERS.filter(
    (tier) =>
      tier.passengers >= passengers && tier.luggage >= effectiveLuggage,
  );

  if (fitting.length === 0) {
    return MAX_TIER_PRICE;
  }

  return Math.min(...fitting.map((tier) => tier.price));
}

/** Per-km fare from driving distance (0 below 17 km). */
export function calculateDistanceSurcharge(distanceKm: number): number {
  const km = Math.max(0, distanceKm);
  if (km < DISTANCE_SHORT_TRIP_MAX_KM) {
    return 0;
  }
  if (km <= DISTANCE_MID_MAX_KM) {
    return km * DISTANCE_MID_RATE_EUR_PER_KM;
  }
  return km * DISTANCE_LONG_RATE_EUR_PER_KM;
}

export function usesPassengerLuggagePricing(_distanceKm?: number): boolean {
  return true;
}

/** Keep pricing deterministic on the server to avoid client-side drift/tampering. */
export function calculateBookingPrice(input: BookingPriceInputs): number {
  const infantExtra =
    Math.max(0, input.infantCarrierCount) * INFANT_CARRIER_FARE;
  const childExtra = Math.max(0, input.childSeatCount) * CHILD_SEAT_FARE;
  const boosterExtra = Math.max(0, input.boosterCount) * BOOSTER_FARE;
  const seatExtras = infantExtra + childExtra + boosterExtra;

  const tierFare = calculatePassengerLuggageFare(
    input.passengerCount,
    input.luggageCount,
  );
  const distanceFare =
    input.distanceKm != null &&
    input.distanceKm >= DISTANCE_SHORT_TRIP_MAX_KM
      ? calculateDistanceSurcharge(input.distanceKm)
      : 0;
  const oneWayTotal = tierFare + distanceFare + seatExtras;
  const total = input.isReturnTrip ? oneWayTotal * 2 : oneWayTotal;
  return Math.round(total);
}

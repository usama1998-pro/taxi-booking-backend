const BASE_FARE = 44;
const EXTRA_PASSENGER_FARE = 6;
const LUGGAGE_FARE = 2;
const INFANT_CARRIER_FARE = 5;
const CHILD_SEAT_FARE = 5;
const BOOSTER_FARE = 5;

type BookingPriceInputs = {
  passengerCount: number;
  luggageCount: number;
  infantCarrierCount: number;
  childSeatCount: number;
  boosterCount: number;
};

/** Keep pricing deterministic on the server to avoid client-side drift/tampering. */
export function calculateBookingPrice(input: BookingPriceInputs): number {
  const passengerExtra = Math.max(0, input.passengerCount - 1) * EXTRA_PASSENGER_FARE;
  const luggageExtra = Math.max(0, input.luggageCount) * LUGGAGE_FARE;
  const infantExtra = Math.max(0, input.infantCarrierCount) * INFANT_CARRIER_FARE;
  const childExtra = Math.max(0, input.childSeatCount) * CHILD_SEAT_FARE;
  const boosterExtra = Math.max(0, input.boosterCount) * BOOSTER_FARE;
  return BASE_FARE + passengerExtra + luggageExtra + infantExtra + childExtra + boosterExtra;
}

import {
  calculateBookingPrice,
  calculatePassengerLuggageFare,
} from './booking-pricing';

describe('calculatePassengerLuggageFare', () => {
  it.each([
    [1, 1, 52],
    [2, 2, 52],
    [3, 3, 57],
    [4, 4, 62],
    [5, 5, 72],
    [6, 6, 77],
    [7, 7, 84],
    [8, 8, 110],
    [8, 12, 127],
    [8, 16, 153],
  ])('%i passengers and %i luggage → €%i', (passengers, luggage, price) => {
    expect(calculatePassengerLuggageFare(passengers, luggage)).toBe(price);
  });

  it('uses the highest tier when luggage exceeds table capacity (1 pax, 16 bags)', () => {
    expect(calculatePassengerLuggageFare(1, 16)).toBe(153);
  });

  it('uses the next tier when luggage exceeds passenger-matched band (8 pax, 10 bags)', () => {
    expect(calculatePassengerLuggageFare(8, 10)).toBe(127);
  });

  it('treats zero luggage as one piece for tier matching', () => {
    expect(calculatePassengerLuggageFare(1, 0)).toBe(52);
  });

  it('falls back to the max tier when passengers exceed table capacity', () => {
    expect(calculatePassengerLuggageFare(12, 1)).toBe(153);
  });
});

describe('calculateBookingPrice', () => {
  it('adds child seat extras on top of the tier fare', () => {
    expect(
      calculateBookingPrice({
        passengerCount: 1,
        luggageCount: 1,
        infantCarrierCount: 1,
        childSeatCount: 0,
        boosterCount: 0,
      }),
    ).toBe(59);
  });

  it('doubles the full one-way total for return trips', () => {
    expect(
      calculateBookingPrice({
        passengerCount: 1,
        luggageCount: 1,
        infantCarrierCount: 0,
        childSeatCount: 0,
        boosterCount: 0,
        isReturnTrip: true,
      }),
    ).toBe(104);
  });

  it('doubles 2 pax / 6 luggage + infant on return (€84 → €168)', () => {
    expect(
      calculateBookingPrice({
        passengerCount: 2,
        luggageCount: 6,
        infantCarrierCount: 1,
        childSeatCount: 0,
        boosterCount: 0,
        isReturnTrip: true,
      }),
    ).toBe(168);
  });

  it('doubles 1 pax / 8 luggage on return (€110 → €220)', () => {
    expect(
      calculateBookingPrice({
        passengerCount: 1,
        luggageCount: 8,
        infantCarrierCount: 0,
        childSeatCount: 0,
        boosterCount: 0,
        isReturnTrip: true,
      }),
    ).toBe(220);
  });
});

import type { ViatorBookingDetails } from './parse-viator-email-body';
import {
  mapViatorToCreateBookingDto,
  resolveViatorDropoffLocationLabel,
  resolveViatorPickupLocationLabel,
} from './viator-to-booking.mapper';

describe('viator-to-booking.mapper (cruise ship to city)', () => {
  const baseDetails: ViatorBookingDetails = {
    productCode: '419333P8',
    cruiseShipName: 'MSC Meraviglia',
    pickupLocation: 'Port of Barcelona, Moll Adossat',
    dropoffLocation: 'Hotel Arts Barcelona',
    leadTraveler: 'Jane Cruise',
    travelers: '2',
    arrivalTime: '8:30 am',
  };

  it('uses cruise ship name only in pickup label', () => {
    expect(resolveViatorPickupLocationLabel(baseDetails)).toBe(
      'MSC Meraviglia',
    );
  });

  it('uses cruise ship alone when port is missing', () => {
    expect(
      resolveViatorPickupLocationLabel({
        ...baseDetails,
        pickupLocation: undefined,
      }),
    ).toBe('MSC Meraviglia');
  });

  it('falls back to port when cruise ship name is missing', () => {
    expect(
      resolveViatorPickupLocationLabel({
        ...baseDetails,
        cruiseShipName: undefined,
      }),
    ).toBe('Port of Barcelona, Moll Adossat');
  });

  it('maps cruise ship pickup and city drop-off into booking DTO', () => {
    const dto = mapViatorToCreateBookingDto({
      viatorReference: 'BR-123456789',
      pickupDateLabel: 'Thu, Jun 12, 2026',
      details: baseDetails,
    });
    expect(dto.pickupLocation).toEqual({
      kind: 'location',
      label: 'MSC Meraviglia',
    });
    expect(dto.dropoffLocation).toEqual({
      kind: 'location',
      label: 'Hotel Arts Barcelona',
    });
  });
});

describe('viator-to-booking.mapper (city to cruise)', () => {
  const baseDetails: ViatorBookingDetails = {
    productCode: '406570P62',
    cruiseShipName: 'Costa Smeralda',
    pickupLocation: 'Hotel Arts Barcelona',
    dropoffLocation: 'Port of Barcelona, Moll Adossat',
    leadTraveler: 'John Cruise',
    travelers: '2',
    departureTime: '2:00 pm',
  };

  it('keeps city pickup unchanged', () => {
    expect(resolveViatorPickupLocationLabel(baseDetails)).toBe(
      'Hotel Arts Barcelona',
    );
  });

  it('uses cruise ship name only in drop-off label', () => {
    expect(resolveViatorDropoffLocationLabel(baseDetails)).toBe(
      'Costa Smeralda',
    );
  });

  it('falls back to port when cruise ship name is missing', () => {
    expect(
      resolveViatorDropoffLocationLabel({
        ...baseDetails,
        cruiseShipName: undefined,
      }),
    ).toBe('Port of Barcelona, Moll Adossat');
  });

  it('maps city pickup and cruise ship drop-off into booking DTO', () => {
    const dto = mapViatorToCreateBookingDto({
      viatorReference: 'BR-987654321',
      pickupDateLabel: 'Fri, Jun 13, 2026',
      details: baseDetails,
    });
    expect(dto.pickupLocation).toEqual({
      kind: 'location',
      label: 'Hotel Arts Barcelona',
    });
    expect(dto.dropoffLocation).toEqual({
      kind: 'location',
      label: 'Costa Smeralda',
    });
  });
});

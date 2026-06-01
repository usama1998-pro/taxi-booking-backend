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

  it('uses tour grade code for pickup time, not arrival/disembarkation time', () => {
    const dto = mapViatorToCreateBookingDto({
      viatorReference: 'BR-123456789',
      pickupDateLabel: 'Thu, Jun 12, 2026',
      details: {
        ...baseDetails,
        tourGradeCode: 'TG1~11:00',
      },
    });
    expect(dto.note).toBeUndefined();
    const scheduled = new Date(dto.scheduledTime);
    expect(scheduled.getUTCHours()).toBe(9);
    expect(scheduled.getUTCMinutes()).toBe(0);
  });

  it('leaves pickup time unset when only disembarkation time is present', () => {
    const dto = mapViatorToCreateBookingDto({
      viatorReference: 'BR-123456789',
      pickupDateLabel: 'Thu, Jun 12, 2026',
      details: baseDetails,
    });
    expect(dto.note).toContain('No pickup time selected by customer');
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

describe('viator-to-booking.mapper (cruise port to airport)', () => {
  const baseDetails: ViatorBookingDetails = {
    productCode: '406570P8',
    cruiseShipName: 'Norwegian Escape',
    pickupLocation: 'Port of Barcelona, Moll Adossat',
    dropoffLocation: 'Barcelona-El Prat Airport',
    departureFlightNo: 'VY1234',
    departureAirline: 'Vueling',
    tourGradeCode: 'TG1~14:00',
  };

  it('uses cruise ship name only in pickup label', () => {
    expect(resolveViatorPickupLocationLabel(baseDetails)).toBe('Norwegian Escape');
  });

  it('keeps airport drop-off unchanged', () => {
    expect(resolveViatorDropoffLocationLabel(baseDetails)).toBe(
      'Barcelona-El Prat Airport',
    );
  });

  it('maps cruise ship pickup and airport drop-off into booking DTO', () => {
    const dto = mapViatorToCreateBookingDto({
      viatorReference: 'BR-555666777',
      pickupDateLabel: 'Mon, Jul 6, 2026',
      details: baseDetails,
    });
    expect(dto.pickupLocation).toEqual({
      kind: 'location',
      label: 'Norwegian Escape',
    });
    expect(dto.dropoffLocation).toMatchObject({
      kind: 'airport',
      label: 'Barcelona-El Prat Airport',
      flight: 'VY1234',
      airline: 'Vueling',
    });
    expect(dto.returnTime).toBeUndefined();
  });
});

describe('viator-to-booking.mapper (city to airport)', () => {
  const baseDetails: ViatorBookingDetails = {
    productCode: '419333P1',
    pickupLocation: 'Hotel Arts Barcelona',
    dropoffLocation: 'Barcelona-El Prat Airport',
    departureFlightNo: 'IB3201',
    departureAirline: 'Iberia',
    departureTime: '8:45 pm',
    arrivalFlightNo: 'SHOULD-NOT-USE',
    arrivalAirline: 'IGNORE',
  };

  it('uses departure fields for airport drop-off and ignores arrival fallback', () => {
    const dto = mapViatorToCreateBookingDto({
      viatorReference: 'BR-999000111',
      pickupDateLabel: 'Mon, Jul 6, 2026',
      details: baseDetails,
    });
    expect(dto.dropoffLocation).toMatchObject({
      kind: 'airport',
      label: 'Barcelona-El Prat Airport',
      flight: 'IB3201',
      airline: 'Iberia',
      departureTime: '8:45 pm',
    });
    expect(dto.returnTime).toBeDefined();
  });
});

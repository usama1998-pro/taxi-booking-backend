import { parseViatorEmailBody } from './parse-viator-email-body';
import {
  resolveViatorDropoffLocationLabel,
  resolveViatorPickupLocationLabel,
} from './viator-to-booking.mapper';

describe('parseViatorEmailBody (city to cruise)', () => {
  const body = [
    'Booking Details',
    'Booking Reference: BR-987654321',
    'Product Code: 406570P62',
    'Travel Date: Fri, Jun 13, 2026',
    'Tour Name: Barcelona City to Cruise Port Transfer',
    'Lead Traveler Name: John Cruise',
    'Travelers: 2',
    'Hotel Pickup: Hotel Arts Barcelona',
    'Departure Time: 2:00 pm',
    'Cruise Ship: Costa Smeralda',
    'Port Drop Off: Port of Barcelona, Moll Adossat',
    'Phone: +34600111222',
  ].join(' ');

  it('parses city pickup, cruise ship, and port drop-off', async () => {
    const details = await parseViatorEmailBody(body);
    expect(details.productCode).toBe('406570P62');
    expect(details.pickupLocation).toBe('Hotel Arts Barcelona');
    expect(details.cruiseShipName).toBe('Costa Smeralda');
    expect(details.dropoffLocation).toBe('Port of Barcelona, Moll Adossat');
    expect(details.departureTime).toBe('2:00 pm');
  });
});

describe('parseViatorEmailBody (city to cruise — ship only, no port drop-off)', () => {
  const body = [
    'Booking Details',
    'Booking Reference: BR-1399824145',
    'Product Code: 406570P62',
    'Travel Date: Sat, Sep 12, 2026',
    'Tour Name: Barcelona City to Cruise Port Transfer',
    'Lead Traveler Name: Shelly Marsh',
    'Travelers: 2',
    'Hotel Pickup: Hotel SERHS Ravoli Rambla La Rambla, 128 08002',
    'Departure Time: 10:00 am',
    'Cruise Ship: Celebrity equinox',
    'Phone: +14432574269',
  ].join(' ');

  it('parses cruise ship name when no Port Drop Off is present', async () => {
    const details = await parseViatorEmailBody(body);
    expect(details.productCode).toBe('406570P62');
    expect(details.pickupLocation).toBe(
      'Hotel SERHS Ravoli Rambla La Rambla, 128 08002',
    );
    expect(details.cruiseShipName).toBe('Celebrity equinox');
    expect(details.dropoffLocation).toBeUndefined();
    expect(details.departureTime).toBe('10:00 am');
    expect(details.leadTraveler).toBe('Shelly Marsh');
    expect(details.travelers).toBe('2');
  });

  it('resolves dropoff to cruise ship name when port is missing', async () => {
    const details = await parseViatorEmailBody(body);
    expect(resolveViatorDropoffLocationLabel(details)).toBe('Celebrity equinox');
  });

  it('keeps city pickup unchanged', async () => {
    const details = await parseViatorEmailBody(body);
    expect(resolveViatorPickupLocationLabel(details)).toBe(
      'Hotel SERHS Ravoli Rambla La Rambla, 128 08002',
    );
  });
});

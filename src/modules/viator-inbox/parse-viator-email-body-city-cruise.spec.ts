import { parseViatorEmailBody } from './parse-viator-email-body';

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

import { parseViatorEmailBody } from './parse-viator-email-body';

describe('parseViatorEmailBody (cruise ship)', () => {
  const cruiseBody = [
    'Booking Details',
    'Booking Reference: BR-123456789',
    'Product Code: 419333P8',
    'Travel Date: Thu, Jun 12, 2026',
    'Tour Name: Barcelona Cruise Ship to City Transfer',
    'Lead Traveler Name: Jane Cruise',
    'Travelers: 2',
    'Cruise Ship: MSC Meraviglia',
    'Port Pickup: Port of Barcelona, Moll Adossat',
    'Arrival Time: 8:30 am',
    'Drop Off Location: Hotel Arts Barcelona',
    'Phone: +34600111222',
  ].join(' ');

  it('parses cruise ship name, port pickup, and drop-off', async () => {
    const details = await parseViatorEmailBody(cruiseBody);
    expect(details.productCode).toBe('419333P8');
    expect(details.cruiseShipName).toBe('MSC Meraviglia');
    expect(details.pickupLocation).toBe('Port of Barcelona, Moll Adossat');
    expect(details.dropoffLocation).toBe('Hotel Arts Barcelona');
    expect(details.arrivalTime).toBe('8:30 am');
  });

  it('parses disembarkation time without treating it as arrival time', async () => {
    const body = [
      'Booking Details',
      'Booking Reference: BR-111222333',
      'Product Code: 419333P8',
      'Port Pickup: Port of Barcelona, Moll Adossat',
      'Disembarkation Time: 9:15 am',
      'Cruise Ship: MSC Meraviglia',
      'Drop Off Location: Hotel Arts Barcelona',
    ].join(' ');

    const details = await parseViatorEmailBody(body);
    expect(details.disembarkationTime).toBe('9:15 am');
    expect(details.arrivalTime).toBeUndefined();
    expect(details.pickupLocation).toBe('Port of Barcelona, Moll Adossat');
  });
});

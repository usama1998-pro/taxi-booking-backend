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
    'Drop Off Location: Hotel Arts Barcelona',
    'Phone: +34600111222',
  ].join(' ');

  it('parses cruise ship name, port pickup, and drop-off', async () => {
    const details = await parseViatorEmailBody(cruiseBody);
    expect(details.productCode).toBe('419333P8');
    expect(details.cruiseShipName).toBe('MSC Meraviglia');
    expect(details.pickupLocation).toBe('Port of Barcelona, Moll Adossat');
    expect(details.dropoffLocation).toBe('Hotel Arts Barcelona');
  });

  it('parses disembarkation time without treating it as pickup time', async () => {
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
    expect(details.pickupLocation).toBe('Port of Barcelona, Moll Adossat');
  });
});

describe('parseViatorEmailBody (arrival flight labels)', () => {
  it('parses arrival flight number from "Arrival Flight No." label', async () => {
    const body = [
      'Booking Details',
      'Booking Reference: BR-222333444',
      'Travel Date: Thu, Jun 12, 2026',
      'Pickup Location: Barcelona-El Prat Airport',
      'Arrival Flight No.: UA992',
      'Arrival Airline: United',
      'Drop Off Location: Hotel Arts Barcelona',
    ].join(' ');

    const details = await parseViatorEmailBody(body);
    expect(details.arrivalFlightNo).toBe('UA992');
    expect(details.arrivalAirline).toBe('United');
  });
});

describe('parseViatorEmailBody (pickup name only)', () => {
  it('keeps only pickup place name and strips boarding time', async () => {
    const body = [
      'Booking Details',
      'Booking Reference: BR-555666777',
      'Travel Date: Thu, Jun 12, 2026',
      'Hotel Pickup: Holiday Inn Express Barcelona - City 22@, Holiday Inn Express Barcelona - City 22@, Carrer de Pallars, Barcelona, Spain',
      'Boarding Time: 11 AM',
      'Drop Off Location: Barcelona-El Prat Airport',
    ].join(' ');

    const details = await parseViatorEmailBody(body);
    expect(details.pickupLocation).toBe('Holiday Inn Express Barcelona - City 22@');
  });

  it('does not bleed dropoff location name into pickup location', async () => {
    const body = [
      'Booking Details',
      'Booking Reference: BR-888999000',
      'Travel Date: Thu, Jun 12, 2026',
      'Hotel Pickup: Hostal Bedmates',
      'Drop Off Location Name: Barcelona-El Prat Airport',
      'Arrival Flight No: UA992',
    ].join(' ');

    const details = await parseViatorEmailBody(body);
    expect(details.pickupLocation).toBe('Hostal Bedmates');
    expect(details.dropoffLocation).toBe('Barcelona-El Prat Airport');
    expect(details.arrivalFlightNo).toBe('UA992');
  });
});

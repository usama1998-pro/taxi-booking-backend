import type { ViatorBookingDetails } from './parse-viator-email-body';

export type ViatorBookingFields = ViatorBookingDetails;

export function mergeBookingFields(
  base: ViatorBookingFields,
): ViatorBookingFields {
  const out: ViatorBookingFields = {};
  for (const [key, value] of Object.entries(base)) {
    if (key === 'emailText') {
      continue;
    }
    if (typeof value === 'string' && value.trim()) {
      (out as Record<string, string>)[key] = value.trim();
    }
  }
  return out;
}

export function hasStructuredBookingFields(fields: ViatorBookingFields): boolean {
  return Boolean(
    fields.productName ||
      fields.leadTraveler ||
      fields.travelerNames ||
      fields.phone ||
      fields.pickupLocation ||
      fields.cruiseShipName ||
      fields.dropoffLocation ||
      fields.travelers ||
      fields.arrivalFlightNo ||
      fields.arrivalTime,
  );
}

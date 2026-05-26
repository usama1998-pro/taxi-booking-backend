import { simpleParser } from 'mailparser';

import { normalizePhoneNumber } from '../../common/utils/phone.util';
import { normalizeViatorProductCode } from './viator-allowed-products';

export type ViatorBookingDetails = {
  productName?: string;
  leadTraveler?: string;
  travelerNames?: string;
  phone?: string;
  email?: string;
  pickupLocation?: string;
  dropoffLocation?: string;
  cruiseShipName?: string;
  travelers?: string;
  language?: string;
  specialRequirements?: string;
  arrivalFlightNo?: string;
  arrivalAirline?: string;
  /** Ship disembarkation — not used for pickup scheduling. */
  disembarkationTime?: string;
  departureFlightNo?: string;
  departureTime?: string;
  departureAirline?: string;
  tourGrade?: string;
  tourGradeCode?: string;
  productCode?: string;
};

/** Ordered longest-first so inline regex stops at the next real label. */
const VIATOR_INLINE_FIELDS: { key: keyof ViatorBookingDetails; labels: string[] }[] = [
  { key: 'productName', labels: ['Tour Name'] },
  {
    key: 'leadTraveler',
    labels: [
      'Lead Traveler Name',
      'Lead Traveller Name',
      'Lead Traveler',
      'Lead Traveller',
    ],
  },
  { key: 'travelerNames', labels: ['Traveler Names'] },
  { key: 'travelers', labels: ['Travelers'] },
  { key: 'tourGrade', labels: ['Tour Grade Description', 'Tour Grade'] },
  { key: 'tourGradeCode', labels: ['Tour Grade Code'] },
  { key: 'language', labels: ['Tour Language'] },
  { key: 'cruiseShipName', labels: ['Cruise Ship Name', 'Cruise Ship'] },
  { key: 'pickupLocation', labels: ['Hotel Pickup', 'Pickup Location', 'Meeting Point', 'Port Pickup'] },
  { key: 'arrivalFlightNo', labels: ['Arrival Flight No', 'Arrival Flight Number'] },
  { key: 'arrivalAirline', labels: ['Arrival Airline'] },
  {
    key: 'disembarkationTime',
    labels: ['Disembarkation Time', 'Disembarkment Time'],
  },
  {
    key: 'departureFlightNo',
    labels: ['Departure Flight No', 'Departure Flight Number'],
  },
  { key: 'departureTime', labels: ['Departure Time'] },
  { key: 'departureAirline', labels: ['Departure Airline'] },
  {
    key: 'dropoffLocation',
    labels: [
      'Drop Off Location',
      'Drop-off Location',
      'Dropoff Location',
      'Drop Off Point',
      'Destination',
      'Port Drop Off',
      'Port Drop-off',
    ],
  },
  { key: 'specialRequirements', labels: ['Special Requirements', 'Special Requests'] },
];

/** Labels that appear in Viator emails but are not exported (used as regex boundaries). */
const BOUNDARY_LABELS = [
  'Booking Reference',
  'Travel Date',
  'Date',
  'Product Code',
  'Location',
  'Net Rate',
  'Phone',
  'Alternate Phone',
];

const ALL_INLINE_LABELS = [
  ...VIATOR_INLINE_FIELDS.flatMap((f) => f.labels),
  ...BOUNDARY_LABELS,
];

function stripHtmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<td[^>]*>/gi, '\n')
    .replace(/<th[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripUrlsAndNoise(text: string): string {
  return text
    .replace(/\[https?:\/\/[^\]]*\]/gi, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeValue(raw: string): string | undefined {
  let v = raw.replace(/\s+/g, ' ').trim();
  if (v.length < 1 || v.length > 400) {
    return undefined;
  }
  if (/=0A|=0D|=3D/i.test(v)) {
    return undefined;
  }
  if (/^(no|n\/a|none|—|-)$/i.test(v)) {
    return undefined;
  }
  if (/send the customer a message/i.test(v)) {
    v = v.replace(/send the customer a message\.?/gi, '').trim();
  }
  if (!v) {
    return undefined;
  }
  return v;
}

/** Flight numbers must not contain clock times (common parse bleed). */
function sanitizeFlightNumber(raw?: string): string | undefined {
  if (!raw) {
    return undefined;
  }
  const v = raw.replace(/\s+/g, ' ').trim();
  if (/\d{1,2}:\d{2}\s*(?:am|pm)?/i.test(v) || /\btime\b/i.test(v)) {
    return undefined;
  }
  if (!/^[A-Za-z0-9-]{1,12}$/.test(v)) {
    return undefined;
  }
  return sanitizeValue(v);
}

function sanitizeTimeLabel(raw?: string): string | undefined {
  if (!raw) {
    return undefined;
  }
  const v = raw.replace(/\s+/g, ' ').trim();
  if (!/^\d{1,2}:\d{2}\s*(?:am|pm)?$/i.test(v)) {
    return undefined;
  }
  return sanitizeValue(v);
}

function extractBookingSection(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n');
  const startMatch = normalized.search(
    /Booking\s+Details|Booking\s+Reference\s*:/i,
  );
  const start = startMatch >= 0 ? startMatch : 0;
  let section = normalized.slice(start);
  const endMatch = section.search(
    /(?:^|\n)\s*(?:Have questions|Optional:\s*Acknowledge|You can go to our Help)/im,
  );
  if (endMatch > 0) {
    section = section.slice(0, endMatch);
  }
  return stripUrlsAndNoise(section.replace(/\n/g, ' '));
}

function readInlineLabel(section: string, label: string): string | undefined {
  const others = ALL_INLINE_LABELS.filter((l) => l !== label)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex);
  const stop =
    others.length > 0 ? `(?:${others.join('|')})` : '(?!)';
  const re = new RegExp(
    `${escapeRegex(label)}\\s*:\\s*(.+?)(?=\\s+${stop}\\s*:|$)`,
    'is',
  );
  const match = section.match(re);
  return match?.[1] ? sanitizeValue(match[1]) : undefined;
}

function extractInlineFields(section: string): Partial<ViatorBookingDetails> {
  const out: Partial<ViatorBookingDetails> = {};
  for (const { key, labels } of VIATOR_INLINE_FIELDS) {
    for (const label of labels) {
      const val = readInlineLabel(section, label);
      if (val && !out[key]) {
        out[key] = val;
      }
    }
  }
  return out;
}

function extractAlternatePhone(text: string): string | undefined {
  const patterns = [
    /\(Alternate\s+Phone\)\s*([A-Z]{0,3}\+?[\d\s().-]{8,24})/i,
    /Alternate\s+Phone\s*:\s*([A-Z]{0,3}\+?[\d\s().-]{8,24})/i,
    /Phone\s*:\s*([A-Z]{0,3}\+?[\d\s().-]{8,24})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const phone = normalizePhoneNumber(m[1].replace(/\s+/g, ' '));
      if (phone.length >= 8) {
        return phone;
      }
    }
  }
  return undefined;
}

function extractEmbeddedLegFromText(text: string, leg: 'arrival' | 'departure'): {
  airline?: string;
  flightNo?: string;
  time?: string;
} {
  const prefix = leg === 'arrival' ? 'arrival' : 'departure';
  const out: { airline?: string; flightNo?: string; time?: string } = {};
  const airline = text.match(
    new RegExp(`\\b${prefix}\\s+airline\\s*:\\s*([A-Za-z0-9]{2,12})\\b`, 'i'),
  )?.[1];
  const flight = text.match(
    new RegExp(
      `\\b${prefix}\\s+flight\\s*(?:no\\.?|number)?\\s*:\\s*([A-Za-z0-9]{1,10})\\b`,
      'i',
    ),
  )?.[1];
  // Avoid matching "disembarkation time" / "disembarkment time" as arrival/departure time.
  const time = leg === 'departure'
    ? text.match(
      new RegExp(
        `(?<!disembark(?:ation|ment)\\s+)\\b${prefix}\\s+time\\s*:\\s*(\\d{1,2}:\\d{2}\\s*(?:am|pm)?)\\b`,
        'i',
      ),
    )?.[1]
    : undefined;
  if (airline) {
    out.airline = sanitizeValue(airline);
  }
  if (flight) {
    out.flightNo = sanitizeFlightNumber(flight);
  }
  if (time) {
    out.time = sanitizeTimeLabel(time);
  }
  return out;
}

function applyEmbeddedLegFromPickup(fields: Partial<ViatorBookingDetails>): void {
  const raw = fields.pickupLocation;
  if (!raw) {
    return;
  }
  const arrival = extractEmbeddedLegFromText(raw, 'arrival');
  const departure = extractEmbeddedLegFromText(raw, 'departure');

  if (!fields.arrivalAirline && arrival.airline) {
    fields.arrivalAirline = arrival.airline;
  }
  if (!fields.arrivalFlightNo && arrival.flightNo) {
    fields.arrivalFlightNo = arrival.flightNo;
  }

  if (!fields.departureAirline && departure.airline) {
    fields.departureAirline = departure.airline;
  }
  if (!fields.departureFlightNo && departure.flightNo) {
    fields.departureFlightNo = departure.flightNo;
  }
  if (!fields.departureTime && departure.time) {
    fields.departureTime = departure.time;
  }
}

function normalizeFlightAndTimeFields(
  fields: Partial<ViatorBookingDetails>,
): void {
  fields.arrivalFlightNo = sanitizeFlightNumber(fields.arrivalFlightNo);
  fields.departureFlightNo = sanitizeFlightNumber(fields.departureFlightNo);
  fields.departureTime = sanitizeTimeLabel(fields.departureTime);
  fields.disembarkationTime = sanitizeTimeLabel(fields.disembarkationTime);
}

function cleanPickupLocationLabel(raw?: string): string | undefined {
  if (!raw) {
    return undefined;
  }
  let v = raw;
  v = v.replace(/\s+special\s+requirements\s*:.*/i, '').trim();
  v = v.replace(/\s+arrival\s+(?:flight|airline)\s*(?:no\.?|number)?\s*:.*/i, '').trim();
  v = v.replace(/\s+departure\s+(?:flight|airline|time)\s*(?:no\.?|number)?\s*:.*/i, '').trim();
  v = v.replace(
    /\s+disembark(?:ation|ment)\s+time\s*:.*/i,
    '',
  ).trim();
  v = v.replace(/\s+drop[\s-]*off\s+location\s*:.*/i, '').trim();
  v = v.replace(/\(?alternate\s+phone\)?.*$/i, '').trim();
  v = v.replace(/\bphone\s*:.*/i, '').trim();
  v = v.replace(/\bUS\+?\d[\d\s().-]{7,}\b/gi, '').trim();
  v = v.replace(/\s{2,}/g, ' ').trim();
  return sanitizeValue(v);
}

function cleanSpecialRequirements(raw?: string): string | undefined {
  if (!raw) {
    return undefined;
  }
  let v = raw;
  if (/^no\s*phone\s*:/i.test(v)) {
    v = v.replace(/^no\s*phone\s*:\s*/i, '').trim();
  }
  if (/^\(alternate phone\)/i.test(v)) {
    return undefined;
  }
  if (/phone\s*:/i.test(v)) {
    const beforePhone = v.split(/\s*phone\s*:/i)[0]?.trim();
    v = beforePhone && !/^no$/i.test(beforePhone) ? beforePhone : '';
  }
  return sanitizeValue(v);
}

function extractFromText(text: string): ViatorBookingDetails {
  const section = extractBookingSection(text);
  const fields = extractInlineFields(section);

  const phone = extractAlternatePhone(section) ?? extractAlternatePhone(text);
  if (phone) {
    fields.phone = phone;
  }

  fields.specialRequirements = cleanSpecialRequirements(
    fields.specialRequirements,
  );

  normalizeFlightAndTimeFields(fields);
  applyEmbeddedLegFromPickup(fields);
  const cruiseShipRaw = fields.cruiseShipName?.trim();
  fields.cruiseShipName = cruiseShipRaw
    ? sanitizeValue(cruiseShipRaw)
    : undefined;
  fields.pickupLocation = cleanPickupLocationLabel(fields.pickupLocation);
  fields.dropoffLocation = cleanPickupLocationLabel(fields.dropoffLocation);

  if (fields.productName) {
    fields.productName = fields.productName.replace(/\s+Travel\s+Date\s*$/i, '').trim();
  }

  const productCode = normalizeViatorProductCode(
    readInlineLabel(section, 'Product Code'),
  );
  if (productCode) {
    fields.productCode = productCode;
  }

  return fields;
}

export async function parseViatorEmailBody(
  rawSource: string | Buffer,
): Promise<ViatorBookingDetails> {
  try {
    const parsed = await simpleParser(rawSource);
    const text =
      parsed.text?.trim() ||
      stripHtmlToText(typeof parsed.html === 'string' ? parsed.html : '');
    if (text) {
      return extractFromText(text);
    }
  } catch {
    // Fall through to raw decode below.
  }

  const fallback = stripHtmlToText(
    typeof rawSource === 'string' ? rawSource : rawSource.toString('utf8'),
  );
  return extractFromText(fallback);
}

/** `Booking Reference:` from Viator / test email body (not the subject `#BR-…` marker). */
export function parseViatorBookingReferenceFromText(
  text: string,
  options?: { allowTestMarker?: boolean },
): string | null {
  const section = extractBookingSection(text);
  const raw = readInlineLabel(section, 'Booking Reference');
  if (!raw) {
    return null;
  }
  const normalized = raw.trim().toUpperCase();
  if (/^BR-\d+$/.test(normalized)) {
    return normalized;
  }
  if (options?.allowTestMarker && /^BR-TEST$/i.test(normalized)) {
    return normalized;
  }
  return null;
}

export async function parseViatorBookingReferenceFromBody(
  rawSource: string | Buffer,
  options?: { allowTestMarker?: boolean },
): Promise<string | null> {
  try {
    const parsed = await simpleParser(rawSource);
    const text =
      parsed.text?.trim() ||
      stripHtmlToText(typeof parsed.html === 'string' ? parsed.html : '');
    if (text) {
      return parseViatorBookingReferenceFromText(text, options);
    }
  } catch {
    // Fall through to raw decode below.
  }

  const fallback = stripHtmlToText(
    typeof rawSource === 'string' ? rawSource : rawSource.toString('utf8'),
  );
  return parseViatorBookingReferenceFromText(fallback, options);
}

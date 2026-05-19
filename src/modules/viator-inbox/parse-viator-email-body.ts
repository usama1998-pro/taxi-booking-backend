import { simpleParser } from 'mailparser';

export type ViatorBookingDetails = {
  productName?: string;
  leadTraveler?: string;
  travelerNames?: string;
  phone?: string;
  email?: string;
  pickupLocation?: string;
  dropoffLocation?: string;
  travelers?: string;
  language?: string;
  specialRequirements?: string;
  arrivalFlightNo?: string;
  arrivalTime?: string;
  arrivalAirline?: string;
  tourGrade?: string;
};

/** Ordered longest-first so inline regex stops at the next real label. */
const VIATOR_INLINE_FIELDS: { key: keyof ViatorBookingDetails; labels: string[] }[] = [
  { key: 'productName', labels: ['Tour Name'] },
  { key: 'leadTraveler', labels: ['Lead Traveler Name'] },
  { key: 'travelerNames', labels: ['Traveler Names'] },
  { key: 'travelers', labels: ['Travelers'] },
  { key: 'tourGrade', labels: ['Tour Grade Description', 'Tour Grade'] },
  { key: 'language', labels: ['Tour Language'] },
  { key: 'pickupLocation', labels: ['Hotel Pickup', 'Pickup Location', 'Meeting Point'] },
  { key: 'arrivalFlightNo', labels: ['Arrival Flight No', 'Arrival Flight Number'] },
  { key: 'arrivalTime', labels: ['Arrival Time'] },
  { key: 'arrivalAirline', labels: ['Arrival Airline'] },
  { key: 'dropoffLocation', labels: ['Drop Off Location', 'Drop-off Location', 'Dropoff Location'] },
  { key: 'specialRequirements', labels: ['Special Requirements', 'Special Requests'] },
];

/** Labels that appear in Viator emails but are not exported (used as regex boundaries). */
const BOUNDARY_LABELS = [
  'Booking Reference',
  'Travel Date',
  'Date',
  'Product Code',
  'Tour Grade Code',
  'Location',
  'Net Rate',
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
      const phone = m[1].replace(/\s+/g, ' ').trim();
      if (phone.length >= 8) {
        return phone;
      }
    }
  }
  return undefined;
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

  if (fields.productName) {
    fields.productName = fields.productName.replace(/\s+Travel\s+Date\s*$/i, '').trim();
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

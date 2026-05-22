/** Viator product codes we import from inbox (all others are ignored). */
export const VIATOR_ALLOWED_PRODUCT_CODES = [
  '406570P1',
  '406570P2',
  '406570P4',
  '406570P6',
  '406570P7',
  '406570P9',
  '406570P10',
  '406570P13',
  '406570P14',
  '406570P15',
  '406570P19',
  '406570P20',
  '406570P22',
  '406570P23',
  '406570P26',
  '406570P28',
  '406570P32',
  '406570P34',
  '406570P40',
  '406570P42',
  '406570P52',
  '406570P54',
  '406570P3',
  '406570P16',
  '406570P21',
  '406570P35',
  '406570P39',
  '406570P56',
  '406570P57',
  '406570P60',
  '406570P62',
  '419333P4',
  '419333P8',
  '419333P11',
  '419333P15',
  '419333P18',
  '419333P19',
  '419333P23',
  '419333P24',
  '419333P25',
  '419333P26',
  '419333P28',
  '419333P29',
] as const;

/** Cruise ship → city: cruise ship name (and port) in pickup; city drop-off from email. */
export const VIATOR_CRUISE_TO_CITY_PRODUCT_CODES = [
  '419333P8',
  '419333P19',
  '419333P24',
  '419333P28',
  '419333P29',
  '406570P60',
  '406570P34',
  '406570P22',
  '406570P15',
  '406570P6',
  '406570P4',
] as const;

/** @deprecated Use {@link VIATOR_CRUISE_TO_CITY_PRODUCT_CODES}. */
export const VIATOR_CRUISE_SHIP_PRODUCT_CODES = VIATOR_CRUISE_TO_CITY_PRODUCT_CODES;

/** City → cruise port/ship: city pickup from email; cruise ship name (and port) in drop-off. */
export const VIATOR_CITY_TO_CRUISE_PRODUCT_CODES = [
  '406570P62',
  '406570P57',
  '406570P56',
  '406570P39',
  '406570P35',
  '406570P21',
  '406570P16',
  '406570P3',
  '419333P25',
  '419333P23',
  '419333P18',
] as const;

const ALLOWED_SET = new Set<string>(VIATOR_ALLOWED_PRODUCT_CODES);
const CRUISE_TO_CITY_SET = new Set<string>(VIATOR_CRUISE_TO_CITY_PRODUCT_CODES);
const CITY_TO_CRUISE_SET = new Set<string>(VIATOR_CITY_TO_CRUISE_PRODUCT_CODES);

export function normalizeViatorProductCode(raw: string | undefined): string | undefined {
  const code = raw?.trim().toUpperCase().replace(/\s+/g, '');
  if (!code || !/^[A-Z0-9]+$/.test(code)) {
    return undefined;
  }
  return code;
}

export function isAllowedViatorProductCode(code: string | undefined): boolean {
  const normalized = normalizeViatorProductCode(code);
  return Boolean(normalized && ALLOWED_SET.has(normalized));
}

export function isCruiseToCityProductCode(code: string | undefined): boolean {
  const normalized = normalizeViatorProductCode(code);
  return Boolean(normalized && CRUISE_TO_CITY_SET.has(normalized));
}

/** @deprecated Use {@link isCruiseToCityProductCode}. */
export function isCruiseShipProductCode(code: string | undefined): boolean {
  return isCruiseToCityProductCode(code);
}

export function isCityToCruiseProductCode(code: string | undefined): boolean {
  const normalized = normalizeViatorProductCode(code);
  return Boolean(normalized && CITY_TO_CRUISE_SET.has(normalized));
}

export function pickRandomAllowedViatorProductCode(): string {
  const idx = Math.floor(Math.random() * VIATOR_ALLOWED_PRODUCT_CODES.length);
  return VIATOR_ALLOWED_PRODUCT_CODES[idx];
}

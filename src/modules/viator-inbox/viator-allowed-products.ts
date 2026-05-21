/** Viator product codes we import from inbox (all others are ignored). */
export const VIATOR_ALLOWED_PRODUCT_CODES = [
  '406570P1',
  '406570P2',
  '406570P7',
  '406570P9',
  '406570P10',
  '406570P13',
  '406570P14',
  '406570P19',
  '406570P20',
  '406570P23',
  '406570P26',
  '406570P28',
  '406570P32',
  '406570P40',
  '406570P42',
  '406570P52',
  '406570P54',
  '406570P56',
  '419333P4',
  '419333P11',
  '419333P15',
  '419333P26',
] as const;

const ALLOWED_SET = new Set<string>(VIATOR_ALLOWED_PRODUCT_CODES);

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

export function pickRandomAllowedViatorProductCode(): string {
  const idx = Math.floor(Math.random() * VIATOR_ALLOWED_PRODUCT_CODES.length);
  return VIATOR_ALLOWED_PRODUCT_CODES[idx];
}

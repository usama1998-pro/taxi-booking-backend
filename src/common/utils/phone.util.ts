/**
 * Removes Viator-style country labels (US, GB, "United Kingdom") but keeps the dial code (+34, +1, …).
 */
export function normalizePhoneNumber(phone: string): string {
  let s = phone.trim();
  if (!s) {
    return s;
  }

  s = s.replace(/^[A-Z]{2,3}(?=\s*\+)/i, '').trim();
  s = s.replace(/^[A-Z]{2,3}(?=\s*\d)/i, '').trim();

  const plusIdx = s.indexOf('+');
  if (plusIdx > 0) {
    const prefix = s.slice(0, plusIdx).trim();
    if (/^[A-Za-z][A-Za-z\s-]*$/.test(prefix) && !/\d/.test(prefix)) {
      s = s.slice(plusIdx).trim();
    }
  }

  return s.replace(/\s+/g, ' ').trim();
}

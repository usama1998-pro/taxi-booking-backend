import {
  isAllowedViatorProductCode,
  pickRandomAllowedViatorProductCode,
  VIATOR_ALLOWED_PRODUCT_CODES,
} from './viator-allowed-products';
import { buildViatorTestEmailBodies } from './viator-test-email';

describe('viator-allowed-products', () => {
  it('allows listed product codes only', () => {
    expect(isAllowedViatorProductCode('406570P1')).toBe(true);
    expect(isAllowedViatorProductCode('419333P26')).toBe(true);
    expect(isAllowedViatorProductCode('406570P99')).toBe(false);
    expect(isAllowedViatorProductCode(undefined)).toBe(false);
  });

  it('pickRandom returns an allowed code', () => {
    const code = pickRandomAllowedViatorProductCode();
    expect(VIATOR_ALLOWED_PRODUCT_CODES).toContain(code);
  });

  it('test email body includes Product Code from allowlist', () => {
    const { text, productCode } = buildViatorTestEmailBodies({
      bookingReference: 'BR-1234567890',
      productCode: '406570P10',
    });
    expect(text).toContain('Product Code: 406570P10');
    expect(productCode).toBe('406570P10');
  });
});

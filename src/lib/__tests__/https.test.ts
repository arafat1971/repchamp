import { assertHttps, isHttpsUrl } from '../https';

describe('https', () => {
  it('accepts https URLs', () => {
    expect(isHttpsUrl('https://us.i.posthog.com')).toBe(true);
    expect(assertHttps('https://example.com')).toBe('https://example.com');
  });

  it('rejects cleartext', () => {
    expect(isHttpsUrl('http://evil.test')).toBe(false);
    expect(() => assertHttps('http://evil.test')).toThrow(/non-HTTPS/);
  });
});

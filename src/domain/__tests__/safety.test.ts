import {
  canPassRateLimit,
  containsBlockedLanguage,
  isCloudSafeAvatarUrl,
  isReservedUsername,
  isSafeUsername,
  recordRateLimitEvent,
  safeUsernameError,
} from '../safety';

describe('safety usernames', () => {
  it('reserves system names', () => {
    expect(isReservedUsername('admin')).toBe(true);
    expect(isReservedUsername('repchamp')).toBe(true);
    expect(isReservedUsername('champ_1')).toBe(false);
  });

  it('flags blocked language', () => {
    expect(containsBlockedLanguage('nice_guy')).toBe(false);
    expect(containsBlockedLanguage('f_u_c_k')).toBe(true);
  });

  it('combines into isSafeUsername', () => {
    expect(isSafeUsername('champ')).toBe(true);
    expect(isSafeUsername('support')).toBe(false);
    expect(safeUsernameError('admin')).toMatch(/reserved/i);
  });
});

describe('avatar URL hygiene', () => {
  it('allows https and empty', () => {
    expect(isCloudSafeAvatarUrl(null)).toBe(true);
    expect(isCloudSafeAvatarUrl('https://cdn.example/a.jpg')).toBe(true);
    expect(isCloudSafeAvatarUrl('file:///tmp/a.jpg')).toBe(false);
    expect(isCloudSafeAvatarUrl('http://insecure')).toBe(false);
  });
});

describe('rate limits', () => {
  it('allows under the cap and blocks over it', () => {
    const windowMs = 1000;
    const now = 10_000;
    expect(canPassRateLimit([now - 100], 2, windowMs, now)).toBe(true);
    expect(canPassRateLimit([now - 100, now - 50], 2, windowMs, now)).toBe(false);
  });

  it('records and prunes', () => {
    const next = recordRateLimitEvent([100, 500], 1000, 2000);
    expect(next).toEqual([2000]);
  });
});

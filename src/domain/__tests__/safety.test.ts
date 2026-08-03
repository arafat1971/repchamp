import {
  canPassRateLimit,
  containsBlockedLanguage,
  isCloudSafeAvatarUrl,
  isReservedUsername,
  isSafeUsername,
  MAX_AVATAR_DATA_URI_BYTES,
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

  /*
   * The real avatar format, since Storage was dropped: the photo is inlined
   * as base64 on the profile document. `firestore.rules` has to accept the
   * same shape and the same ceiling, and for a while it did not — it still
   * demanded https under 500 bytes, so every avatar was rejected server-side
   * and photos never appeared on anyone else's phone.
   */
  it('allows the inlined base64 data URI that uploadAvatar actually writes', () => {
    expect(isCloudSafeAvatarUrl('data:image/jpeg;base64,AAAA')).toBe(true);
    expect(isCloudSafeAvatarUrl('data:image/png;base64,AAAA')).toBe(true);
  });

  it('rejects a data URI that is not base64 or is over the ceiling', () => {
    expect(isCloudSafeAvatarUrl('data:image/svg+xml,<svg/>')).toBe(false);
    const tooBig = `data:image/jpeg;base64,${'a'.repeat(MAX_AVATAR_DATA_URI_BYTES)}`;
    expect(isCloudSafeAvatarUrl(tooBig)).toBe(false);
  });

  /*
   * Pinned so the two cannot drift apart again. If this constant moves, the
   * `avatarUrl.size()` ceiling in firestore.rules must move with it, or the
   * client goes back to writing values the server refuses.
   */
  it('keeps the ceiling in step with the firestore.rules limit', () => {
    expect(MAX_AVATAR_DATA_URI_BYTES).toBe(65536);
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

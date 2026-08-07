import { isValidUsername, normalizeUsername } from '@/domain/input';

/**
 * The `/@username` friend-invite link, parsed the way `app/[handle].tsx` parses it.
 *
 * The route itself is a two-line redirect, so what is worth pinning is the
 * decision it makes: which incoming path segments are a friend invite, and which
 * are stray links that must go home instead of into a doomed username search.
 *
 * `resolve` mirrors the route's logic exactly. If the route changes, this changes
 * with it — it exists to document the boundary cases, which is where a redirect
 * like this goes wrong.
 */
function resolve(segment: string): string | null {
  const username = segment.startsWith('@') ? normalizeUsername(segment) : '';
  return isValidUsername(username) ? username : null;
}

describe('friend handle deep link', () => {
  it('resolves a plain @handle to the username', () => {
    expect(resolve('@ada')).toBe('ada');
  });

  it('lowercases, so a shared link works whatever case it was typed in', () => {
    expect(resolve('@AdaLovelace')).toBe('adalovelace');
  });

  it('accepts underscores and digits, which are valid in handles', () => {
    expect(resolve('@ada_99')).toBe('ada_99');
  });

  it('rejects a segment with no @ — that is some other route, not an invite', () => {
    expect(resolve('onboarding')).toBeNull();
    expect(resolve('session')).toBeNull();
  });

  it('rejects a bare @ with no name', () => {
    expect(resolve('@')).toBeNull();
  });

  it('rejects handles that are too short or too long to be real', () => {
    expect(resolve('@ab')).toBeNull();
    expect(resolve(`@${'a'.repeat(21)}`)).toBeNull();
  });

  it('rejects handles carrying characters a username can never contain', () => {
    // A path that survived URL decoding with punctuation still is not a handle.
    expect(resolve('@ada.lovelace')).toBeNull();
    expect(resolve('@ada/../admin')).toBeNull();
    expect(resolve('@ada lovelace')).toBeNull();
  });
});

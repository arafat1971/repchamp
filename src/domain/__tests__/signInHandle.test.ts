import { checkHandleAtSignIn, mayPassUncheckedHandle } from '../signInHandle';

describe('checkHandleAtSignIn', () => {
  it('carries on when the handle is still free', () => {
    expect(checkHandleAtSignIn('arafat', 'uid1', 'free')).toEqual({ kind: 'proceed' });
  });

  it('sends them back when someone took it mid-onboarding, and names it', () => {
    const check = checkHandleAtSignIn('arafat', 'uid1', 'taken');
    expect(check.kind).toBe('reclaim');
    if (check.kind === 'reclaim') expect(check.reason).toContain('@arafat');
  });

  /* The reason this module exists.
   *
   * The username step lets `unknown` through so an offline athlete is not
   * trapped. If this step did the same, both checks would pass on a failed
   * lookup and `upsertProfile` would rename the athlete to `handle_a1b2` at
   * the very end without telling them. Blocking is safe here specifically
   * because signing in just proved the athlete is online. */
  it('blocks when availability could not be determined', () => {
    expect(checkHandleAtSignIn('arafat', 'uid1', 'unknown')).toMatchObject({
      kind: 'reclaim',
    });
  });

  /* An unverifiable lookup is not the athlete's fault. Telling them the name
     was taken would be a guess, and one that reads as someone else's doing. */
  it('does not blame a rival for a failed lookup', () => {
    const check = checkHandleAtSignIn('arafat', 'uid1', 'unknown');
    if (check.kind === 'reclaim') {
      expect(check.reason).not.toContain('was taken');
      expect(check.reason).toContain('connection');
    }
  });

  it('distinguishes the two refusals, so the copy cannot be swapped', () => {
    const taken = checkHandleAtSignIn('arafat', 'uid1', 'taken');
    const unknown = checkHandleAtSignIn('arafat', 'uid1', 'unknown');
    if (taken.kind === 'reclaim' && unknown.kind === 'reclaim') {
      expect(taken.reason).not.toBe(unknown.reason);
    }
  });

  /* Nothing to verify. Bouncing these backwards would strand an athlete on the
     username step over a collision that cannot have happened. */
  it('proceeds with no handle to check, even on unknown', () => {
    expect(checkHandleAtSignIn('', 'uid1', 'unknown')).toEqual({ kind: 'proceed' });
  });

  it('proceeds when sign-in produced no uid, even on taken', () => {
    expect(checkHandleAtSignIn('arafat', null, 'taken')).toEqual({ kind: 'proceed' });
    expect(checkHandleAtSignIn('arafat', undefined, 'taken')).toEqual({ kind: 'proceed' });
  });
});

describe('mayPassUncheckedHandle', () => {
  /* The ordinary case the username step's leniency exists for: nobody has been
     told anything yet, so a failed lookup must not strand them. */
  it('lets any handle through when sign-in refused nothing', () => {
    expect(mayPassUncheckedHandle('arafat', null)).toBe(true);
  });

  /* The loop this closes. Sign-in bounced them back saying @arafat could not
     be confirmed; retyping @arafat and passing again on another failed lookup
     walks them into the silent rename the bounce existed to prevent. */
  it('refuses the exact handle sign-in could not confirm', () => {
    expect(mayPassUncheckedHandle('arafat', 'arafat')).toBe(false);
  });

  /* Case and stray whitespace must not be an escape hatch — @Arafat and
     @arafat are the same claim on the same name. */
  it('is not fooled by case or padding', () => {
    expect(mayPassUncheckedHandle('ARAFAT', 'arafat')).toBe(false);
    expect(mayPassUncheckedHandle('  arafat  ', 'arafat')).toBe(false);
  });

  /* Scoped deliberately. The offline athlete still has to be able to move, so
     only the refused name is blocked — picking a different one is the way out
     the bounce is asking for. */
  it('still lets a different handle through', () => {
    expect(mayPassUncheckedHandle('someone_else', 'arafat')).toBe(true);
  });
});

import { planRename, renameConfirmation } from '../renameUsername';

describe('planRename', () => {
  it('allows a valid, free, different name', () => {
    expect(planRename('oldname', 'arafat', 'free')).toEqual({
      kind: 'ok',
      username: 'arafat',
    });
  });

  it('normalises before writing, so the stored handle is canonical', () => {
    expect(planRename('oldname', '  Arafat  ', 'free')).toEqual({
      kind: 'ok',
      username: 'arafat',
    });
  });

  /* The screen must not fire a pointless Firestore write, and "saved!" for a
     no-op change is a lie the athlete can't see through. */
  it('reports an unchanged name rather than writing', () => {
    expect(planRename('arafat', 'arafat', 'free')).toEqual({ kind: 'unchanged' });
  });

  it('treats a case-only change as unchanged', () => {
    expect(planRename('arafat', 'ARAFAT', 'free')).toEqual({ kind: 'unchanged' });
  });

  it('refuses a taken handle and names it in the message', () => {
    const plan = planRename('oldname', 'taken_one', 'taken');
    expect(plan.kind).toBe('rejected');
    if (plan.kind === 'rejected') expect(plan.reason).toContain('@taken_one');
  });

  /* The critical difference from onboarding. There, an unknown result is
     allowed through so an offline athlete is not trapped. Here the athlete
     already owns a working handle, so an unverifiable write could either
     duplicate someone else's name or silently do nothing. Refusing is the only
     answer that cannot corrupt an account. */
  it('refuses when availability could not be determined', () => {
    const plan = planRename('oldname', 'maybe_free', 'unknown');
    expect(plan.kind).toBe('rejected');
    if (plan.kind === 'rejected') expect(plan.reason).toMatch(/offline|try again/i);
  });

  it('rejects a name that is too short', () => {
    expect(planRename('oldname', 'ab', 'free').kind).toBe('rejected');
  });

  it('rejects illegal characters rather than silently stripping them', () => {
    expect(planRename('oldname', 'not a name!', 'free').kind).toBe('rejected');
  });

  it('rejects an empty name', () => {
    expect(planRename('oldname', '', 'free').kind).toBe('rejected');
  });

  /* Shape is checked before availability: an invalid name should say what is
     wrong with it, not report the result of a lookup that never made sense. */
  it('reports the shape problem even when the lookup said taken', () => {
    const plan = planRename('oldname', 'x', 'taken');
    expect(plan.kind).toBe('rejected');
    if (plan.kind === 'rejected') expect(plan.reason).not.toContain('already taken');
  });
});

describe('renameConfirmation', () => {
  it('names the new handle, so the athlete can verify it themselves', () => {
    expect(renameConfirmation('arafat')).toContain('@arafat');
  });
});

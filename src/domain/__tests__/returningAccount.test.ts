import {
  confirmationFor,
  planAccountRestore,
  type CloudSnapshot,
  type LocalSnapshot,
} from '../returningAccount';

const local = (o: Partial<LocalSnapshot> = {}): LocalSnapshot => ({
  username: 'champion_new',
  avatarUri: null,
  totalXp: 0,
  ...o,
});

const cloud = (o: Partial<CloudSnapshot> = {}): CloudSnapshot => ({
  username: 'ayesha',
  displayName: 'Ayesha',
  avatarUrl: 'https://example.test/a.png',
  totalXp: 1200,
  ...o,
});

describe('planAccountRestore', () => {
  it('treats a first sign-in as a new account', () => {
    expect(planAccountRestore(null, local())).toEqual({ kind: 'new-account' });
  });

  /* A profile document can exist before onboarding finishes — the username is
     the field that proves someone actually completed it. */
  it('treats a profile with no username as a new account', () => {
    expect(planAccountRestore(cloud({ username: '   ' }), local())).toEqual({
      kind: 'new-account',
    });
  });

  it('restores the handle and photo the account already had', () => {
    const plan = planAccountRestore(cloud(), local({ username: 'champion_new' }));
    expect(plan).toMatchObject({
      kind: 'returning',
      username: 'ayesha',
      displayName: 'Ayesha',
      avatarUrl: 'https://example.test/a.png',
    });
  });

  it('falls back to the username when the account has no display name', () => {
    const plan = planAccountRestore(cloud({ displayName: '' }), local());
    expect(plan).toMatchObject({ kind: 'returning', displayName: 'ayesha' });
  });

  /* Someone who signed up and never trained still owns their handle. */
  it('is a return even with no XP on the account', () => {
    const plan = planAccountRestore(cloud({ totalXp: 0 }), local());
    expect(plan).toMatchObject({ kind: 'returning', hasProgress: false });
  });

  it('claims progress when the account is ahead of this device', () => {
    const plan = planAccountRestore(cloud({ totalXp: 1200 }), local({ totalXp: 0 }));
    expect(plan).toMatchObject({ hasProgress: true });
  });

  /* A device with unsynced offline sets is ahead of the server. Telling that
     athlete their progress has been restored would be false, and would imply
     the local sets are the ones at risk. */
  it('does not claim progress when the device is ahead of the account', () => {
    const plan = planAccountRestore(cloud({ totalXp: 50 }), local({ totalXp: 900 }));
    expect(plan).toMatchObject({ kind: 'returning', hasProgress: false });
  });
});

describe('confirmationFor', () => {
  it('names the account on a fresh sign-in', () => {
    const msg = confirmationFor({ kind: 'new-account' }, 'a@b.test');
    expect(msg).toBe('Signed in as a@b.test');
  });

  it('still confirms when no email came back', () => {
    expect(confirmationFor({ kind: 'new-account' }, null)).toBe('Signed in');
  });

  it('welcomes a returning athlete by name', () => {
    const msg = confirmationFor({
      kind: 'returning',
      username: 'ayesha',
      displayName: 'Ayesha',
      avatarUrl: null,
      hasProgress: false,
    });
    expect(msg).toBe('Welcome back, Ayesha');
  });

  it('says the progress is here only when it is', () => {
    const msg = confirmationFor({
      kind: 'returning',
      username: 'ayesha',
      displayName: 'Ayesha',
      avatarUrl: null,
      hasProgress: true,
    });
    expect(msg).toContain('your progress is here');
  });
});

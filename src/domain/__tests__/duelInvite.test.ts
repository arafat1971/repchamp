import {
  duelInviteDeepLink,
  duelInviteLink,
  isDuelId,
  isJoinableByQr,
  isOwnDuelInvite,
  parseDuelInvite,
} from '../duelInvite';

/** A realistic Firestore auto-id: 20 chars of A-Za-z0-9. */
const ID = 'aB3xY9kLmN2pQ7rS4tU6';

describe('isDuelId', () => {
  it('accepts a Firestore auto-id', () => {
    expect(isDuelId(ID)).toBe(true);
  });

  it('rejects anything of the wrong shape', () => {
    expect(isDuelId('')).toBe(false);
    expect(isDuelId('short')).toBe(false);
    expect(isDuelId(`${ID}x`)).toBe(false);
    expect(isDuelId(ID.slice(0, 19))).toBe(false);
    // Hyphens and underscores are not in Firestore's alphabet.
    expect(isDuelId('aB3xY9kLmN-pQ7rS4tU6')).toBe(false);
  });

  /* `'new'` is the route sentinel the host opens the waiting room with, before
     `createDuel` has minted anything. It reached the code box, the shared link
     and the QR once, each encoding a duel that cannot exist. */
  it('rejects the "new" route sentinel', () => {
    expect(isDuelId('new')).toBe(false);
    expect(parseDuelInvite(duelInviteDeepLink('new'))).toBeNull();
    expect(parseDuelInvite(duelInviteLink('new'))).toBeNull();
  });
});

describe('link building', () => {
  it('encodes the deep link the QR carries', () => {
    expect(duelInviteDeepLink(ID)).toBe(`repchamp://duel/join?id=${ID}`);
  });

  it('builds an https link for shared text', () => {
    expect(duelInviteLink(ID)).toBe(`https://repchamp.web.app/duel/join?id=${ID}`);
  });

  /* The https path has to match a real route. expo-router resolves paths
     against the filesystem, and `app/duel/` has no index — so the earlier
     bare `/duel` would have opened a verified App Link onto nothing. */
  it('shares the path of the route that handles it', () => {
    expect(duelInviteLink(ID)).toContain('/duel/join?');
    expect(duelInviteDeepLink(ID)).toContain('/duel/join?');
  });

  it('round-trips through the parser', () => {
    expect(parseDuelInvite(duelInviteDeepLink(ID))).toBe(ID);
    expect(parseDuelInvite(duelInviteLink(ID))).toBe(ID);
  });
});

describe('parseDuelInvite', () => {
  it('reads a bare id', () => {
    expect(parseDuelInvite(ID)).toBe(ID);
    expect(parseDuelInvite(`  ${ID}  `)).toBe(ID);
  });

  it('finds an id inside a shared blurb', () => {
    expect(parseDuelInvite(`Race me on RepChamp: ${ID}`)).toBe(ID);
  });

  /*
   * A wrong id is worse than none: it would send the athlete into a join that
   * fails, or into a stranger's duel. Anything unrecognisable returns null so
   * the caller can say "that code isn't a duel" instead of guessing.
   */
  it('returns null rather than guessing', () => {
    expect(parseDuelInvite('')).toBeNull();
    expect(parseDuelInvite('   ')).toBeNull();
    expect(parseDuelInvite('https://example.com/nothing-here')).toBeNull();
    expect(parseDuelInvite('repchamp://couple/join?code=ABC234')).toBeNull();
  });

  it('rejects a query id of the wrong shape rather than falling through', () => {
    // The `id=` is explicit, so a malformed value is a broken link, not a
    // blurb to go scanning for tokens in.
    expect(parseDuelInvite('repchamp://duel/join?id=nope')).toBeNull();
  });

  it('survives url encoding', () => {
    expect(parseDuelInvite(`repchamp://duel/join?id=${encodeURIComponent(ID)}`)).toBe(ID);
  });
});

describe('isJoinableByQr', () => {
  const open = { status: 'pending', targetUid: null, hostUid: 'ada', guestUid: null };

  it('accepts an open pending invite', () => {
    expect(isJoinableByQr(open)).toBe(true);
  });

  /*
   * These mirror the Firestore rule. If they drift apart the athlete gets a
   * permission error from the server instead of a sentence explaining that
   * someone already took the seat.
   */
  it('refuses a duel someone already joined', () => {
    expect(isJoinableByQr({ ...open, status: 'active', guestUid: 'bob' })).toBe(false);
    expect(isJoinableByQr({ ...open, guestUid: 'bob' })).toBe(false);
  });

  it('refuses a duel aimed at a specific athlete', () => {
    expect(isJoinableByQr({ ...open, targetUid: 'cara' })).toBe(false);
  });

  it('refuses a finished duel', () => {
    expect(isJoinableByQr({ ...open, status: 'finished' })).toBe(false);
  });
});

describe('isOwnDuelInvite', () => {
  it('spots the host scanning their own code', () => {
    expect(isOwnDuelInvite({ hostUid: 'ada' }, 'ada')).toBe(true);
    expect(isOwnDuelInvite({ hostUid: 'ada' }, 'bob')).toBe(false);
  });
});

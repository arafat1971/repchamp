/**
 * Tests for the user service — the Firestore/Storage I/O over the durable
 * profile slice.
 *
 * A tiny in-memory Firestore fake records every write so we can assert the exact
 * merged document each call produces: the merge-written push token, the upserted
 * profile stamped with a server timestamp, and the flat leaderboard row minted
 * for the current week. `@/lib/firebase` is mocked so `isFirebaseConfigured()`
 * can toggle the live path against the unconfigured no-op fallback, and Storage
 * is faked so `uploadAvatar` is checked without touching a device.
 *
 * Jest hoists jest.mock() above imports, so every shared name a factory touches
 * is `mock`-prefixed (the only out-of-scope access the hoist guard allows).
 */

/* ------------------------------------------------------------------ */

import {
  currentWeekKey,
  fetchExpoPushToken,
  fetchProfile,
  checkUsername,
  isUsernameAvailable,
  publishScore,
  removeScore,
  saveExpoPushToken,
  touchPresence,
  uploadAvatar,
  upsertProfile,
  type CloudProfile,
} from '../userService';

const mockState = { configured: true, queryThrows: false };

/** collection -> (id -> doc data). users and leaderboard are both in play. */
const mockStore: {
  users: Map<string, Record<string, unknown>>;
  leaderboard: Map<string, Record<string, unknown>>;
  [k: string]: Map<string, Record<string, unknown>>;
} = {
  users: new Map(),
  leaderboard: new Map(),
};

function mockCol(name: string) {
  if (!mockStore[name]) mockStore[name] = new Map();
  return mockStore[name]!;
}

/** Shallow-merge for `set({merge:true})`; overwrite for a plain `set`. */
function mockDocRef(col: string, id: string) {
  return {
    id,
    collection(sub: string) {
      return {
        doc: (subId: string) => mockDocRef(`${col}/${id}/${sub}`, subId),
      };
    },
    async set(data: Record<string, unknown>, opts?: { merge?: boolean }) {
      const store = mockCol(col);
      if (opts?.merge) {
        const prev = { ...(store.get(id) ?? {}) };
        for (const [k, v] of Object.entries(data)) {
          if (v && typeof v === 'object' && (v as { __delete?: boolean }).__delete) {
            delete prev[k];
          } else {
            prev[k] = v;
          }
        }
        store.set(id, prev);
      } else {
        const cleaned: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(data)) {
          if (v && typeof v === 'object' && (v as { __delete?: boolean }).__delete) continue;
          cleaned[k] = v;
        }
        store.set(id, cleaned);
      }
    },
    async delete() {
      mockCol(col).delete(id);
    },
    async get() {
      const data = mockCol(col).get(id);
      return {
        id,
        exists: () => data !== undefined,
        data: () => data,
        get: (field: string) => data?.[field],
      };
    },
  };
}

/**
 * Stands in for expo-image-manipulator. Records the resize it was asked for and
 * returns a base64 payload of a controllable size, so the tests can drive both
 * the happy path and the too-large guard.
 */
const mockManip = {
  lastUri: null as string | null,
  lastResize: null as { width: number; height: number } | null,
  base64Length: 4096,
};

jest.mock('@/lib/firebase', () => ({
  isFirebaseConfigured: () => mockState.configured,
}));

function mockQuery(col: string, filters: [string, unknown][], limit: number | null) {
  return {
    where(field: string, _op: string, value: unknown) {
      return mockQuery(col, [...filters, [field, value]], limit);
    },
    limit(n: number) {
      return mockQuery(col, filters, n);
    },
    async get() {
      // Simulates a transient Firestore failure (offline, App Check, rules).
      if (mockState.queryThrows) throw new Error('firestore unavailable');
      let docs = [...mockCol(col).entries()].filter(([, data]) =>
        filters.every(([f, v]) => data[f] === v),
      );
      if (limit != null) docs = docs.slice(0, limit);
      return {
        empty: docs.length === 0,
        docs: docs.map(([id, data]) => ({
          id,
          data: () => data,
          exists: () => true,
        })),
      };
    },
  };
}

jest.mock('@react-native-firebase/firestore', () => {
  const fn = () => ({
    collection: (name: string) => ({
      doc: (id: string) => mockDocRef(name, id),
      where: (field: string, _op: string, value: unknown) => mockQuery(name, [[field, value]], null),
    }),
  });
  (fn as unknown as { FieldValue: unknown }).FieldValue = {
    serverTimestamp: () => '<ts>',
    delete: () => ({ __delete: true }),
  };
  return { __esModule: true, default: fn };
});

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  manipulateAsync: async (
    uri: string,
    actions: { resize?: { width: number; height: number } }[],
  ) => {
    mockManip.lastUri = uri;
    mockManip.lastResize = actions[0]?.resize ?? null;
    return { base64: 'a'.repeat(mockManip.base64Length) };
  },
}));

beforeEach(() => {
  mockState.configured = true;
  mockState.queryThrows = false;
  mockStore.users.clear();
  mockStore.leaderboard.clear();
  for (const key of Object.keys(mockStore)) {
    if (key !== 'users' && key !== 'leaderboard') delete mockStore[key];
  }
  mockManip.lastUri = null;
  mockManip.lastResize = null;
  mockManip.base64Length = 4096;
});

const PROFILE: Omit<CloudProfile, 'updatedAt'> = {
  uid: 'u1',
  username: 'hana',
  displayName: 'Hana',
  avatarUrl: null,
  weeklyGoal: 5,
  totalXp: 1200,
  personalBests: { push: 30, squat: 42 } as CloudProfile['personalBests'],
  onboarded: true,
  pairingBonusClaimed: false,
  pairingBonusUntil: 0,
  trainedDays: [],
  weekKey: '2026-W31',
  weekXp: 0,
  weekExerciseReps: {},
  programme: null,
};

describe('fetchProfile', () => {
  it('returns the stored profile', async () => {
    mockStore.users.set('u1', { uid: 'u1', displayName: 'Hana', totalXp: 10 });
    const p = await fetchProfile('u1');
    expect(p?.displayName).toBe('Hana');
    expect(p?.totalXp).toBe(10);
  });

  it('returns null for a profile that was never created', async () => {
    expect(await fetchProfile('nobody')).toBeNull();
  });

  it('returns null when unconfigured', async () => {
    mockStore.users.set('u1', { uid: 'u1' });
    mockState.configured = false;
    expect(await fetchProfile('u1')).toBeNull();
  });
});

describe('upsertProfile', () => {
  it('writes the profile stamped with a server timestamp', async () => {
    await upsertProfile(PROFILE);
    const d = mockStore.users.get('u1')!;
    expect(d.displayName).toBe('Hana');
    expect(d.totalXp).toBe(1200);
    expect(d.updatedAt).toBe('<ts>');
    expect(typeof d.createdAt).toBe('number');
    expect(typeof d.lastActiveAt).toBe('number');
  });

  /*
   * Regression: two `@champion` profiles reached production because a failed
   * availability lookup was reported as "available", so the collision guard
   * below it never fired. An unverifiable name must fall back, not be taken
   * on trust.
   */
  it('does not claim a username it could not verify', async () => {
    mockStore.users.set('someone_else', { username: 'hana' });
    mockState.queryThrows = true;

    await upsertProfile(PROFILE);

    const written = mockStore.users.get('u1')!;
    expect(written.username).not.toBe('hana');
    expect(written.username).toBe('hana_u1');
    // The other athlete keeps their handle.
    expect(mockStore.users.get('someone_else')!.username).toBe('hana');
  });

  it('keeps the athlete existing cloud handle when the lookup fails', async () => {
    mockStore.users.set('u1', { username: 'hana_original' });
    mockState.queryThrows = true;

    await upsertProfile(PROFILE);

    expect(mockStore.users.get('u1')!.username).toBe('hana_original');
  });

  it('merges — a field another device wrote survives the upsert', async () => {
    mockStore.users.set('u1', { league: 'gold', createdAt: 99 });
    await upsertProfile(PROFILE);
    const d = mockStore.users.get('u1')!;
    expect(d.league).toBe('gold');
    expect(d.displayName).toBe('Hana');
    expect(d.createdAt).toBe(99);
  });

  it('keeps an existing cloud username when the local handle is taken', async () => {
    mockStore.users.set('other', { uid: 'other', username: 'hana' });
    mockStore.users.set('u1', { uid: 'u1', username: 'oldname', totalXp: 10, createdAt: 1 });
    await upsertProfile(PROFILE);
    expect(mockStore.users.get('u1')!.username).toBe('oldname');
  });

  it('keeps pairing bonus latch and onboarded sticky across devices', async () => {
    mockStore.users.set('u1', {
      uid: 'u1',
      username: 'hana',
      totalXp: 100,
      onboarded: true,
      pairingBonusClaimed: true,
      pairingBonusUntil: 9_000,
    });
    await upsertProfile({
      ...PROFILE,
      onboarded: false,
      pairingBonusClaimed: false,
      pairingBonusUntil: 1_000,
      totalXp: 100,
    });
    const d = mockStore.users.get('u1')!;
    expect(d.onboarded).toBe(true);
    expect(d.pairingBonusClaimed).toBe(true);
    expect(d.pairingBonusUntil).toBe(9_000);
  });

  it('never lowers cloud totalXp or personal bests from a lagging device', async () => {
    mockStore.users.set('u1', {
      ...PROFILE,
      totalXp: 5000,
      personalBests: { push: 50, squat: 10 },
      createdAt: 1,
    });
    await upsertProfile({
      ...PROFILE,
      totalXp: 100,
      personalBests: { push: 20, squat: 40 } as CloudProfile['personalBests'],
    });
    const d = mockStore.users.get('u1')!;
    expect(d.totalXp).toBe(5000);
    expect(d.personalBests).toEqual({ push: 50, squat: 40 });
  });

  it('is a no-op when unconfigured', async () => {
    mockState.configured = false;
    await upsertProfile(PROFILE);
    expect(mockStore.users.size).toBe(0);
  });
});

describe('isUsernameAvailable', () => {
  it('is true when nobody owns the name', async () => {
    expect(await isUsernameAvailable('fresh_name')).toBe(true);
  });

  it('is false when another uid owns the name', async () => {
    mockStore.users.set('other', { username: 'taken' });
    expect(await isUsernameAvailable('taken', 'me')).toBe(false);
  });

  it('is true when only the excluded uid owns the name', async () => {
    mockStore.users.set('me', { username: 'mine' });
    expect(await isUsernameAvailable('mine', 'me')).toBe(true);
  });

  // Onboarding keeps letting people through on a failed lookup — blocking
  // there would trap an offline athlete on the username step.
  it('stays true when the lookup fails', async () => {
    mockState.queryThrows = true;
    expect(await isUsernameAvailable('anything', 'me')).toBe(true);
  });
});

describe('checkUsername', () => {
  it('separates free, taken and unknown', async () => {
    expect(await checkUsername('fresh_name')).toBe('free');

    mockStore.users.set('other', { username: 'taken' });
    expect(await checkUsername('taken', 'me')).toBe('taken');

    mockState.queryThrows = true;
    expect(await checkUsername('taken', 'me')).toBe('unknown');
  });

  it('reports an empty name as taken rather than free', async () => {
    expect(await checkUsername('   ')).toBe('taken');
  });
});

describe('touchPresence', () => {
  it('merge-writes lastActiveAt on an existing profile', async () => {
    mockStore.users.set('u1', { displayName: 'Hana', uid: 'u1' });
    await touchPresence('u1');
    const d = mockStore.users.get('u1')!;
    expect(d.displayName).toBe('Hana');
    expect(typeof d.lastActiveAt).toBe('number');
  });

  it('does not create a profile from a heartbeat alone', async () => {
    await touchPresence('ghost');
    expect(mockStore.users.has('ghost')).toBe(false);
  });
});

describe('saveExpoPushToken / fetchExpoPushToken', () => {
  it('writes the token to an owner-only private doc, not the public profile', async () => {
    mockStore.users.set('u1', {
      displayName: 'Hana',
      expoPushToken: 'ExponentPushToken[legacy]',
    });
    await saveExpoPushToken('u1', 'ExponentPushToken[abc]');
    expect(mockStore.users.get('u1')).toEqual({ displayName: 'Hana' });
    const d = mockCol('users/u1/private').get('push')!;
    expect(d.expoPushToken).toBe('ExponentPushToken[abc]');
    expect(d.pushUpdatedAt).toBe('<ts>');
  });

  it('reads the token back', async () => {
    await saveExpoPushToken('u1', 'ExponentPushToken[abc]');
    expect(await fetchExpoPushToken('u1')).toBe('ExponentPushToken[abc]');
  });

  it('returns null when the user has no token', async () => {
    mockStore.users.set('u1', { displayName: 'Hana' });
    expect(await fetchExpoPushToken('u1')).toBeNull();
  });

  it('returns null for a missing user', async () => {
    expect(await fetchExpoPushToken('ghost')).toBeNull();
  });

  it('save is a no-op and fetch is null when unconfigured', async () => {
    mockState.configured = false;
    await saveExpoPushToken('u1', 'ExponentPushToken[abc]');
    expect(mockStore.users.size).toBe(0);
    expect(await fetchExpoPushToken('u1')).toBeNull();
  });
});

describe('publishScore', () => {
  it('writes a flat leaderboard row tagged with the current week key', async () => {
    await publishScore({
      uid: 'u1',
      displayName: 'Hana',
      avatarUrl: null,
      weeklyXp: 340,
      totalXp: 1200,
      level: 4,
      league: 'silver',
    });
    const d = mockStore.leaderboard.get('u1')!;
    expect(d.weeklyXp).toBe(340);
    expect(d.league).toBe('silver');
    expect(d.updatedAt).toBe('<ts>');
    expect(d.weekKey).toBe(currentWeekKey());
  });

  it('does not wipe same-week weeklyXp with a lower local score', async () => {
    mockStore.leaderboard.set('u1', {
      uid: 'u1',
      weeklyXp: 800,
      totalXp: 2000,
      weekKey: currentWeekKey(),
    });
    await publishScore({
      uid: 'u1',
      displayName: 'Hana',
      avatarUrl: null,
      weeklyXp: 0,
      totalXp: 100,
      level: 1,
      league: 'bronze',
    });
    const d = mockStore.leaderboard.get('u1')!;
    expect(d.weeklyXp).toBe(800);
    expect(d.totalXp).toBe(2000);
  });

  it('is a no-op when unconfigured', async () => {
    mockState.configured = false;
    await publishScore({
      uid: 'u1',
      displayName: 'Hana',
      avatarUrl: null,
      weeklyXp: 1,
      totalXp: 1,
      level: 1,
      league: 'bronze',
    });
    expect(mockStore.leaderboard.size).toBe(0);
  });
});

describe('removeScore', () => {
  it('deletes the athlete from the leaderboard collection', async () => {
    await publishScore({
      uid: 'u1',
      displayName: 'Hana',
      avatarUrl: null,
      weeklyXp: 10,
      totalXp: 10,
      level: 1,
      league: 'bronze',
    });
    expect(mockStore.leaderboard.has('u1')).toBe(true);
    await removeScore('u1');
    expect(mockStore.leaderboard.has('u1')).toBe(false);
  });
});

describe('uploadAvatar', () => {
  it('downscales the picked photo and returns it as a data uri', async () => {
    const url = await uploadAvatar('u1', 'file:///tmp/me.jpg');
    expect(mockManip.lastUri).toBe('file:///tmp/me.jpg');
    expect(mockManip.lastResize).toEqual({ width: 192, height: 192 });
    expect(url.startsWith('data:image/jpeg;base64,')).toBe(true);
  });

  it('returns the original uri unchanged when unconfigured', async () => {
    mockState.configured = false;
    const url = await uploadAvatar('u1', 'file:///tmp/me.jpg');
    expect(url).toBe('file:///tmp/me.jpg');
    expect(mockManip.lastUri).toBeNull();
  });

  it('leaves an already-encoded or remote avatar alone', async () => {
    expect(await uploadAvatar('u1', 'https://cdn.example/a.jpg')).toBe(
      'https://cdn.example/a.jpg',
    );
    expect(await uploadAvatar('u1', 'data:image/jpeg;base64,AAAA')).toBe(
      'data:image/jpeg;base64,AAAA',
    );
    expect(mockManip.lastUri).toBeNull();
  });

  /*
   * A payload over the ceiling would fail the *whole* profile write, taking XP
   * and personal bests with it, so the local uri is kept instead — the athlete
   * loses a synced photo rather than their progress.
   */
  it('keeps the local uri when the encoded image is too large to store', async () => {
    mockManip.base64Length = 128 * 1024;
    const url = await uploadAvatar('u1', 'file:///tmp/huge.jpg');
    expect(url).toBe('file:///tmp/huge.jpg');
  });

  /*
   * The resizer is required lazily and its absence is swallowed, because this
   * module sits on the launch path via notifications -> (tabs)/_layout. A
   * static import of a native module missing from the binary — which happens
   * whenever a build's JS is newer than its native side — threw during route
   * loading and left expo-router with an undefined module, white-screening the
   * app on boot. Losing the cloud copy of an avatar is the correct price.
   */
  it('keeps the local uri when the native resizer is missing from the build', async () => {
    // Evict the resolved module so the lazy require re-runs and hits the
    // throwing factory, which is what a binary without the native module does.
    const resolved = require.resolve('expo-image-manipulator');
    const cached = jest.requireMock('expo-image-manipulator');
    jest.resetModules();
    jest.doMock('expo-image-manipulator', () => {
      throw new Error("Cannot find native module 'ExpoImageManipulator'");
    });
    try {
      const url = await uploadAvatar('u1', 'file:///tmp/me.jpg');
      expect(url).toBe('file:///tmp/me.jpg');
    } finally {
      jest.dontMock('expo-image-manipulator');
      jest.doMock('expo-image-manipulator', () => cached);
      void resolved;
    }
  });
});

describe('currentWeekKey', () => {
  it('formats an ISO-8601 week key as YYYY-Www', () => {
    // 2026-07-26 is a Sunday in ISO week 30.
    expect(currentWeekKey(new Date(Date.UTC(2026, 6, 26)))).toBe('2026-W30');
  });

  it('zero-pads single-digit weeks', () => {
    // 2026-01-05 is the Monday of ISO week 02.
    expect(currentWeekKey(new Date(Date.UTC(2026, 0, 5)))).toBe('2026-W02');
  });

  it('rolls a year-end date into the first ISO week of the next year', () => {
    // 2025-12-31 (Wed) belongs to ISO week 01 of 2026.
    expect(currentWeekKey(new Date(Date.UTC(2025, 11, 31)))).toBe('2026-W01');
  });
});

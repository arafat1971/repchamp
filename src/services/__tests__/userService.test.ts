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
  publishScore,
  removeScore,
  saveExpoPushToken,
  touchPresence,
  uploadAvatar,
  upsertProfile,
  type CloudProfile,
} from '../userService';

const mockState = { configured: true };

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

/** Records what was uploaded and returns a deterministic download URL. */
const mockStorage = { lastPutFile: null as string | null };
function mockStorageRef(path: string) {
  return {
    async putFile(uri: string) {
      mockStorage.lastPutFile = uri;
    },
    async getDownloadURL() {
      return `https://cdn.example/${path}`;
    },
  };
}

jest.mock('@/lib/firebase', () => ({
  isFirebaseConfigured: () => mockState.configured,
}));

jest.mock('@react-native-firebase/firestore', () => {
  const fn = () => ({
    collection: (name: string) => ({
      doc: (id: string) => mockDocRef(name, id),
    }),
  });
  (fn as unknown as { FieldValue: unknown }).FieldValue = {
    serverTimestamp: () => '<ts>',
    delete: () => ({ __delete: true }),
  };
  return { __esModule: true, default: fn };
});

jest.mock('@react-native-firebase/storage', () => {
  const fn = () => ({ ref: (path: string) => mockStorageRef(path) });
  return { __esModule: true, default: fn };
});

beforeEach(() => {
  mockState.configured = true;
  mockStore.users.clear();
  mockStore.leaderboard.clear();
  for (const key of Object.keys(mockStore)) {
    if (key !== 'users' && key !== 'leaderboard') delete mockStore[key];
  }
  mockStorage.lastPutFile = null;
});

const PROFILE: Omit<CloudProfile, 'updatedAt'> = {
  uid: 'u1',
  username: 'hana',
  displayName: 'Hana',
  avatarUrl: null,
  weeklyGoal: 5,
  totalXp: 1200,
  personalBests: { push: 30, squat: 42 } as CloudProfile['personalBests'],
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

  it('merges — a field another device wrote survives the upsert', async () => {
    mockStore.users.set('u1', { league: 'gold', createdAt: 99 });
    await upsertProfile(PROFILE);
    const d = mockStore.users.get('u1')!;
    expect(d.league).toBe('gold');
    expect(d.displayName).toBe('Hana');
    expect(d.createdAt).toBe(99);
  });

  it('is a no-op when unconfigured', async () => {
    mockState.configured = false;
    await upsertProfile(PROFILE);
    expect(mockStore.users.size).toBe(0);
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
  it('uploads the local file and returns its download URL', async () => {
    const url = await uploadAvatar('u1', 'file:///tmp/me.jpg');
    expect(mockStorage.lastPutFile).toBe('file:///tmp/me.jpg');
    expect(url).toBe('https://cdn.example/avatars/u1.jpg');
  });

  it('returns the original uri unchanged when unconfigured', async () => {
    mockState.configured = false;
    const url = await uploadAvatar('u1', 'file:///tmp/me.jpg');
    expect(url).toBe('file:///tmp/me.jpg');
    expect(mockStorage.lastPutFile).toBeNull();
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

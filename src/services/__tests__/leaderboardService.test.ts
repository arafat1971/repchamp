/**
 * Tests for the leaderboard & friends service.
 *
 * A small in-memory Firestore fake backs the flat `leaderboard` collection, the
 * `users` collection (for username lookup) and the `users/{uid}/friends`
 * subcollection. It supports the exact surface the service builds: chainable
 * `where`/`orderBy`/`limit` queries resolved on `.get()`, subcollection reads,
 * and an `.empty` flag so the username miss throws. `@/lib/firebase` is mocked so
 * both the live path and the unconfigured fallback to the local hardcoded board
 * are exercised.
 *
 * Jest hoists jest.mock() above imports, so every shared name a factory touches
 * is `mock`-prefixed (the only out-of-scope access the hoist guard allows).
 */

/* ------------------------------------------------------------------ */

import {
  addFriendByUsername,
  fetchActiveFriends,
  fetchFriends,
  fetchLeaderboard,
  fetchRecentAthletes,
} from '../leaderboardService';
import { ACTIVE_WINDOW_MS } from '@/domain/presence';
import { buildLeaderboard } from '@/domain/leaderboard';
import { currentWeekKey } from '@/services/userService';

jest.mock('@/services/safetyService', () => ({
  assertClientRateLimit: jest.fn(),
  commitClientRateLimit: jest.fn(),
  isBlockedByMe: jest.fn(async () => false),
  fetchBlockedIds: jest.fn(async () => new Set()),
}));

const mockState = { configured: true };

/**
 * Flat collections plus one nested friends subcollection, keyed as
 * `friends/<ownerUid>`. Query filters read straight off the stored docs.
 */
const mockStore: {
  leaderboard: Map<string, Record<string, unknown>>;
  users: Map<string, Record<string, unknown>>;
  [k: string]: Map<string, Record<string, unknown>>;
} = {
  leaderboard: new Map(),
  users: new Map(),
};

function mockCol(name: string) {
  if (!mockStore[name]) mockStore[name] = new Map();
  return mockStore[name]!;
}

function mockSnapshot(col: string, id: string) {
  const data = mockCol(col).get(id);
  return { id, exists: () => data !== undefined, data: () => data };
}

function mockQuery(
  col: string,
  filters: [string, unknown][],
  order: { field: string; dir: string } | null,
  limit: number | null,
) {
  return {
    where(field: string, _op: string, value: unknown) {
      return mockQuery(col, [...filters, [field, value]], order, limit);
    },
    orderBy(field: string, dir = 'asc') {
      return mockQuery(col, filters, { field, dir }, limit);
    },
    limit(n: number) {
      return mockQuery(col, filters, order, n);
    },
    async get() {
      let docs = [...mockCol(col).entries()].filter(([, data]) =>
        filters.every(([f, v]) => data[f] === v),
      );
      if (order) {
        docs = docs.sort((a, b) => {
          const av = Number(a[1][order.field] ?? 0);
          const bv = Number(b[1][order.field] ?? 0);
          return order.dir === 'desc' ? bv - av : av - bv;
        });
      }
      if (limit != null) docs = docs.slice(0, limit);
      return {
        empty: docs.length === 0,
        docs: docs.map(([id]) => mockSnapshot(col, id)),
      };
    },
  };
}

/** The friends subcollection doc write needs a nested set target. */
function mockFriendDocRef(ownerUid: string, friendUid: string) {
  const col = `friends/${ownerUid}`;
  return {
    id: friendUid,
    async set(data: Record<string, unknown>) {
      mockCol(col).set(friendUid, { ...data });
    },
  };
}

jest.mock('@/lib/firebase', () => ({
  isFirebaseConfigured: () => mockState.configured,
}));

jest.mock('@react-native-firebase/firestore', () => {
  const fn = () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({
        id,
        collection: (sub: string) => ({
          get: () =>
            mockQuery(`${sub}/${id}`, [], null, null).get(),
          doc: (friendUid: string) => mockFriendDocRef(id, friendUid),
        }),
        get: async () => mockSnapshot(name, id),
      }),
      where: (field: string, _op: string, value: unknown) =>
        mockQuery(name, [[field, value]], null, null),
      orderBy: (field: string, dir = 'asc') =>
        mockQuery(name, [], { field, dir }, null),
    }),
    batch: () => {
      const ops: (() => Promise<void>)[] = [];
      return {
        set(ref: { set: (data: Record<string, unknown>) => Promise<void> }, data: Record<string, unknown>) {
          ops.push(() => ref.set(data));
        },
        async commit() {
          for (const op of ops) await op();
        },
      };
    },
  });
  (fn as unknown as { FieldValue: unknown }).FieldValue = {
    serverTimestamp: () => '<ts>',
  };
  return { __esModule: true, default: fn };
});

beforeEach(() => {
  mockState.configured = true;
  mockStore.leaderboard.clear();
  mockStore.users.clear();
  // Clear any friends subcollections created by a prior test.
  for (const key of Object.keys(mockStore)) {
    if (key.startsWith('friends/')) mockStore[key]!.clear();
  }
});

function seedBoardRow(uid: string, weeklyXp: number, displayName: string, level = 1) {
  mockStore.leaderboard.set(uid, {
    uid,
    displayName,
    weeklyXp,
    level,
    weekKey: currentWeekKey(),
  });
}

describe('fetchLeaderboard', () => {
  it('falls back to the local board when unconfigured', async () => {
    mockState.configured = false;
    const rows = await fetchLeaderboard('me', 100, 'Me');
    expect(rows).toEqual(buildLeaderboard(100, 'Me'));
  });

  it('ranks live rows by weekly XP descending', async () => {
    seedBoardRow('a', 300, 'Ana');
    seedBoardRow('b', 500, 'Bo');
    seedBoardRow('me', 200, 'Me');
    const rows = await fetchLeaderboard('me', 200, 'Me');
    expect(rows.map((r) => r.name)).toEqual(['Bo', 'Ana', 'Me']);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(rows.find((r) => r.isYou)?.id).toBe('me');
  });

  it('guarantees you appear even when below the fetched cutoff', async () => {
    seedBoardRow('a', 300, 'Ana');
    seedBoardRow('b', 500, 'Bo');
    // "me" is not in the fetched slice; service must append the athlete.
    const rows = await fetchLeaderboard('me', 50, 'Me', 2);
    const you = rows.find((r) => r.isYou);
    expect(you).toBeDefined();
    expect(you?.name).toBe('Me');
    expect(you?.xp).toBe(50);
    // Ranks stay contiguous after the append.
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('only counts rows from the current week', async () => {
    seedBoardRow('a', 300, 'Ana');
    mockStore.leaderboard.set('stale', {
      uid: 'stale',
      displayName: 'LastWeek',
      weeklyXp: 9999,
      level: 9,
      weekKey: 'past',
    });
    const rows = await fetchLeaderboard('me', 10, 'Me');
    expect(rows.some((r) => r.name === 'LastWeek')).toBe(false);
  });
});

describe('fetchFriends', () => {
  it('returns an empty list when unconfigured', async () => {
    expect(await fetchFriends('me')).toEqual([]);
  });

  it('maps stored friend edges into Friend rows', async () => {
    mockCol('friends/me').set('f1', { displayName: 'Pat', level: 7, avatarUrl: null });
    mockCol('friends/me').set('f2', {});
    const friends = await fetchFriends('me');
    expect(friends).toEqual(
      expect.arrayContaining([
        { uid: 'f1', displayName: 'Pat', avatarUrl: null, level: 7 },
        // Missing fields fall back to sensible defaults.
        { uid: 'f2', displayName: 'Athlete', avatarUrl: null, level: 1 },
      ]),
    );
  });
});

describe('addFriendByUsername', () => {
  it('returns false when unconfigured', async () => {
    mockState.configured = false;
    expect(await addFriendByUsername('me', 'pat')).toBe(false);
  });

  it('resolves the username and writes only your own friend edge', async () => {
    mockStore.users.set('friend-uid', {
      username: 'pat',
      displayName: 'Pat',
      avatarUrl: null,
      level: 7,
    });
    mockStore.users.set('me', {
      username: 'me',
      displayName: 'Me',
      avatarUrl: 'https://cdn/me.jpg',
      level: 3,
    });
    const ok = await addFriendByUsername('me', 'Pat'); // case-insensitive
    expect(ok).toBe(true);
    const mine = mockCol('friends/me').get('friend-uid')!;
    expect(mine.displayName).toBe('Pat');
    expect(mine.level).toBe(7);
    expect(mine.addedAt).toBe('<ts>');
    // Owner-only: we do not force-inject onto Pat's list.
    expect(mockCol('friends/friend-uid').has('me')).toBe(false);
  });

  it('throws a friendly error when the username is unknown', async () => {
    await expect(addFriendByUsername('me', 'ghost')).rejects.toThrow(
      /No athlete found/i,
    );
  });

  it('refuses to friend yourself', async () => {
    mockStore.users.set('me', { username: 'myself', displayName: 'Me' });
    await expect(addFriendByUsername('me', 'myself')).rejects.toThrow(/that's you/i);
  });
});

describe('fetchActiveFriends', () => {
  const now = 1_700_000_000_000;

  it('marks friends online only when lastActiveAt is inside the window', async () => {
    mockCol('friends/me').set('pat', {
      displayName: 'Pat',
      avatarUrl: null,
      level: 4,
    });
    mockCol('friends/me').set('sam', {
      displayName: 'Sam',
      avatarUrl: null,
      level: 2,
    });
    mockStore.users.set('pat', {
      displayName: 'Pat',
      username: 'pat',
      lastActiveAt: now - 60_000,
      level: 4,
    });
    mockStore.users.set('sam', {
      displayName: 'Sam',
      username: 'sam',
      lastActiveAt: now - ACTIVE_WINDOW_MS - 1,
      level: 2,
    });

    const list = await fetchActiveFriends('me', ACTIVE_WINDOW_MS, now);
    expect(list).toHaveLength(2);
    expect(list.find((f) => f.uid === 'pat')?.online).toBe(true);
    expect(list.find((f) => f.uid === 'sam')?.online).toBe(false);
  });

  it('returns empty when unconfigured', async () => {
    mockState.configured = false;
    expect(await fetchActiveFriends('me')).toEqual([]);
  });
});

describe('fetchRecentAthletes', () => {
  it('returns newest profiles excluding self', async () => {
    mockStore.users.set('me', {
      displayName: 'Me',
      username: 'me',
      createdAt: 300,
    });
    mockStore.users.set('a', {
      displayName: 'Ada',
      username: 'ada',
      createdAt: 200,
      level: 1,
    });
    mockStore.users.set('b', {
      displayName: 'Bea',
      username: 'bea',
      createdAt: 100,
      level: 2,
    });

    const list = await fetchRecentAthletes('me', 10);
    expect(list.map((a) => a.uid)).toEqual(['a', 'b']);
    expect(list[0]?.username).toBe('ada');
  });

  it('returns empty when unconfigured', async () => {
    mockState.configured = false;
    expect(await fetchRecentAthletes('me')).toEqual([]);
  });
});

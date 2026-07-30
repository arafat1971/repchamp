/**
 * Tests for the matchmaking service — the Firestore I/O over the pure queue core.
 *
 * A tiny in-memory Firestore fake backs both the `matchmaking` ticket collection
 * and the `duels` collection, so we can assert the full pairing handshake: two
 * athletes enqueue, the second `tryPair`s, and we verify a real duel doc is minted
 * `active` with both seated and *both* tickets flipped to `matched` pointing at it.
 *
 * Jest hoists jest.mock() above imports, so every shared name a factory touches is
 * `mock`-prefixed (the only out-of-scope access the hoist guard allows).
 */

import type { QueueTicket } from '../../domain/matchmaking';
import type { Duel } from '../../domain/duel';

/* ------------------------------------------------------------------ */

import { enqueue, leaveQueue, tryPair } from '../matchmakingService';

const mockState = { configured: true };

/** collection -> (id -> doc data). Two collections in play: matchmaking, duels. */
const mockStore: {
  matchmaking: Map<string, Record<string, unknown>>;
  duels: Map<string, Record<string, unknown>>;
  [k: string]: Map<string, Record<string, unknown>>;
} = {
  matchmaking: new Map(),
  duels: new Map(),
};
let mockAutoId = 0;
let mockClock = 0; // monotonically increasing stand-in for serverTimestamp ordering

function mockCol(name: string) {
  if (!mockStore[name]) mockStore[name] = new Map();
  return mockStore[name]!;
}

function mockSnapshot(col: string, id: string) {
  const data = mockCol(col).get(id);
  return { id, exists: () => data !== undefined, data: () => data };
}

function mockDocRef(col: string, id: string) {
  return {
    id,
    _col: col,
    async set(data: Record<string, unknown>) {
      mockCol(col).set(id, { ...data });
    },
    async update(patch: Record<string, unknown>) {
      const cur = mockCol(col).get(id);
      if (!cur) throw new Error('no doc');
      Object.assign(cur, patch);
    },
    async delete() {
      mockCol(col).delete(id);
    },
    async get() {
      return mockSnapshot(col, id);
    },
    onSnapshot() {
      return () => {};
    },
  };
}

function mockQuery(col: string, filters: [string, unknown][], limit: number | null) {
  return {
    where(field: string, _op: string, value: unknown) {
      return mockQuery(col, [...filters, [field, value]], limit);
    },
    orderBy() {
      // The fake stamps `enqueuedAt` with a monotonic clock, so ascending insert
      // order == ascending enqueuedAt. Preserve Map insertion order.
      return mockQuery(col, filters, limit);
    },
    limit(n: number) {
      return mockQuery(col, filters, n);
    },
    async get() {
      let docs = [...mockCol(col).entries()].filter(([, data]) =>
        filters.every(([f, v]) => data[f] === v),
      );
      docs = docs.sort((a, b) => Number(a[1].enqueuedAt ?? 0) - Number(b[1].enqueuedAt ?? 0));
      if (limit != null) docs = docs.slice(0, limit);
      return { docs: docs.map(([id]) => mockSnapshot(col, id)) };
    },
  };
}

jest.mock('@/lib/firebase', () => ({
  isFirebaseConfigured: () => mockState.configured,
}));

jest.mock('@react-native-firebase/firestore', () => {
  const fn = () => ({
    collection: (name: string) => ({
      doc: (id?: string) => mockDocRef(name, id ?? `auto-${++mockAutoId}`),
      where: (field: string, _op: string, value: unknown) => mockQuery(name, [[field, value]], null),
    }),
    async runTransaction(cb: (tx: unknown) => Promise<unknown>) {
      const tx = {
        async get(ref: { id: string; _col: string }) {
          return mockSnapshot(ref._col, ref.id);
        },
        set(ref: { id: string; _col: string }, data: Record<string, unknown>) {
          mockCol(ref._col).set(ref.id, { ...data });
        },
        update(ref: { id: string; _col: string }, patch: Record<string, unknown>) {
          const cur = mockCol(ref._col).get(ref.id);
          if (!cur) throw new Error('no doc');
          Object.assign(cur, patch);
        },
      };
      return cb(tx);
    },
  });
  (fn as unknown as { FieldValue: unknown }).FieldValue = {
    // Monotonic so enqueue order is preserved for the ascending query.
    serverTimestamp: () => ++mockClock,
  };
  return { __esModule: true, default: fn };
});

beforeEach(() => {
  mockState.configured = true;
  mockStore.matchmaking.clear();
  mockStore.duels.clear();
  mockAutoId = 0;
  mockClock = 0;
});

const A = { uid: 'a', displayName: 'Ana', avatarUrl: null, level: 3 };
const B = { uid: 'b', displayName: 'Bo', avatarUrl: null, level: 6 };

describe('enqueue', () => {
  it('writes a waiting ticket keyed by uid', async () => {
    await enqueue(A);
    const t = mockStore.matchmaking.get('a') as unknown as QueueTicket;
    expect(t.status).toBe('waiting');
    expect(t.duelId).toBeNull();
    expect(t.displayName).toBe('Ana');
  });

  it('is a no-op when unconfigured', async () => {
    mockState.configured = false;
    await enqueue(A);
    expect(mockStore.matchmaking.size).toBe(0);
  });
});

describe('tryPair', () => {
  it('returns null and leaves the seeker queued when nobody else waits', async () => {
    await enqueue(A);
    const id = await tryPair(A);
    expect(id).toBeNull();
  });

  it('pairs two waiting athletes into one active duel with both matched', async () => {
    await enqueue(A); // A waits first (host)
    await enqueue(B); // B enters and seeks
    const duelId = await tryPair(B);

    expect(duelId).not.toBeNull();

    const duel = mockStore.duels.get(duelId!) as unknown as Duel;
    expect(duel.status).toBe('active');
    expect(duel.hostUid).toBe('a'); // the one who waited hosts
    expect(duel.guestUid).toBe('b'); // the seeker guests
    expect(duel.host.level).toBe(3);
    expect(duel.guest?.level).toBe(6);

    const ta = mockStore.matchmaking.get('a') as unknown as QueueTicket;
    const tb = mockStore.matchmaking.get('b') as unknown as QueueTicket;
    expect(ta.status).toBe('matched');
    expect(tb.status).toBe('matched');
    expect(ta.duelId).toBe(duelId);
    expect(tb.duelId).toBe(duelId);
  });

  it('never self-matches even if only your own ticket is queued', async () => {
    await enqueue(A);
    expect(await tryPair(A)).toBeNull();
  });

  it('is a no-op returning null when unconfigured', async () => {
    await enqueue(A);
    await enqueue(B);
    mockState.configured = false;
    expect(await tryPair(B)).toBeNull();
  });
});

describe('leaveQueue', () => {
  it('removes the ticket', async () => {
    await enqueue(A);
    await leaveQueue('a');
    expect(mockStore.matchmaking.has('a')).toBe(false);
  });

  it('is a no-op when unconfigured', async () => {
    await enqueue(A);
    mockState.configured = false;
    await leaveQueue('a');
    expect(mockStore.matchmaking.has('a')).toBe(true);
  });
});

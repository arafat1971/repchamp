/**
 * Tests for the duel service — the Firestore I/O layer over src/domain/duel.ts.
 *
 * Firestore is replaced with a tiny in-memory fake that records every write, so
 * we can assert the exact document the service produces: the seat-scoped dotted
 * field paths a live update writes, the transactional guest-seat claim, and the
 * winner settlement that only fires when both players are done. `@/lib/firebase`
 * is mocked so `isFirebaseConfigured()` can be toggled to exercise both the live
 * path and the unconfigured no-op fallback.
 */

import type { Duel , DuelPlayer } from '../../domain/duel';

/* ------------------------------------------------------------------ */

import {
  cancelDuel,
  createDuel,
  fetchIncomingDuels,
  finishDuel,
  forceSettleAbandoned,
  joinDuel,
  pushDuelPhoto,
  pushLiveState,
  seatFor,
  watchDuel,
  watchOpponent,
} from '../duelService';

/* ------------------------------------------------------------------ *
 * Mocks — declared before importing the module under test. Jest hoists
 * jest.mock() above imports, so all shared state a factory touches is
 * `mock`-prefixed (the only out-of-scope names the hoist guard allows).
 * ------------------------------------------------------------------ */

/** Toggle to exercise the live path vs. the unconfigured no-op fallback. */
const mockState = { configured: true };

/**
 * In-memory Firestore fake. One collection ('duels') of docs keyed by id, with
 * the exact surface the service uses: doc().set/update/delete/get, onSnapshot,
 * and runTransaction. `update` applies dotted field paths, so seat-scoped writes
 * (`host.reps`, `guest.done`) are observable in the recorded doc.
 */
const mockStore = new Map<string, Record<string, unknown>>();
let mockAutoId = 0;

/**
 * Live subscribers per doc id, so the fake `onSnapshot` behaves like Firestore:
 * every write (set/update/transaction) re-notifies every open subscriber with a
 * fresh snapshot. This is what lets a test prove real-time delivery — one
 * player's `pushLiveState` reaching the other player's `watchOpponent`.
 */
const mockSubs = new Map<string, Set<(snap: unknown) => void>>();
function mockNotify(id: string) {
  const subs = mockSubs.get(id);
  if (!subs) return;
  const snap = mockSnapshot(id);
  for (const cb of subs) cb(snap);
}

function mockApplyDotted(target: Record<string, unknown>, patch: Record<string, unknown>) {
  for (const [key, value] of Object.entries(patch)) {
    if (!key.includes('.')) {
      target[key] = value;
      continue;
    }
    const parts = key.split('.');
    let node = target;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i]!;
      node[p] = { ...(node[p] as Record<string, unknown>) };
      node = node[p] as Record<string, unknown>;
    }
    node[parts[parts.length - 1]!] = value;
  }
}

function mockSnapshot(id: string) {
  const data = mockStore.get(id);
  return { id, exists: () => data !== undefined, data: () => data };
}

function mockDocRef(id: string) {
  return {
    id,
    async set(data: Record<string, unknown>) {
      mockStore.set(id, { ...data });
      mockNotify(id);
    },
    async update(patch: Record<string, unknown>) {
      const cur = mockStore.get(id);
      if (!cur) throw new Error('no doc');
      mockApplyDotted(cur, patch);
      mockNotify(id);
    },
    async delete() {
      mockStore.delete(id);
      mockNotify(id);
    },
    async get() {
      return mockSnapshot(id);
    },
    // Live subscription: fires immediately with the current value (as Firestore
    // does) and again on every subsequent write, until unsubscribed.
    onSnapshot(onNext: (snap: unknown) => void) {
      let set = mockSubs.get(id);
      if (!set) {
        set = new Set();
        mockSubs.set(id, set);
      }
      set.add(onNext);
      onNext(mockSnapshot(id));
      return () => set!.delete(onNext);
    },
  };
}

jest.mock('@/lib/firebase', () => ({
  isFirebaseConfigured: () => mockState.configured,
}));

jest.mock('@/services/safetyService', () => ({
  isBlockedEither: jest.fn(async () => false),
}));

jest.mock('@/services/safetyService', () => ({
  isBlockedEither: jest.fn(async () => false),
}));

jest.mock('@react-native-firebase/firestore', () => {
  // A query over the in-memory store: chainable equality `where`s, a `createdAt`
  // sort, and a `limit`, resolved lazily on `.get()`. Mirrors the shape
  // fetchIncomingDuels builds so the fake exercises the real query path.
  function mockQuery(filters: [string, unknown][], limit: number | null) {
    return {
      where(field: string, _op: string, value: unknown) {
        return mockQuery([...filters, [field, value]], limit);
      },
      orderBy() {
        return mockQuery(filters, limit);
      },
      limit(n: number) {
        return mockQuery(filters, n);
      },
      async get() {
        let docs = [...mockStore.entries()]
          .filter(([, data]) => filters.every(([f, v]) => data[f] === v))
          // Newest first, matching orderBy('createdAt', 'desc').
          .sort((a, b) => String(b[1].createdAt ?? '').localeCompare(String(a[1].createdAt ?? '')));
        if (limit != null) docs = docs.slice(0, limit);
        return { docs: docs.map(([id]) => mockSnapshot(id)) };
      },
    };
  }

  const fn = () => ({
    collection: () => ({
      doc: (id?: string) => mockDocRef(id ?? `auto-${++mockAutoId}`),
      where: (field: string, _op: string, value: unknown) => mockQuery([[field, value]], null),
    }),
    async runTransaction(cb: (tx: unknown) => Promise<unknown>) {
      const tx = {
        async get(ref: { id: string }) {
          return mockSnapshot(ref.id);
        },
        update(ref: { id: string }, patch: Record<string, unknown>) {
          const cur = mockStore.get(ref.id);
          if (!cur) throw new Error('no doc');
          mockApplyDotted(cur, patch);
          mockNotify(ref.id);
        },
        delete(ref: { id: string }) {
          mockStore.delete(ref.id);
          mockNotify(ref.id);
        },
      };
      return cb(tx);
    },
  });
  (fn as unknown as { FieldValue: unknown }).FieldValue = {
    serverTimestamp: () => '<ts>',
  };
  return { __esModule: true, default: fn };
});

/** Records what was uploaded per path and returns a deterministic URL. */
const mockStorage = { lastPutFile: null as string | null, lastPath: null as string | null };
jest.mock('@react-native-firebase/storage', () => {
  const fn = () => ({
    ref: (path: string) => ({
      async putFile(uri: string) {
        mockStorage.lastPutFile = uri;
        mockStorage.lastPath = path;
      },
      async getDownloadURL() {
        return `https://cdn.example/${path}`;
      },
    }),
  });
  return { __esModule: true, default: fn };
});

beforeEach(() => {
  mockState.configured = true;
  mockStore.clear();
  mockSubs.clear();
  mockAutoId = 0;
  mockStorage.lastPutFile = null;
  mockStorage.lastPath = null;
});

const HOST = { uid: 'h', displayName: 'Hana', avatarUrl: null, level: 3 };
const GUEST = { uid: 'g', displayName: 'Gus', avatarUrl: null, level: 5 };

async function openAndJoin(): Promise<string> {
  const id = await createDuel({ ...HOST, exercise: 'push', duration: 20 });
  await joinDuel(id!, GUEST);
  return id!;
}

describe('createDuel', () => {
  it('writes a pending duel seated by the host, empty guest', async () => {
    const id = await createDuel({ ...HOST, exercise: 'push', duration: 20 });
    expect(id).not.toBeNull();
    const d = mockStore.get(id!) as unknown as Duel;
    expect(d.status).toBe('pending');
    expect(d.hostUid).toBe('h');
    expect(d.guestUid).toBeNull();
    expect(d.guest).toBeNull();
    expect(d.host.reps).toBe(0);
    expect(d.host.done).toBe(false);
    expect(d.kind).toBe('duel');
  });

  it('persists train / compete invite kinds', async () => {
    const trainId = await createDuel({
      ...HOST,
      exercise: 'push',
      duration: 30,
      kind: 'train',
      targetUid: 'g',
    });
    const train = mockStore.get(trainId!) as unknown as Duel;
    expect(train.kind).toBe('train');
    expect(train.cooperative).toBe(true);

    const competeId = await createDuel({
      ...HOST,
      exercise: 'squat',
      duration: 45,
      kind: 'compete',
      targetUid: 'g',
    });
    const compete = mockStore.get(competeId!) as unknown as Duel;
    expect(compete.kind).toBe('compete');
    expect(compete.cooperative).toBe(false);
  });

  it('is a no-op returning null when Firebase is unconfigured', async () => {
    mockState.configured = false;
    const id = await createDuel({ ...HOST, exercise: 'push', duration: 20 });
    expect(id).toBeNull();
    expect(mockStore.size).toBe(0);
  });
});

describe('joinDuel', () => {
  it('seats the guest and flips the duel to active', async () => {
    const id = await createDuel({ ...HOST, exercise: 'push', duration: 20 });
    const joined = await joinDuel(id!, GUEST);
    expect(joined?.status).toBe('active');
    const d = mockStore.get(id!) as unknown as Duel;
    expect(d.guestUid).toBe('g');
    expect(d.guest?.displayName).toBe('Gus');
    expect(d.status).toBe('active');
  });

  it('rejects joining your own duel', async () => {
    const id = await createDuel({ ...HOST, exercise: 'push', duration: 20 });
    await expect(joinDuel(id!, HOST)).rejects.toThrow(/your own/i);
  });

  it('rejects a second joiner once the seat is taken', async () => {
    const id = await openAndJoin();
    await expect(joinDuel(id, { uid: 'x', displayName: 'X', avatarUrl: null, level: 1 })).rejects.toThrow(
      /already joined/i,
    );
  });

  it('throws a friendly error for a missing duel', async () => {
    await expect(joinDuel('nope', GUEST)).rejects.toThrow(/no longer exists/i);
  });

  it('is a no-op returning null when unconfigured', async () => {
    const id = await createDuel({ ...HOST, exercise: 'push', duration: 20 });
    mockState.configured = false;
    expect(await joinDuel(id!, GUEST)).toBeNull();
  });
});

describe('pushLiveState', () => {
  it('writes only the given seat, leaving the other untouched', async () => {
    const id = await openAndJoin();
    await pushLiveState(id, 'guest', { reps: 7, formScore: 82.6 });
    const d = mockStore.get(id!) as unknown as Duel;
    expect(d.guest?.reps).toBe(7);
    // Rounds the form score for a compact write.
    expect(d.guest?.formScore).toBe(83);
    // Host seat is untouched.
    expect(d.host.reps).toBe(0);
  });

  it('is a no-op when unconfigured', async () => {
    const id = await openAndJoin();
    mockState.configured = false;
    expect(await pushLiveState(id, 'host', { reps: 99, formScore: 100 })).toBe(false);
    expect((mockStore.get(id!) as unknown as Duel).host.reps).toBe(0);
  });

  it('returns true after a successful live write', async () => {
    const id = await openAndJoin();
    expect(await pushLiveState(id, 'host', { reps: 3, formScore: 80 })).toBe(true);
  });
});

describe('pushDuelPhoto', () => {
  it('uploads to the seat-scoped path and writes the download URL onto that seat', async () => {
    const id = await openAndJoin();
    expect(await pushDuelPhoto(id, 'guest', 'file:///tmp/action.jpg')).toBe(true);
    expect(mockStorage.lastPutFile).toBe('file:///tmp/action.jpg');
    expect(mockStorage.lastPath).toBe(`duelPhotos/${id}/guest.jpg`);
    const d = mockStore.get(id!) as unknown as Duel;
    expect(d.guest?.photoUrl).toBe(`https://cdn.example/duelPhotos/${id}/guest.jpg`);
    // Host seat is untouched.
    expect(d.host.photoUrl).toBeUndefined();
  });

  it('is a no-op when unconfigured', async () => {
    const id = await openAndJoin();
    mockState.configured = false;
    expect(await pushDuelPhoto(id, 'host', 'file:///tmp/action.jpg')).toBe(false);
    expect(mockStorage.lastPutFile).toBeNull();
  });
});

describe('finishDuel', () => {
  it('marks a seat done but leaves the duel active until both finish', async () => {
    const id = await openAndJoin();
    await finishDuel(id, 'host', { reps: 12, formScore: 90 });
    const d = mockStore.get(id!) as unknown as Duel;
    expect(d.host.done).toBe(true);
    expect(d.host.reps).toBe(12);
    expect(d.status).toBe('active');
    // winnerUid stays at its created default until both players finish.
    expect(d.winnerUid).toBeNull();
  });

  it('settles the winner once both players are done', async () => {
    const id = await openAndJoin();
    await finishDuel(id, 'host', { reps: 12, formScore: 90 });
    await finishDuel(id, 'guest', { reps: 9, formScore: 88 });
    const d = mockStore.get(id!) as unknown as Duel;
    expect(d.status).toBe('finished');
    expect(d.winnerUid).toBe('h');
  });

  it('makes a forfeit lose even with more reps', async () => {
    const id = await openAndJoin();
    await finishDuel(id, 'guest', { reps: 4, formScore: 70 });
    await finishDuel(id, 'host', { reps: 20, formScore: 95, forfeited: true });
    const d = mockStore.get(id!) as unknown as Duel;
    expect(d.status).toBe('finished');
    expect(d.winnerUid).toBe('g');
  });

  it('resolves an equal-reps, no-forfeit finish to a draw', async () => {
    const id = await openAndJoin();
    await finishDuel(id, 'host', { reps: 8, formScore: 80 });
    await finishDuel(id, 'guest', { reps: 8, formScore: 80 });
    const d = mockStore.get(id!) as unknown as Duel;
    expect(d.status).toBe('finished');
    expect(d.winnerUid).toBeNull();
  });

  it('is a no-op when unconfigured', async () => {
    const id = await openAndJoin();
    mockState.configured = false;
    await finishDuel(id, 'host', { reps: 5, formScore: 50 });
    expect((mockStore.get(id!) as unknown as Duel).host.done).toBe(false);
  });

  it('does not rewrite a finished duel or an already-done seat', async () => {
    const id = await openAndJoin();
    await finishDuel(id, 'host', { reps: 12, formScore: 90 });
    await finishDuel(id, 'guest', { reps: 9, formScore: 88 });
    const before = mockStore.get(id!) as unknown as Duel;
    expect(before.winnerUid).toBe('h');

    await finishDuel(id, 'host', { reps: 99, formScore: 10 });
    await finishDuel(id, 'guest', { reps: 99, formScore: 10 });
    const after = mockStore.get(id!) as unknown as Duel;
    expect(after.host.reps).toBe(12);
    expect(after.guest?.reps).toBe(9);
    expect(after.winnerUid).toBe('h');
    expect(after.status).toBe('finished');
  });
});

describe('forceSettleAbandoned', () => {
  it('forfeits an open opponent seat and settles the winner', async () => {
    const id = await openAndJoin();
    await finishDuel(id, 'host', { reps: 15, formScore: 92 });
    const ok = await forceSettleAbandoned(id, 'h', { reps: 15, formScore: 92 });
    expect(ok).toBe(true);
    const d = mockStore.get(id!) as unknown as Duel;
    expect(d.status).toBe('finished');
    expect(d.guest?.done).toBe(true);
    expect(d.guest?.forfeited).toBe(true);
    expect(d.winnerUid).toBe('h');
  });

  it('does not forfeit a still-live opponent before match end + grace', async () => {
    const id = await openAndJoin();
    const doc = mockStore.get(id!)!;
    doc.startedAt = Date.now();
    doc.duration = 60;
    await finishDuel(id, 'host', { reps: 15, formScore: 92 });
    const ok = await forceSettleAbandoned(id, 'h', { reps: 15, formScore: 92 });
    expect(ok).toBe(false);
    const d = mockStore.get(id!) as unknown as Duel;
    expect(d.status).toBe('active');
    expect(d.host.done).toBe(true);
    expect(d.guest?.done).toBe(false);
    expect(d.guest?.forfeited).toBe(false);
  });

  it('is a no-op when the duel is already finished', async () => {
    const id = await openAndJoin();
    await finishDuel(id, 'host', { reps: 10, formScore: 80 });
    await finishDuel(id, 'guest', { reps: 12, formScore: 85 });
    await forceSettleAbandoned(id, 'h', { reps: 99, formScore: 1 });
    const d = mockStore.get(id!) as unknown as Duel;
    expect(d.winnerUid).toBe('g');
    expect(d.host.reps).toBe(10);
  });
});

describe('real-time head-to-head competition', () => {
  it('delivers one player\'s live reps to the other player in real time', async () => {
    const id = await openAndJoin();

    // The host's device watches the *opponent* (the guest) — this is the exact
    // seam the session HUD consumes to render the rival's live count.
    const seen: (number | undefined)[] = [];
    const stop = watchOpponent(id, HOST.uid, (opp) => seen.push(opp?.reps));

    // Fires immediately with the current value (guest at 0), like Firestore.
    expect(seen).toEqual([0]);

    // The guest streams reps from their own device...
    await pushLiveState(id, 'guest', { reps: 3, formScore: 90 });
    await pushLiveState(id, 'guest', { reps: 7, formScore: 91 });
    await pushLiveState(id, 'guest', { reps: 12, formScore: 92 });

    // ...and the host sees each tick arrive live, in order.
    expect(seen).toEqual([0, 3, 7, 12]);

    stop();
    // After unsubscribing, further pushes are not delivered.
    await pushLiveState(id, 'guest', { reps: 20, formScore: 95 });
    expect(seen).toEqual([0, 3, 7, 12]);
  });

  it('syncs both directions at once — each player sees only the other\'s reps', async () => {
    const id = await openAndJoin();

    // The HUD consumes only the *latest* opponent rep count, so we track that —
    // Firestore re-delivers the whole doc on any write, and a value that hasn't
    // changed simply repeats, which the HUD renders idempotently.
    let hostSeesGuest = -1;
    let guestSeesHost = -1;
    const stopA = watchOpponent(id, HOST.uid, (o) => o && (hostSeesGuest = o.reps));
    const stopB = watchOpponent(id, GUEST.uid, (o) => o && (guestSeesHost = o.reps));

    // Interleave reps as two people racing would.
    await pushLiveState(id, 'host', { reps: 2, formScore: 88 });
    await pushLiveState(id, 'guest', { reps: 1, formScore: 90 });
    await pushLiveState(id, 'host', { reps: 5, formScore: 88 });
    await pushLiveState(id, 'guest', { reps: 6, formScore: 90 });

    // Each device ends up showing the *other* player's latest count — never its own.
    expect(guestSeesHost).toBe(5); // guest's screen shows the host's 5
    expect(hostSeesGuest).toBe(6); // host's screen shows the guest's 6

    stopA();
    stopB();
  });

  it('pushes the settled result to both players the instant the duel finishes', async () => {
    const id = await openAndJoin();

    let latest: Duel | null = null;
    const stop = watchDuel(id, (d) => (latest = d));

    await finishDuel(id, 'host', { reps: 15, formScore: 92 });
    // One player done — still active, no winner yet, seen live.
    expect((latest as Duel | null)?.status).toBe('active');
    expect((latest as Duel | null)?.winnerUid).toBeNull();

    await finishDuel(id, 'guest', { reps: 11, formScore: 90 });
    // Both done — the transaction's settled result lands on the live watcher.
    expect((latest as Duel | null)?.status).toBe('finished');
    expect((latest as Duel | null)?.winnerUid).toBe(HOST.uid);

    stop();
  });

  it('resolves the seat each device writes, so a player only streams their own reps', async () => {
    const id = await openAndJoin();
    const duel = mockStore.get(id) as unknown as Duel;
    // Each device asks "which seat am I?" and streams into it — never the rival's.
    expect(seatFor(duel, HOST.uid)).toBe('host');
    expect(seatFor(duel, GUEST.uid)).toBe('guest');

    const player: DuelPlayer | undefined = duel.guest ?? undefined;
    expect(player?.displayName).toBe('Gus');
  });
});

describe('cancelDuel', () => {
  it('deletes a pending duel', async () => {
    const id = await createDuel({ ...HOST, exercise: 'push', duration: 20 });
    await cancelDuel(id!);
    expect(mockStore.has(id!)).toBe(false);
  });

  it('does not delete an active duel (guest already joined)', async () => {
    const id = await openAndJoin();
    await cancelDuel(id);
    expect(mockStore.has(id)).toBe(true);
    expect((mockStore.get(id) as unknown as Duel).status).toBe('active');
  });

  it('is a no-op when unconfigured', async () => {
    const id = await createDuel({ ...HOST, exercise: 'push', duration: 20 });
    mockState.configured = false;
    await cancelDuel(id!);
    expect(mockStore.has(id!)).toBe(true);
  });
});

describe('fetchIncomingDuels', () => {
  it('returns pending challenges addressed to the athlete, shaped for the inbox', async () => {
    const id = await createDuel({ ...HOST, exercise: 'push', duration: 20, targetUid: 'g' });
    const inbox = await fetchIncomingDuels('g');
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toEqual({
      id,
      exercise: 'push',
      duration: 20,
      hostUid: 'h',
      hostName: 'Hana',
      hostAvatarUrl: null,
      hostLevel: 3,
      kind: 'duel',
      cooperative: false,
    });
  });

  it('excludes challenges addressed to someone else', async () => {
    await createDuel({ ...HOST, exercise: 'push', duration: 20, targetUid: 'someone-else' });
    expect(await fetchIncomingDuels('g')).toHaveLength(0);
  });

  it('excludes open (untargeted) duels', async () => {
    await createDuel({ ...HOST, exercise: 'push', duration: 20 });
    expect(await fetchIncomingDuels('g')).toHaveLength(0);
  });

  it('excludes a challenge once a guest has joined it', async () => {
    const id = await createDuel({ ...HOST, exercise: 'push', duration: 20, targetUid: 'g' });
    await joinDuel(id!, GUEST);
    // It's active now, not pending — and already claimed — so it drops out.
    expect(await fetchIncomingDuels('g')).toHaveLength(0);
  });

  it('honours the limit', async () => {
    await createDuel({ ...HOST, exercise: 'push', duration: 20, targetUid: 'g' });
    await createDuel({ ...HOST, exercise: 'push', duration: 20, targetUid: 'g' });
    await createDuel({ ...HOST, exercise: 'push', duration: 20, targetUid: 'g' });
    expect(await fetchIncomingDuels('g', 2)).toHaveLength(2);
  });

  it('is empty when unconfigured', async () => {
    await createDuel({ ...HOST, exercise: 'push', duration: 20, targetUid: 'g' });
    mockState.configured = false;
    expect(await fetchIncomingDuels('g')).toEqual([]);
  });
});

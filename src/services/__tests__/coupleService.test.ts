/**
 * Tests for the couple service — the Firestore I/O over the pure `couple.ts`
 * core.
 *
 * A small in-memory Firestore fake backs the `couples` collection (keyed by pair
 * code == doc id) and the `users` collection the nudge path reads a push token
 * from. It supports the surface the service builds: `runTransaction` with
 * get/set, merge-writes, `onSnapshot`, an `array-contains` query, and `delete`.
 * `makePairCode` is seeded through the couple domain, so a deterministic code is
 * forced by stubbing `Math.random`. `global.fetch` is mocked so the Expo push
 * leg of `nudgePartner` is asserted without a network.
 *
 * Jest hoists jest.mock() above imports, so every shared name a factory touches
 * is `mock`-prefixed (the only out-of-scope access the hoist guard allows).
 */

import type { Couple } from '../../domain/couple';

/* ------------------------------------------------------------------ */

import {
  createCouple,
  joinCoupleByCode,
  leaveCouple,
  nudgePartner,
  recordCoupleSession,
  watchCouple,
  watchMyCouple,
} from '../coupleService';
import { PAIR_CODE_LENGTH } from '../../domain/couple';

const mockState = { configured: true };

const mockStore: {
  couples: Map<string, Record<string, unknown>>;
  users: Map<string, Record<string, unknown>>;
  [k: string]: Map<string, Record<string, unknown>>;
} = {
  couples: new Map(),
  users: new Map(),
};

function mockCol(name: string) {
  if (!mockStore[name]) mockStore[name] = new Map();
  return mockStore[name]!;
}

function mockSnapshot(col: string, id: string) {
  const data = mockCol(col).get(id);
  return {
    id,
    exists: () => data !== undefined,
    data: () => data,
    get: (field: string) => data?.[field],
  };
}

function mockDocRef(col: string, id: string) {
  return {
    id,
    _col: col,
    async set(data: Record<string, unknown>, opts?: { merge?: boolean }) {
      const store = mockCol(col);
      if (opts?.merge) store.set(id, { ...(store.get(id) ?? {}), ...data });
      else store.set(id, { ...data });
    },
    async get() {
      return mockSnapshot(col, id);
    },
    async delete() {
      mockCol(col).delete(id);
    },
    onSnapshot(onNext: (snap: unknown) => void) {
      // Fire once with the current value, matching the real initial emission.
      onNext(mockSnapshot(col, id));
      return () => {};
    },
  };
}

function mockQuery(col: string, filters: [string, string, unknown][], limit: number | null) {
  const matches = () =>
    [...mockCol(col).entries()].filter(([, data]) =>
      filters.every(([f, op, v]) =>
        op === 'array-contains'
          ? Array.isArray(data[f]) && (data[f] as unknown[]).includes(v)
          : data[f] === v,
      ),
    );
  return {
    where(field: string, op: string, value: unknown) {
      return mockQuery(col, [...filters, [field, op, value]], limit);
    },
    limit(n: number) {
      return mockQuery(col, filters, n);
    },
    onSnapshot(onNext: (snap: unknown) => void) {
      let docs = matches();
      if (limit != null) docs = docs.slice(0, limit);
      onNext({ docs: docs.map(([id]) => mockSnapshot(col, id)) });
      return () => {};
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
      where: (field: string, op: string, value: unknown) =>
        mockQuery(name, [[field, op, value]], null),
    }),
    async runTransaction(cb: (tx: unknown) => Promise<unknown>) {
      const tx = {
        async get(ref: { _col: string; id: string }) {
          return mockSnapshot(ref._col, ref.id);
        },
        set(ref: { _col: string; id: string }, data: Record<string, unknown>, opts?: { merge?: boolean }) {
          const store = mockCol(ref._col);
          if (opts?.merge) store.set(ref.id, { ...(store.get(ref.id) ?? {}), ...data });
          else store.set(ref.id, { ...data });
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

// userService (imported transitively for the nudge's push-token read) pulls in
// Storage, whose real ESM entry Jest can't parse — stub it out.
jest.mock('@react-native-firebase/storage', () => ({
  __esModule: true,
  default: () => ({ ref: () => ({}) }),
}));

const ADA = { uid: 'ada', displayName: 'Ada' };
const BEA = { uid: 'bea', displayName: 'Bea' };

let realRandom: () => number;

beforeEach(() => {
  mockState.configured = true;
  mockStore.couples.clear();
  mockStore.users.clear();
  realRandom = Math.random;
  // Deterministic pair codes so tests can predict the doc id.
  Math.random = () => 0;
  (global as unknown as { fetch: jest.Mock }).fetch = jest
    .fn()
    .mockResolvedValue({ ok: true });
});

afterEach(() => {
  Math.random = realRandom;
});

describe('createCouple', () => {
  it('mints a pending couple keyed by a pair code and seats the creator', async () => {
    const code = await createCouple(ADA);
    expect(code).not.toBeNull();
    expect(code).toHaveLength(PAIR_CODE_LENGTH);
    const c = mockStore.couples.get(code!) as unknown as Couple;
    expect(c.pending).toBe(true);
    expect(c.memberUids).toEqual(['ada']);
    expect(c.members[0]!.displayName).toBe('Ada');
    expect(c.members[0]!.totalReps).toBe(0);
  });

  it('returns null when unconfigured', async () => {
    mockState.configured = false;
    expect(await createCouple(ADA)).toBeNull();
    expect(mockStore.couples.size).toBe(0);
  });
});

describe('joinCoupleByCode', () => {
  async function open(): Promise<string> {
    const code = await createCouple(ADA);
    return code!;
  }

  it('takes the open seat and flips the couple to paired', async () => {
    const code = await open();
    const paired = await joinCoupleByCode(code, BEA);
    expect(paired?.pending).toBe(false);
    expect(paired?.memberUids).toEqual(['ada', 'bea']);
    const c = mockStore.couples.get(code) as unknown as Couple;
    expect(c.members).toHaveLength(2);
  });

  it('rejects a malformed code before touching Firestore', async () => {
    await expect(joinCoupleByCode('!!', BEA)).rejects.toThrow(/does not look right/i);
  });

  it('throws when the code is unknown', async () => {
    await expect(joinCoupleByCode('ZZZZZZ', BEA)).rejects.toThrow(/No couple found/i);
  });

  it('is idempotent when you re-scan your own code', async () => {
    const code = await open();
    const same = await joinCoupleByCode(code, ADA);
    expect(same?.memberUids).toEqual(['ada']);
  });

  it('refuses a third member once the couple is full', async () => {
    const code = await open();
    await joinCoupleByCode(code, BEA);
    await expect(
      joinCoupleByCode(code, { uid: 'cy', displayName: 'Cy' }),
    ).rejects.toThrow(/already paired up/i);
  });

  it('returns null when unconfigured', async () => {
    mockState.configured = false;
    expect(await joinCoupleByCode('ZZZZZZ', BEA)).toBeNull();
  });
});

describe('watchCouple / watchMyCouple', () => {
  it('watchCouple emits the current couple immediately', async () => {
    const code = await createCouple(ADA);
    const seen: (Couple | null)[] = [];
    const unsub = watchCouple(code!, (c) => seen.push(c));
    expect(seen).toHaveLength(1);
    expect(seen[0]?.memberUids).toEqual(['ada']);
    unsub();
  });

  it('watchCouple emits null for a missing couple', () => {
    const seen: (Couple | null)[] = [];
    watchCouple('ZZZZZZ', (c) => seen.push(c));
    expect(seen[0]).toBeNull();
  });

  it('watchMyCouple finds the couple by membership', async () => {
    const code = await createCouple(ADA);
    await joinCoupleByCode(code!, BEA);
    const seen: (Couple | null)[] = [];
    watchMyCouple('bea', (c) => seen.push(c));
    expect(seen[0]?.id).toBe(code);
  });

  it('watchMyCouple emits null when the athlete is in no couple', () => {
    const seen: (Couple | null)[] = [];
    watchMyCouple('nobody', (c) => seen.push(c));
    expect(seen[0]).toBeNull();
  });

  it('both emit null once and no-op-unsubscribe when unconfigured', () => {
    mockState.configured = false;
    const a: (Couple | null)[] = [];
    const b: (Couple | null)[] = [];
    expect(typeof watchCouple('x', (c) => a.push(c))).toBe('function');
    expect(typeof watchMyCouple('x', (c) => b.push(c))).toBe('function');
    expect(a).toEqual([null]);
    expect(b).toEqual([null]);
  });
});

describe('recordCoupleSession', () => {
  it('credits reps and adds today to the crediting member only', async () => {
    const code = await createCouple(ADA);
    await joinCoupleByCode(code!, BEA);
    await recordCoupleSession(code!, 'ada', 12, '2026-07-26');
    const c = mockStore.couples.get(code!) as unknown as Couple;
    const ada = c.members.find((m) => m.uid === 'ada')!;
    const bea = c.members.find((m) => m.uid === 'bea')!;
    expect(ada.totalReps).toBe(12);
    expect(ada.trainedDays).toEqual(['2026-07-26']);
    expect(bea.totalReps).toBe(0);
    expect(bea.trainedDays).toEqual([]);
  });

  it('records the same day once but keeps accumulating reps', async () => {
    const code = await createCouple(ADA);
    await recordCoupleSession(code!, 'ada', 10, '2026-07-26');
    await recordCoupleSession(code!, 'ada', 5, '2026-07-26');
    const c = mockStore.couples.get(code!) as unknown as Couple;
    const ada = c.members.find((m) => m.uid === 'ada')!;
    expect(ada.totalReps).toBe(15);
    expect(ada.trainedDays).toEqual(['2026-07-26']);
  });

  it('is a no-op for an unknown couple', async () => {
    await recordCoupleSession('ZZZZZZ', 'ada', 5, '2026-07-26');
    expect(mockStore.couples.has('ZZZZZZ')).toBe(false);
  });

  it('is a no-op when unconfigured', async () => {
    const code = await createCouple(ADA);
    mockState.configured = false;
    await recordCoupleSession(code!, 'ada', 5, '2026-07-26');
    const c = mockStore.couples.get(code!) as unknown as Couple;
    expect(c.members[0]!.totalReps).toBe(0);
  });
});

describe('nudgePartner', () => {
  async function pairedCode(): Promise<string> {
    const code = await createCouple(ADA);
    await joinCoupleByCode(code!, BEA);
    return code!;
  }

  it('writes the in-app nudge record onto the couple document', async () => {
    const code = await pairedCode();
    await nudgePartner(code, 'ada', 'Ada');
    const c = mockStore.couples.get(code) as unknown as Couple & {
      nudge?: { fromUid: string };
    };
    expect(c.nudge?.fromUid).toBe('ada');
  });

  it('pushes to the partner when they have a valid Expo token', async () => {
    const code = await pairedCode();
    mockStore.users.set('bea', { expoPushToken: 'ExponentPushToken[bea]' });
    await nudgePartner(code, 'ada', 'Ada');
    const fetchMock = (global as unknown as { fetch: jest.Mock }).fetch;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain('exp.host');
    const body = JSON.parse(init.body as string);
    expect(body.to).toBe('ExponentPushToken[bea]');
    expect(body.title).toBe('Ada is training');
    expect(body.data).toEqual({ type: 'couple-nudge', coupleId: code });
  });

  it('skips the push when the partner has no valid token', async () => {
    const code = await pairedCode();
    mockStore.users.set('bea', { expoPushToken: 'not-a-real-token' });
    await nudgePartner(code, 'ada', 'Ada');
    expect((global as unknown as { fetch: jest.Mock }).fetch).not.toHaveBeenCalled();
  });

  it('still writes the in-app nudge even if the push throws', async () => {
    const code = await pairedCode();
    mockStore.users.set('bea', { expoPushToken: 'ExponentPushToken[bea]' });
    (global as unknown as { fetch: jest.Mock }).fetch = jest
      .fn()
      .mockRejectedValue(new Error('offline'));
    await expect(nudgePartner(code, 'ada', 'Ada')).resolves.toBeUndefined();
    const c = mockStore.couples.get(code) as unknown as { nudge?: { fromUid: string } };
    expect(c.nudge?.fromUid).toBe('ada');
  });

  it('is a no-op when unconfigured', async () => {
    const code = await pairedCode();
    mockState.configured = false;
    await nudgePartner(code, 'ada', 'Ada');
    expect((global as unknown as { fetch: jest.Mock }).fetch).not.toHaveBeenCalled();
  });
});

describe('leaveCouple', () => {
  it('deletes the couple document', async () => {
    const code = await createCouple(ADA);
    await leaveCouple(code!);
    expect(mockStore.couples.has(code!)).toBe(false);
  });

  it('is a no-op when unconfigured', async () => {
    const code = await createCouple(ADA);
    mockState.configured = false;
    await leaveCouple(code!);
    expect(mockStore.couples.has(code!)).toBe(true);
  });
});

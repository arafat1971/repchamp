/**
 * Safety service — blocking, reporting, and the client rate limits.
 *
 * The pure rate-limit maths is covered in `domain/__tests__/safety.test.ts`;
 * what is exercised here is the service wiring around it — that slots are
 * keyed per athlete and per target, that a failed write does not burn the
 * reporter's quota, and that blocking cleans up the relationships the rules
 * actually permit it to touch.
 */

const mockState = {
  configured: true,
  /** Docs deleted this run, as `collection/doc` paths. */
  deleted: [] as string[],
  /** Docs written via the batch, as `collection/doc` paths. */
  written: [] as string[],
  /** Reports added to the create-only collection. */
  reports: [] as Record<string, unknown>[],
  /** Make the reports write reject, standing in for a rules denial. */
  reportThrows: false,
  /** Duel docs the queries return. */
  duels: [] as Record<string, unknown>[],
  /** Couple docs the queries return. */
  couples: [] as Record<string, unknown>[],
};

const mockStore = new Map<string, string>();

jest.mock('@/lib/storage', () => ({
  storage: {
    getString: (k: string) => mockStore.get(k),
    set: (k: string, v: string) => {
      mockStore.set(k, v);
    },
    remove: (k: string) => {
      mockStore.delete(k);
    },
  },
}));

jest.mock('@/lib/firebase', () => ({
  isFirebaseConfigured: () => mockState?.configured ?? true,
}));

jest.mock('@react-native-firebase/firestore', () => {
  function docRef(path: string) {
    return {
      path,
      async delete() {
        mockState.deleted.push(path);
      },
      async set() {
        mockState.written.push(path);
      },
      async get() {
        return { exists: () => false, data: () => undefined };
      },
      collection: (name: string) => collectionRef(`${path}/${name}`),
    };
  }

  function collectionRef(path: string): Record<string, unknown> {
    const query = {
      where: () => query,
      limit: () => query,
      async get() {
        const rows = path.startsWith('duels')
          ? mockState.duels
          : path.startsWith('couples')
            ? mockState.couples
            : [];
        return {
          docs: rows.map((data, i) => ({
            id: `${path}-${i}`,
            data: () => data,
            ref: docRef(`${path}/${i}`),
          })),
        };
      },
    };
    return {
      ...query,
      doc: (id: string) => docRef(`${path}/${id}`),
      async add(payload: Record<string, unknown>) {
        if (mockState.reportThrows) throw new Error('permission denied');
        mockState.reports.push(payload);
        return { id: 'report-1' };
      },
    };
  }

  const fn = () => ({
    collection: (name: string) => collectionRef(name),
    batch: () => {
      const ops: (() => void)[] = [];
      return {
        set: (ref: { path: string }) => ops.push(() => mockState.written.push(ref.path)),
        delete: (ref: { path: string }) => ops.push(() => mockState.deleted.push(ref.path)),
        async commit() {
          for (const op of ops) op();
        },
      };
    },
  });
  (fn as unknown as { FieldValue: unknown }).FieldValue = {
    serverTimestamp: () => '<ts>',
  };
  return { __esModule: true, default: fn };
});

import {
  assertClientRateLimit,
  blockUser,
  commitClientRateLimit,
  createReport,
  takeClientRateLimit,
} from '../safetyService';

beforeEach(() => {
  mockState.configured = true;
  mockState.deleted = [];
  mockState.written = [];
  mockState.reports = [];
  mockState.reportThrows = false;
  mockState.duels = [];
  mockState.couples = [];
  mockStore.clear();
});

describe('client rate limits', () => {
  it('allows a first action and blocks once the cap is reached', () => {
    // coupleNudge allows 3 per hour.
    expect(() => assertClientRateLimit('coupleNudge', 'ada')).not.toThrow();
    for (let i = 0; i < 3; i++) commitClientRateLimit('coupleNudge', 'ada');
    expect(() => assertClientRateLimit('coupleNudge', 'ada')).toThrow(/slow down/i);
  });

  it('keeps each athlete on their own quota', () => {
    for (let i = 0; i < 3; i++) commitClientRateLimit('coupleNudge', 'ada');
    expect(() => assertClientRateLimit('coupleNudge', 'ada')).toThrow();
    // Bob has not nudged at all.
    expect(() => assertClientRateLimit('coupleNudge', 'bob')).not.toThrow();
  });

  it('scopes the per-target limit to that target', () => {
    // reportSameTarget allows 1 per day, keyed by the reported athlete.
    takeClientRateLimit('reportSameTarget', 'ada', 'bob');
    expect(() => assertClientRateLimit('reportSameTarget', 'ada', 'bob')).toThrow();
    // Reporting someone else is still allowed.
    expect(() => assertClientRateLimit('reportSameTarget', 'ada', 'cara')).not.toThrow();
  });

  it('asserting does not consume a slot on its own', () => {
    // The check/commit split exists so a gate can be tested before the side
    // effect it guards actually succeeds.
    for (let i = 0; i < 5; i++) assertClientRateLimit('coupleNudge', 'ada');
    expect(() => assertClientRateLimit('coupleNudge', 'ada')).not.toThrow();
  });
});

describe('createReport', () => {
  const base = {
    reporterUid: 'ada',
    targetUid: 'bob',
    reason: 'harassment' as never,
  };

  it('writes the report and truncates an overlong note', async () => {
    await createReport({ ...base, note: 'x'.repeat(5000) });

    expect(mockState.reports).toHaveLength(1);
    const note = mockState.reports[0]!.note as string;
    expect(note.length).toBeLessThan(5000);
  });

  it('refuses a self-report', async () => {
    await expect(createReport({ ...base, targetUid: 'ada' })).rejects.toThrow(/invalid/i);
  });

  it('refuses to report when there is no cloud connection', async () => {
    mockState.configured = false;
    await expect(createReport(base)).rejects.toThrow(/cloud/i);
  });

  it('does not burn the quota when the write is rejected', async () => {
    // The slot is only consumed after a successful write, so a rules denial
    // or a dropped connection must leave the athlete able to try again.
    mockState.reportThrows = true;
    await expect(createReport(base)).rejects.toThrow();

    mockState.reportThrows = false;
    await expect(createReport(base)).resolves.toBeUndefined();
    expect(mockState.reports).toHaveLength(1);
  });

  it('blocks a second report of the same athlete within the window', async () => {
    await createReport(base);
    await expect(createReport(base)).rejects.toThrow(/slow down/i);
  });
});

describe('blockUser', () => {
  it('records the block and drops the friend edge in one batch', async () => {
    await blockUser('ada', 'bob', 'Bob');

    expect(mockState.written).toContain('users/ada/blocks/bob');
    expect(mockState.deleted).toContain('users/ada/friends/bob');
  });

  it('refuses to block yourself', async () => {
    await expect(blockUser('ada', 'ada')).rejects.toThrow(/invalid/i);
  });

  it('no-ops when Firebase is not configured', async () => {
    mockState.configured = false;
    await blockUser('ada', 'bob');

    expect(mockState.written).toHaveLength(0);
    expect(mockState.deleted).toHaveLength(0);
  });

  it('cancels a pending duel the blocked athlete has not joined', async () => {
    mockState.duels = [{ hostUid: 'ada', targetUid: 'bob', status: 'pending', guestUid: null }];
    await blockUser('ada', 'bob');

    expect(mockState.deleted.some((p) => p.startsWith('duels/'))).toBe(true);
  });

  it('leaves an already-joined duel alone rather than attempting a rejected delete', async () => {
    // As the *target* the rules only permit deleting while the seat is open,
    // so attempting it once someone has joined is denied — and that rejection
    // used to land in a bare catch, making the block look successful.
    mockState.duels = [{ hostUid: 'bob', targetUid: 'ada', status: 'pending', guestUid: 'cara' }];
    await blockUser('ada', 'bob');

    expect(mockState.deleted.some((p) => p.startsWith('duels/'))).toBe(false);
  });
});

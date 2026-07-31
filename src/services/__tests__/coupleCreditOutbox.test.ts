/**
 * Couple credit outbox — durable enqueue + idempotent flush.
 */

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

jest.mock('@/services/coupleService', () => ({
  recordCoupleSession: jest.fn(async () => {}),
}));

import { recordCoupleSession } from '@/services/coupleService';
import {
  enqueueCoupleCredit,
  flushCoupleCreditOutbox,
  isCoupleCreditDone,
  promotePendingCoupleCredit,
  stashPendingCoupleCredit,
} from '../coupleCreditOutbox';

const mockRecord = recordCoupleSession as jest.MockedFunction<typeof recordCoupleSession>;

beforeEach(() => {
  mockStore.clear();
  mockRecord.mockReset();
  mockRecord.mockResolvedValue(undefined);
});

describe('coupleCreditOutbox', () => {
  it('flushes enqueued credits and marks them done', async () => {
    enqueueCoupleCredit({
      id: 'c1',
      coupleId: 'AB12CD',
      uid: 'ada',
      reps: 12,
      day: '2026-07-30',
    });
    await flushCoupleCreditOutbox();
    expect(mockRecord).toHaveBeenCalledWith('AB12CD', 'ada', 12, '2026-07-30', 'c1');
    expect(isCoupleCreditDone('c1')).toBe(true);

    await flushCoupleCreditOutbox();
    expect(mockRecord).toHaveBeenCalledTimes(1);
  });

  it('keeps items when the write fails', async () => {
    mockRecord.mockRejectedValueOnce(new Error('offline'));
    enqueueCoupleCredit({
      id: 'c2',
      coupleId: 'AB12CD',
      uid: 'ada',
      reps: 5,
      day: '2026-07-30',
    });
    await flushCoupleCreditOutbox();
    expect(isCoupleCreditDone('c2')).toBe(false);

    mockRecord.mockResolvedValueOnce(undefined);
    await flushCoupleCreditOutbox();
    expect(isCoupleCreditDone('c2')).toBe(true);
    expect(mockRecord).toHaveBeenCalledTimes(2);
  });

  it('ignores zero-rep and duplicate ids', () => {
    enqueueCoupleCredit({
      id: 'c3',
      coupleId: 'AB12CD',
      uid: 'ada',
      reps: 0,
      day: '2026-07-30',
    });
    enqueueCoupleCredit({
      id: 'c4',
      coupleId: 'AB12CD',
      uid: 'ada',
      reps: 8,
      day: '2026-07-30',
    });
    enqueueCoupleCredit({
      id: 'c4',
      coupleId: 'AB12CD',
      uid: 'ada',
      reps: 8,
      day: '2026-07-30',
    });
    expect(mockStore.get('coupleCreditOutbox.v1')).toContain('c4');
    expect(mockStore.get('coupleCreditOutbox.v1')).not.toContain('"reps":0');
  });

  it('does not replay a credit that already landed when the flush is killed midway', async () => {
    // Regression: `done` used to be persisted only after the whole loop, so a
    // process death partway through (backgrounded, OOM) lost every record of
    // what had already been written and the next flush re-credited those reps.
    for (const id of ['k1', 'k2', 'k3']) {
      enqueueCoupleCredit({
        id,
        coupleId: 'AB12CD',
        uid: 'ada',
        reps: 5,
        day: '2026-07-30',
      });
    }

    // k1 lands, k2 fails (offline / rules), k3 still gets its chance — one bad
    // credit must not block the rest of the queue.
    mockRecord.mockImplementationOnce(async () => {});
    mockRecord.mockImplementationOnce(async () => {
      throw new Error('write rejected');
    });

    await flushCoupleCreditOutbox();

    // Both survivors are recorded the moment they land, not at the end of the
    // loop — that is what makes a mid-flush kill safe.
    expect(isCoupleCreditDone('k1')).toBe(true);
    expect(isCoupleCreditDone('k3')).toBe(true);
    expect(isCoupleCreditDone('k2')).toBe(false);

    // Next launch retries only the one that failed; the applied credits must
    // never be sent again or the couple's reps double-count.
    mockRecord.mockReset();
    mockRecord.mockResolvedValue(undefined);
    await flushCoupleCreditOutbox();

    expect(mockRecord.mock.calls.map((c) => c[4])).toEqual(['k2']);
  });

  it('persists each credit as it lands, so a kill mid-flush loses nothing', async () => {
    // Regression for the original defect: `done` was written once *after* the
    // whole loop, so a process death partway through lost the record of every
    // credit already applied and the next flush replayed them.
    for (const id of ['p1', 'p2']) {
      enqueueCoupleCredit({
        id,
        coupleId: 'AB12CD',
        uid: 'ada',
        reps: 4,
        day: '2026-07-30',
      });
    }

    // Simulate the process dying immediately after the first credit lands.
    mockRecord.mockImplementationOnce(async () => {});
    mockRecord.mockImplementationOnce(async () => {
      throw new Error('process killed');
    });
    await flushCoupleCreditOutbox();

    // p1 must already be durable even though the flush never completed.
    expect(isCoupleCreditDone('p1')).toBe(true);
    expect(mockStore.get('coupleCreditOutbox.v1')).not.toContain('"p1"');
  });

  it('promotes a pending credit once the couple id is known', async () => {
    stashPendingCoupleCredit({
      uid: 'ada',
      reps: 9,
      day: '2026-07-30',
      startedAt: 1000,
    });
    const id = promotePendingCoupleCredit('AB12CD', 'ada');
    expect(id).toBe('AB12CD:ada:2026-07-30:9:1000');
    expect(mockStore.get('coupleCreditPending.v1')).toBeUndefined();
    await flushCoupleCreditOutbox();
    expect(mockRecord).toHaveBeenCalledWith(
      'AB12CD',
      'ada',
      9,
      '2026-07-30',
      'AB12CD:ada:2026-07-30:9:1000',
    );
  });
});

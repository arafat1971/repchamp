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

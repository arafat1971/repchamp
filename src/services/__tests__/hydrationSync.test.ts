/**
 * The sharing switches, at the point they have to hold: the publish calls.
 * The couple service is mocked; what is under test is whether it gets called.
 */

const mockRecordWater = jest.fn(async () => {});
const mockRecordSteps = jest.fn(async () => {});
const mockWithdraw = jest.fn(async () => {});
const mockLower = jest.fn(async () => {});
const mockNudge = jest.fn(async () => {});

const mockWidgetPush = jest.fn(async () => {});
jest.mock('@/services/coupleService', () => ({
  recordCoupleHydration: (...a: unknown[]) => mockRecordWater(...(a as [])),
  recordCoupleSteps: (...a: unknown[]) => mockRecordSteps(...(a as [])),
  withdrawCoupleDaily: (...a: unknown[]) => mockWithdraw(...(a as [])),
  lowerCoupleHydration: (...a: unknown[]) => mockLower(...(a as [])),
  nudgePartner: (...a: unknown[]) => mockNudge(...(a as [])),
  pushPartnerWaterWidget: (...a: unknown[]) => mockWidgetPush(...(a as [])),
}));

import {
  resetHydrationSyncMemo,
  setMetricSharing,
  shareDrink,
  syncHydrationNow,
  syncStepsNow,
} from '../hydrationSync';
import { useHydrationStore } from '@/state/hydrationStore';
import { useSharingStore } from '@/state/sharingStore';
import { dayKey } from '@/domain/progression';

// Drop the debounced widget push each test leaves behind.
afterEach(() => resetHydrationSyncMemo());

beforeEach(() => {
  jest.clearAllMocks();
  resetHydrationSyncMemo();
  useSharingStore.setState({ steps: true, water: true });
  useHydrationStore.setState({
    drinks: [{ id: 'd1', ml: 500, at: Date.now(), day: dayKey() }] as never,
  });
});

describe('publishing respects the switches', () => {
  it('publishes when shared', async () => {
    await syncHydrationNow('C1', 'ada');
    await syncStepsNow('C1', 'ada', 4000);
    expect(mockRecordWater).toHaveBeenCalledTimes(1);
    expect(mockRecordSteps).toHaveBeenCalledTimes(1);
  });

  it('publishes nothing that is switched off', async () => {
    useSharingStore.setState({ steps: false, water: false });
    await syncHydrationNow('C1', 'ada');
    await syncStepsNow('C1', 'ada', 4000);
    expect(mockRecordWater).not.toHaveBeenCalled();
    expect(mockRecordSteps).not.toHaveBeenCalled();
  });
});

describe('setMetricSharing', () => {
  it('withdraws today’s figure when turned off', async () => {
    await setMetricSharing('C1', 'ada', 'steps', false);
    expect(useSharingStore.getState().steps).toBe(false);
    expect(mockWithdraw).toHaveBeenCalledWith('C1', 'ada', 'steps');
  });

  it('maps water to its couple-doc field', async () => {
    await setMetricSharing('C1', 'ada', 'water', false);
    expect(mockWithdraw).toHaveBeenCalledWith('C1', 'ada', 'waterMl');
  });

  /* Without clearing the memo, re-enabling would be swallowed as "unchanged"
     and the partner would keep seeing "not shared" until the total moved. */
  it('republishes an unchanged water total when turned back on', async () => {
    await syncHydrationNow('C1', 'ada');
    await setMetricSharing('C1', 'ada', 'water', false);
    await setMetricSharing('C1', 'ada', 'water', true);
    expect(mockRecordWater).toHaveBeenCalledTimes(2);
  });

  it('flips the switch even with no bond', async () => {
    await setMetricSharing(null, null, 'water', false);
    expect(useSharingStore.getState().water).toBe(false);
    expect(mockWithdraw).not.toHaveBeenCalled();
  });
});

describe('undo reaches the partner', () => {
  const drink = (id: string, ml: number) => ({ id, ml, at: new Date().toISOString(), day: dayKey() });

  it('sends the undone amount as a subtraction', async () => {
    useHydrationStore.setState({ drinks: [drink('a', 500), drink('b', 250)] as never });
    await syncHydrationNow('C1', 'ada');
    expect(mockRecordWater).toHaveBeenLastCalledWith('C1', 'ada', dayKey(), 750, expect.anything());

    useHydrationStore.setState({ drinks: [drink('a', 500)] as never });
    await syncHydrationNow('C1', 'ada');
    expect(mockLower).toHaveBeenCalledWith('C1', 'ada', dayKey(), 250, expect.anything());
    expect(mockRecordWater).toHaveBeenCalledTimes(1);
  });

  /* Undoing the only drink of the day is exactly the case that must reach
     the partner — the zero guard must not swallow it. */
  it('takes the last drink of the day back too', async () => {
    useHydrationStore.setState({ drinks: [drink('a', 500)] as never });
    await syncHydrationNow('C1', 'ada');
    useHydrationStore.setState({ drinks: [] as never });
    await syncHydrationNow('C1', 'ada');
    expect(mockLower).toHaveBeenCalledWith('C1', 'ada', dayKey(), 500, expect.anything());
  });

  /* After a restart the memo is gone: the phone cannot tell an undo from a
     stale total, so it lowers nothing and the max holds. */
  it('never lowers without a publish of its own to measure from', async () => {
    useHydrationStore.setState({ drinks: [drink('a', 250)] as never });
    await syncHydrationNow('C1', 'ada');
    expect(mockLower).not.toHaveBeenCalled();
  });
});

describe('shareDrink', () => {
  const input = { coupleId: 'C1', uid: 'ada', senderName: 'Ada', ml: 250, beforeMl: 0, goalMl: 2000 };

  beforeEach(() => useSharingStore.setState({ water: true, drinkUpdates: true }));

  it('sends a regular update, with the drink, from the throttled bucket', async () => {
    await shareDrink({ ...input, kind: 'coffee' });
    expect(mockNudge).toHaveBeenCalledWith('C1', 'ada', 'Ada', 'drank', {
      ml: 250,
      drink: 'coffee',
      milestone: null,
      limit: 'waterShare',
    });
  });

  /* The old bug: a partner past the default 2 L never heard again. The
     partner no longer gates the send; milestones always go. */
  it('sends a milestone from its own bucket', async () => {
    await shareDrink({ ...input, beforeMl: 1750 });
    expect(mockNudge).toHaveBeenCalledWith('C1', 'ada', 'Ada', 'drank', {
      ml: 250,
      drink: undefined,
      milestone: 'goal',
      limit: 'waterMilestone',
    });
  });

  it('stays quiet when switched off or not sharing water', async () => {
    useSharingStore.setState({ drinkUpdates: false });
    await shareDrink(input);
    useSharingStore.setState({ drinkUpdates: true, water: false });
    await shareDrink(input);
    expect(mockNudge).not.toHaveBeenCalled();
  });

  /* Throttled or offline must never surface: this runs on every drink. */
  it('swallows a throttled send', async () => {
    mockNudge.mockRejectedValueOnce(new Error('rate limited'));
    await expect(shareDrink(input)).resolves.toBeUndefined();
  });
});

describe('goal and layers ride along', () => {
  const drink = (id: string, ml: number, kind?: string) => ({
    id,
    ml,
    kind,
    at: new Date(Date.now() + Number(id.slice(1)) * 1000).toISOString(),
    day: dayKey(),
  });

  it('publishes my goal and drink layers with the total', async () => {
    useHydrationStore.setState({ goalMl: 3000, drinks: [drink('d1', 500), drink('d2', 250, 'coffee')] as never });
    await syncHydrationNow('C1', 'ada');
    expect(mockRecordWater).toHaveBeenLastCalledWith('C1', 'ada', dayKey(), 750, {
      goalMl: 3000,
      layers: [
        { k: 'water', ml: 500 },
        { k: 'coffee', ml: 250 },
      ],
      last: { k: 'coffee', ml: 250, at: expect.any(Number) },
      rev: expect.any(Number),
    });
  });

  /* The version only orders copies; a sync with nothing new must not write
     just because the clock moved. */
  it('does not republish an unchanged state for a newer rev alone', async () => {
    useHydrationStore.setState({ goalMl: 2000, drinks: [drink('d1', 500)] as never });
    await syncHydrationNow('C1', 'ada');
    mockRecordWater.mockClear();
    await syncHydrationNow('C1', 'ada');
    expect(mockRecordWater).not.toHaveBeenCalled();
  });

  /* However fast + and − are tapped, the partner's phone hears at most one
     widget push every eight seconds, and it carries the newest state. */
  it('spaces widget pushes at least eight seconds apart', async () => {
    jest.useFakeTimers();
    try {
      mockWidgetPush.mockClear();
      useHydrationStore.setState({ goalMl: 2000, drinks: [drink('d1', 500)] as never });
      await syncHydrationNow('C1', 'ada');
      jest.advanceTimersByTime(2600);
      expect(mockWidgetPush).toHaveBeenCalledTimes(1);

      useHydrationStore.setState({ goalMl: 2000, drinks: [drink('d1', 500), drink('d2', 250)] as never });
      await syncHydrationNow('C1', 'ada');
      jest.advanceTimersByTime(2600);
      expect(mockWidgetPush).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(6000);
      expect(mockWidgetPush).toHaveBeenCalledTimes(2);
      const build = (mockWidgetPush.mock.calls[1] as unknown as [string, string, (me: { displayName: string }) => { amount: string; rev: number }])[2];
      expect(build({ displayName: 'Ada' }).amount).toBe('750 ml');
      expect(build({ displayName: 'Ada' }).rev).toBeGreaterThan(0);
    } finally {
      jest.useRealTimers();
    }
  });

  /* The partner's home-screen widget: one silent push per burst of taps,
     carrying the final state, built with my name as they see it. */
  it('sends one debounced widget push with the latest state', async () => {
    jest.useFakeTimers();
    try {
      mockWidgetPush.mockClear();
      useHydrationStore.setState({ goalMl: 2000, drinks: [drink('d1', 500)] as never });
      await syncHydrationNow('C1', 'ada');
      useHydrationStore.setState({ goalMl: 2000, drinks: [drink('d1', 500), drink('d2', 250, 'tea')] as never });
      await syncHydrationNow('C1', 'ada');
      expect(mockWidgetPush).not.toHaveBeenCalled();

      jest.advanceTimersByTime(3000);
      expect(mockWidgetPush).toHaveBeenCalledTimes(1);
      const [coupleId, uid, build] = mockWidgetPush.mock.calls[0] as unknown as [
        string,
        string,
        (me: { displayName: string }) => { title: string; amount: string; last: string },
      ];
      expect([coupleId, uid]).toEqual(['C1', 'ada']);
      expect(build({ displayName: 'Ada' })).toMatchObject({
        title: 'Ada’s water',
        amount: '750 ml',
        last: '🍵 Tea · 250 ml',
      });
    } finally {
      jest.useRealTimers();
    }
  });

  /* A goal step changes nothing about the total, but the partner's jar
     fills against it — so it must still go out. */
  it('republishes when only the goal changes', async () => {
    useHydrationStore.setState({ goalMl: 2000, drinks: [drink('d1', 500)] as never });
    await syncHydrationNow('C1', 'ada');
    useHydrationStore.setState({ goalMl: 2250 });
    await syncHydrationNow('C1', 'ada');
    expect(mockRecordWater).toHaveBeenCalledTimes(2);
  });
});

describe('concurrent syncs', () => {
  const drink = (id: string, ml: number) => ({ id, ml, at: new Date().toISOString(), day: dayKey() });

  /* Two undos in quick succession must lower by exactly what was undone. */
  it('lowers once per change when syncs overlap', async () => {
    useHydrationStore.setState({ drinks: [drink('a', 500), drink('b', 500), drink('c', 500)] as never });
    await syncHydrationNow('C1', 'ada');
    useHydrationStore.setState({ drinks: [drink('a', 500), drink('b', 500)] as never });
    const first = syncHydrationNow('C1', 'ada');
    useHydrationStore.setState({ drinks: [drink('a', 500)] as never });
    const second = syncHydrationNow('C1', 'ada');
    await Promise.all([first, second]);
    const lowered = mockLower.mock.calls.reduce((sum, c) => sum + (c as unknown as number[])[3]!, 0);
    expect(lowered).toBe(1000);
  });
});

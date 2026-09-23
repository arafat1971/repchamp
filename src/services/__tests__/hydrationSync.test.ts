/**
 * The sharing switches, at the point they have to hold: the publish calls.
 * The couple service is mocked; what is under test is whether it gets called.
 */

const mockRecordWater = jest.fn(async () => {});
const mockRecordSteps = jest.fn(async () => {});
const mockWithdraw = jest.fn(async () => {});
const mockLower = jest.fn(async () => {});

jest.mock('@/services/coupleService', () => ({
  recordCoupleHydration: (...a: unknown[]) => mockRecordWater(...(a as [])),
  recordCoupleSteps: (...a: unknown[]) => mockRecordSteps(...(a as [])),
  withdrawCoupleDaily: (...a: unknown[]) => mockWithdraw(...(a as [])),
  lowerCoupleHydration: (...a: unknown[]) => mockLower(...(a as [])),
}));

import {
  resetHydrationSyncMemo,
  setMetricSharing,
  syncHydrationNow,
  syncStepsNow,
} from '../hydrationSync';
import { useHydrationStore } from '@/state/hydrationStore';
import { useSharingStore } from '@/state/sharingStore';
import { dayKey } from '@/domain/progression';

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
    expect(mockRecordWater).toHaveBeenLastCalledWith('C1', 'ada', dayKey(), 750);

    useHydrationStore.setState({ drinks: [drink('a', 500)] as never });
    await syncHydrationNow('C1', 'ada');
    expect(mockLower).toHaveBeenCalledWith('C1', 'ada', dayKey(), 250);
    expect(mockRecordWater).toHaveBeenCalledTimes(1);
  });

  /* Undoing the only drink of the day is exactly the case that must reach
     the partner — the zero guard must not swallow it. */
  it('takes the last drink of the day back too', async () => {
    useHydrationStore.setState({ drinks: [drink('a', 500)] as never });
    await syncHydrationNow('C1', 'ada');
    useHydrationStore.setState({ drinks: [] as never });
    await syncHydrationNow('C1', 'ada');
    expect(mockLower).toHaveBeenCalledWith('C1', 'ada', dayKey(), 500);
  });

  /* After a restart the memo is gone: the phone cannot tell an undo from a
     stale total, so it lowers nothing and the max holds. */
  it('never lowers without a publish of its own to measure from', async () => {
    useHydrationStore.setState({ drinks: [drink('a', 250)] as never });
    await syncHydrationNow('C1', 'ada');
    expect(mockLower).not.toHaveBeenCalled();
  });
});

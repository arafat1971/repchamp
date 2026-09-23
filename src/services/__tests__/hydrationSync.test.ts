/**
 * The sharing switches, at the point they have to hold: the publish calls.
 * The couple service is mocked; what is under test is whether it gets called.
 */

const mockRecordWater = jest.fn(async () => {});
const mockRecordSteps = jest.fn(async () => {});
const mockWithdraw = jest.fn(async () => {});

jest.mock('@/services/coupleService', () => ({
  recordCoupleHydration: (...a: unknown[]) => mockRecordWater(...(a as [])),
  recordCoupleSteps: (...a: unknown[]) => mockRecordSteps(...(a as [])),
  withdrawCoupleDaily: (...a: unknown[]) => mockWithdraw(...(a as [])),
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

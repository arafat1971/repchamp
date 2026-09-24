const mockSet = jest.fn();

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  NativeModules: { PartnerWidget: { setSnapshot: (...a: unknown[]) => mockSet(...a), count: async () => 1 } },
}));

import { buildWaterWidgetSnapshot } from '@/domain/waterWidget';
import {
  clearWidgetSnapshot,
  publishWidgetSnapshot,
  resetWidgetPublishMemo,
} from '@/services/partnerWidget';

const snap = (ml: number, now: number) =>
  buildWaterWidgetSnapshot({ name: 'Bea', day: '2026-09-24', ml, rev: 10 }, now);

beforeEach(() => {
  mockSet.mockClear();
  resetWidgetPublishMemo();
});

describe('publishWidgetSnapshot', () => {
  /* Home re-renders on every couple-doc change; the widget redraws only
     when something it shows moved. */
  it('skips a payload identical but for its build time', () => {
    publishWidgetSnapshot(snap(500, 1), 'water');
    publishWidgetSnapshot(snap(500, 2), 'water');
    expect(mockSet).toHaveBeenCalledTimes(1);
    publishWidgetSnapshot(snap(750, 3), 'water');
    expect(mockSet).toHaveBeenCalledTimes(2);
  });

  it('keeps each widget’s memo separate', () => {
    publishWidgetSnapshot(snap(500, 1), 'water');
    clearWidgetSnapshot('partner');
    expect(mockSet).toHaveBeenCalledTimes(2);
  });

  it('clears once, then republishes when data returns', () => {
    publishWidgetSnapshot(snap(500, 1), 'water');
    clearWidgetSnapshot('water');
    clearWidgetSnapshot('water');
    expect(mockSet).toHaveBeenLastCalledWith('water', '');
    expect(mockSet).toHaveBeenCalledTimes(2);
    publishWidgetSnapshot(snap(500, 2), 'water');
    expect(mockSet).toHaveBeenCalledTimes(3);
  });
});

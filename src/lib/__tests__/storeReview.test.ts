const mockStore = new Map<string, string>();
const mockRequest = jest.fn().mockResolvedValue(undefined);
const mockAvailable = jest.fn().mockResolvedValue(true);

jest.mock('expo-store-review', () => ({
  isAvailableAsync: () => mockAvailable(),
  requestReview: () => mockRequest(),
}));
jest.mock('@/lib/storage', () => ({
  storage: {
    getString: (k: string) => mockStore.get(k),
    set: (k: string, v: string) => void mockStore.set(k, v),
  },
}));
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));

import { maybeRequestReview } from '@/lib/storeReview';

const moment = { sessionCount: 5, highlightTier: 'epic' as const, lostDuel: false, proMomentShown: false };
const NOW = Date.UTC(2026, 9, 9, 12);

beforeEach(() => {
  mockStore.clear();
  mockRequest.mockClear();
  mockAvailable.mockResolvedValue(true);
});

describe('maybeRequestReview', () => {
  it('asks once at a good moment and logs it', async () => {
    expect(await maybeRequestReview(moment, NOW)).toBe(true);
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mockStore.get('repchamp.review.asks')!)).toEqual([NOW]);
  });

  it('does not ask a second time inside the cooldown', async () => {
    await maybeRequestReview(moment, NOW);
    expect(await maybeRequestReview(moment, NOW + 86_400_000)).toBe(false);
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it('does not burn the cooldown when the sheet is unavailable', async () => {
    mockAvailable.mockResolvedValue(false);
    expect(await maybeRequestReview(moment, NOW)).toBe(false);
    expect(mockStore.has('repchamp.review.asks')).toBe(false);
  });

  it('never throws when the OS call fails', async () => {
    mockRequest.mockRejectedValueOnce(new Error('no play store'));
    await expect(maybeRequestReview(moment, NOW)).resolves.toBe(false);
  });

  it('does nothing for an ordinary set', async () => {
    expect(await maybeRequestReview({ ...moment, highlightTier: null }, NOW)).toBe(false);
    expect(mockRequest).not.toHaveBeenCalled();
  });
});

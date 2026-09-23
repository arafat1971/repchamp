/**
 * The store's own behaviour: what a tap records, what it refuses, and what
 * survives a restart.
 *
 * MMKV is mocked with a real in-memory Map rather than a set of no-ops, the
 * pattern `coupleCreditOutbox.test.ts` uses, so the persistence claim is
 * actually exercised instead of asserted against a stub that always succeeds.
 */

import { DRINK_LOG_LIMIT, MAX_DAILY_ML, MAX_DRINK_ML } from '@/domain/hydration';
import { dayKey } from '@/domain/progression';

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
  zustandStorage: {
    getItem: (k: string) => mockStore.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mockStore.set(k, v);
    },
    removeItem: (k: string) => {
      mockStore.delete(k);
    },
  },
}));

import {
  useHydrationStore,
  selectTodayDrinks,
  selectTodayMl,
  selectTodayProgress,
} from '../hydrationStore';

const TODAY = dayKey();

beforeEach(() => {
  mockStore.clear();
  useHydrationStore.getState().reset();
});

describe('logging a drink', () => {
  it('records it against today and hands back the entry', () => {
    const entry = useHydrationStore.getState().logDrink(250);
    expect(entry).not.toBeNull();
    expect(entry?.ml).toBe(250);
    expect(entry?.day).toBe(TODAY);
    expect(selectTodayMl(useHydrationStore.getState())).toBe(250);
  });

  it('adds up across several taps', () => {
    const { logDrink } = useHydrationStore.getState();
    logDrink(250);
    logDrink(500);
    expect(selectTodayMl(useHydrationStore.getState())).toBe(750);
  });

  it('keeps the newest entry first', () => {
    const { logDrink } = useHydrationStore.getState();
    logDrink(250);
    const second = logDrink(500);
    expect(selectTodayDrinks(useHydrationStore.getState())[0]?.id).toBe(second?.id);
  });

  /* A refused tap must leave no trace — returning null while still recording
     something would be the worst of both. */
  it('records nothing and returns null when the amount is refused', () => {
    const entry = useHydrationStore.getState().logDrink(0);
    expect(entry).toBeNull();
    expect(useHydrationStore.getState().drinks).toHaveLength(0);
  });

  it('refuses a single drink beyond the per-tap ceiling', () => {
    expect(useHydrationStore.getState().logDrink(MAX_DRINK_ML + 1)).toBeNull();
    expect(useHydrationStore.getState().drinks).toHaveLength(0);
  });

  it('refuses a tap that would cross the daily ceiling, and logs none of it', () => {
    const { logDrink } = useHydrationStore.getState();
    for (let i = 0; i < MAX_DAILY_ML / MAX_DRINK_ML; i += 1) logDrink(MAX_DRINK_ML);
    const atCeiling = selectTodayMl(useHydrationStore.getState());
    expect(atCeiling).toBe(MAX_DAILY_ML);

    expect(logDrink(250)).toBeNull();
    expect(selectTodayMl(useHydrationStore.getState())).toBe(atCeiling);
  });

  it('caps the log so it cannot grow without bound', () => {
    const { logDrink } = useHydrationStore.getState();
    // One past the cap, small enough that the daily ceiling is not the limit.
    for (let i = 0; i < DRINK_LOG_LIMIT + 1; i += 1) logDrink(1);
    expect(useHydrationStore.getState().drinks).toHaveLength(DRINK_LOG_LIMIT);
  });
});

describe('undo', () => {
  it('removes the newest entry and leaves the earlier one', () => {
    const { logDrink, undoLast } = useHydrationStore.getState();
    const first = logDrink(250);
    logDrink(500);

    undoLast();

    const remaining = selectTodayDrinks(useHydrationStore.getState());
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe(first?.id);
    expect(selectTodayMl(useHydrationStore.getState())).toBe(250);
  });

  it('is a no-op on a day with nothing logged', () => {
    useHydrationStore.getState().undoLast();
    expect(useHydrationStore.getState().drinks).toHaveLength(0);
  });

  it('removes only the entry asked for', () => {
    const { logDrink, undoDrink } = useHydrationStore.getState();
    const first = logDrink(250);
    const second = logDrink(500);

    undoDrink(first!.id);

    const remaining = selectTodayDrinks(useHydrationStore.getState());
    expect(remaining.map((d) => d.id)).toEqual([second?.id]);
  });

  /* Undo removes rather than logging a negative, so a day can never sum to
     less than nothing however many times it is pressed. */
  it('cannot drive a day below zero', () => {
    const { logDrink, undoLast } = useHydrationStore.getState();
    logDrink(250);
    undoLast();
    undoLast();
    expect(selectTodayMl(useHydrationStore.getState())).toBe(0);
  });
});

describe('the goal', () => {
  it('is clamped when set outside the allowed band', () => {
    useHydrationStore.getState().setGoalMl(99_999);
    expect(useHydrationStore.getState().goalMl).toBe(6000);

    useHydrationStore.getState().setGoalMl(10);
    expect(useHydrationStore.getState().goalMl).toBe(500);
  });

  it('measures today against the goal that was set', () => {
    const { logDrink, setGoalMl } = useHydrationStore.getState();
    setGoalMl(1000);
    logDrink(500);
    expect(selectTodayProgress(useHydrationStore.getState()).percent).toBe(50);
  });
});

describe('reset', () => {
  it('clears the log and restores the default goal', () => {
    const { logDrink, setGoalMl } = useHydrationStore.getState();
    logDrink(250);
    setGoalMl(3000);

    useHydrationStore.getState().reset();

    expect(useHydrationStore.getState().drinks).toHaveLength(0);
    expect(useHydrationStore.getState().goalMl).toBe(2000);
  });
});

describe('persistence', () => {
  it('writes the log through to storage', async () => {
    useHydrationStore.getState().logDrink(250);
    await Promise.resolve();

    const raw = mockStore.get('repchamp.hydration');
    expect(raw).toBeDefined();
    expect(JSON.parse(raw!).state.drinks).toHaveLength(1);
  });

  it('keeps the goal across a rehydrate', async () => {
    useHydrationStore.getState().setGoalMl(3000);
    await Promise.resolve();

    await useHydrationStore.persist.rehydrate();

    expect(useHydrationStore.getState().goalMl).toBe(3000);
    expect(JSON.parse(mockStore.get('repchamp.hydration')!).state.goalMl).toBe(3000);
  });
});

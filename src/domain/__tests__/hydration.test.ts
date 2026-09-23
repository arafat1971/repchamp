import {
  DEFAULT_DAILY_GOAL_ML,
  MAX_DAILY_GOAL_ML,
  MAX_DRINK_ML,
  MIN_DAILY_GOAL_ML,
  type DrinkEntry,
  daysGoalMet,
  drinksOnDay,
  formatMl,
  hydrationHistory,
  hydrationProgress,
  isFreshFor,
  makeDrinkEntry,
  mlOnDay,
  sanitizeDrinkMl,
  sanitizeGoalMl,
  stepGoalMl,
} from '../hydration';

const TODAY = '2026-09-23';
const YESTERDAY = '2026-09-22';

function drink(day: string, ml: number, id = `${day}-${ml}`): DrinkEntry {
  return { id, ml, at: `${day}T09:00:00.000Z`, day };
}

describe('a day’s intake', () => {
  it('counts a glass logged today', () => {
    expect(mlOnDay([drink(TODAY, 250)], TODAY)).toBe(250);
  });

  it('does not count yesterday’s glasses toward today', () => {
    expect(mlOnDay([drink(YESTERDAY, 750)], TODAY)).toBe(0);
  });

  it('sums several drinks on the same day', () => {
    const log = [drink(TODAY, 250, 'a'), drink(TODAY, 500, 'b'), drink(YESTERDAY, 900, 'c')];
    expect(mlOnDay(log, TODAY)).toBe(750);
  });

  it('reports zero for a day with nothing logged', () => {
    expect(mlOnDay([], TODAY)).toBe(0);
  });

  it('returns only that day’s entries', () => {
    const log = [drink(TODAY, 250, 'a'), drink(YESTERDAY, 500, 'b')];
    expect(drinksOnDay(log, TODAY).map((d) => d.id)).toEqual(['a']);
  });
});

describe('what counts as a drink', () => {
  it('accepts an ordinary glass', () => {
    expect(sanitizeDrinkMl(250)).toBe(250);
  });

  it('rejects zero and negative amounts', () => {
    expect(sanitizeDrinkMl(0)).toBe(0);
    expect(sanitizeDrinkMl(-250)).toBe(0);
  });

  it('rejects a single drink beyond the per-tap ceiling', () => {
    expect(sanitizeDrinkMl(MAX_DRINK_ML)).toBe(MAX_DRINK_ML);
    expect(sanitizeDrinkMl(MAX_DRINK_ML + 1)).toBe(0);
  });

  /* Rejected rather than clamped down: clamping would log water the athlete
     never drank, which is worse than recording nothing. */
  it('rejects rather than clamps an implausible amount', () => {
    expect(sanitizeDrinkMl(99_999)).toBe(0);
  });

  it('rejects a garbage amount', () => {
    expect(sanitizeDrinkMl(Number.NaN)).toBe(0);
    expect(sanitizeDrinkMl(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('the goal', () => {
  it('clamps a goal below the minimum up', () => {
    expect(sanitizeGoalMl(100)).toBe(MIN_DAILY_GOAL_ML);
  });

  it('clamps a goal above the maximum down', () => {
    expect(sanitizeGoalMl(99_999)).toBe(MAX_DAILY_GOAL_ML);
  });

  it('falls back to the default for a garbage goal', () => {
    expect(sanitizeGoalMl(Number.NaN)).toBe(DEFAULT_DAILY_GOAL_ML);
  });

  it('steps a quarter-litre at a time', () => {
    expect(stepGoalMl(2000, 1)).toBe(2250);
    expect(stepGoalMl(2000, -1)).toBe(1750);
  });

  it('does not step past either end of the band', () => {
    expect(stepGoalMl(MIN_DAILY_GOAL_ML, -1)).toBe(MIN_DAILY_GOAL_ML);
    expect(stepGoalMl(MAX_DAILY_GOAL_ML, 1)).toBe(MAX_DAILY_GOAL_ML);
  });
});

describe('progress toward the goal', () => {
  it('is zero on a day with nothing logged', () => {
    const p = hydrationProgress([], 2000, TODAY);
    expect(p).toMatchObject({ ml: 0, percent: 0, remainingMl: 2000, met: false });
  });

  it('reports the fraction drunk so far', () => {
    const p = hydrationProgress([drink(TODAY, 500)], 2000, TODAY);
    expect(p.percent).toBe(25);
    expect(p.remainingMl).toBe(1500);
  });

  /* The boundary is the whole point of a goal — meeting it exactly must
     count, not fall one millilitre short. */
  it('is met exactly at the target', () => {
    expect(hydrationProgress([drink(TODAY, 2000)], 2000, TODAY).met).toBe(true);
    expect(hydrationProgress([drink(TODAY, 1999)], 2000, TODAY).met).toBe(false);
  });

  it('never reports more than a full bar once the goal is passed', () => {
    const p = hydrationProgress([drink(TODAY, 5000)], 2000, TODAY);
    expect(p.percent).toBe(100);
    expect(p.ml).toBe(5000);
  });

  it('never reports a negative remainder', () => {
    expect(hydrationProgress([drink(TODAY, 5000)], 2000, TODAY).remainingMl).toBe(0);
  });

  it('measures against a sane goal even when handed a garbage one', () => {
    expect(hydrationProgress([], Number.NaN, TODAY).goalMl).toBe(DEFAULT_DAILY_GOAL_ML);
  });
});

describe('history', () => {
  it('returns one entry per day, oldest first', () => {
    const days = hydrationHistory([], TODAY, 3).map((d) => d.day);
    expect(days).toEqual(['2026-09-21', YESTERDAY, TODAY]);
  });

  /* A gap has to be visible as a gap; omitting empty days would draw a
     sparkline that silently closes over them. */
  it('includes days with nothing logged rather than omitting them', () => {
    const log = [drink(TODAY, 500)];
    expect(hydrationHistory(log, TODAY, 3)).toEqual([
      { day: '2026-09-21', ml: 0 },
      { day: YESTERDAY, ml: 0 },
      { day: TODAY, ml: 500 },
    ]);
  });

  it('is empty when no days are asked for', () => {
    expect(hydrationHistory([], TODAY, 0)).toEqual([]);
  });

  it('counts only the days that reached the goal', () => {
    const log = [drink(TODAY, 2000, 'a'), drink(YESTERDAY, 1000, 'b')];
    expect(daysGoalMet(log, 2000, TODAY, 3)).toBe(1);
  });
});

describe('formatting an amount', () => {
  it('uses millilitres below a litre', () => {
    expect(formatMl(500)).toBe('500 ml');
    expect(formatMl(999)).toBe('999 ml');
  });

  it('uses litres from a litre up', () => {
    expect(formatMl(1000)).toBe('1 L');
    expect(formatMl(1750)).toBe('1.75 L');
  });

  it('drops trailing zeroes rather than writing 2.00 L', () => {
    expect(formatMl(2000)).toBe('2 L');
  });

  it('renders an empty day as zero rather than blank', () => {
    expect(formatMl(0)).toBe('0 ml');
  });
});

describe('freshness of a synced day', () => {
  it('accepts today’s day key', () => {
    expect(isFreshFor(TODAY, TODAY)).toBe(true);
  });

  /* The whole reason the partner's day is carried alongside their total: a
     phone that last synced yesterday must not have it read as today. */
  it('rejects yesterday’s', () => {
    expect(isFreshFor(YESTERDAY, TODAY)).toBe(false);
  });

  it('rejects a missing or malformed day', () => {
    expect(isFreshFor(null, TODAY)).toBe(false);
    expect(isFreshFor(undefined, TODAY)).toBe(false);
    expect(isFreshFor('', TODAY)).toBe(false);
  });
});

describe('minting an entry', () => {
  it('stamps the day it was logged', () => {
    const entry = makeDrinkEntry(250, new Date(2026, 8, 23, 9, 30));
    expect(entry.day).toBe(TODAY);
    expect(entry.ml).toBe(250);
  });

  it('gives each entry its own id', () => {
    const at = new Date(2026, 8, 23, 9, 30);
    expect(makeDrinkEntry(250, at).id).not.toBe(makeDrinkEntry(250, at).id);
  });
});

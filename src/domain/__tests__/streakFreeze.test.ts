import { calculateStreak } from '../progression';
import { streakOutcome } from '../retention';
import {
  daysToNextFreeze,
  earnsFreeze,
  mergeFrozenDays,
  planStreakFreezes,
  shiftDay,
} from '../streakFreeze';

/** Consecutive day keys ending at `last`, oldest first. */
function run(last: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => shiftDay(last, i - n + 1));
}

describe('shiftDay', () => {
  it('crosses month and year boundaries', () => {
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('calculateStreak with frozen days', () => {
  it('two missed days break a streak without a freeze', () => {
    const trained = run('2026-10-20', 5);
    expect(calculateStreak(trained, '2026-10-23')).toBe(0);
  });

  it('a frozen day keeps it alive and adds nothing', () => {
    const trained = run('2026-10-20', 5);
    expect(calculateStreak(trained, '2026-10-23', ['2026-10-22'])).toBe(5);
    expect(calculateStreak([...trained, '2026-10-23'], '2026-10-23', ['2026-10-22'])).toBe(6);
  });

  it('streakOutcome reads a frozen save as continued, not broken', () => {
    const trained = run('2026-10-20', 5);
    expect(streakOutcome(trained, '2026-10-23').kind).toBe('broken');
    expect(streakOutcome(trained, '2026-10-23', ['2026-10-22'])).toEqual({
      kind: 'continued',
      length: 6,
      previous: 5,
    });
  });
});

describe('planStreakFreezes', () => {
  const trained = run('2026-10-20', 5);

  it('spends nothing on a single rest day', () => {
    expect(planStreakFreezes({ trainedDays: trained, frozenDays: [], banked: 2, today: '2026-10-22' }).freeze).toEqual([]);
  });

  it('freezes the second missed day, keeping the first as the rest day', () => {
    expect(planStreakFreezes({ trainedDays: trained, frozenDays: [], banked: 1, today: '2026-10-23' }).freeze).toEqual([
      '2026-10-22',
    ]);
  });

  it('spends nothing when the bank cannot save the streak', () => {
    // Three missed days need two freezes.
    expect(planStreakFreezes({ trainedDays: trained, frozenDays: [], banked: 1, today: '2026-10-24' }).freeze).toEqual([]);
    expect(planStreakFreezes({ trainedDays: trained, frozenDays: [], banked: 2, today: '2026-10-24' }).freeze).toEqual([
      '2026-10-22',
      '2026-10-23',
    ]);
  });

  it('builds incrementally on days already frozen', () => {
    expect(
      planStreakFreezes({ trainedDays: trained, frozenDays: ['2026-10-22'], banked: 1, today: '2026-10-24' }).freeze,
    ).toEqual(['2026-10-23']);
  });

  it('is idempotent once a gap is covered', () => {
    expect(
      planStreakFreezes({ trainedDays: trained, frozenDays: ['2026-10-22'], banked: 2, today: '2026-10-23' }).freeze,
    ).toEqual([]);
  });

  it('ignores today and an empty bank or history', () => {
    expect(planStreakFreezes({ trainedDays: [], frozenDays: [], banked: 2, today: '2026-10-23' }).freeze).toEqual([]);
    expect(planStreakFreezes({ trainedDays: trained, frozenDays: [], banked: 0, today: '2026-10-23' }).freeze).toEqual([]);
    expect(
      planStreakFreezes({ trainedDays: ['2026-10-23'], frozenDays: [], banked: 2, today: '2026-10-23' }).freeze,
    ).toEqual([]);
  });

  it('always leaves the streak alive when it spends', () => {
    const today = '2026-10-24';
    const { freeze } = planStreakFreezes({ trainedDays: trained, frozenDays: [], banked: 2, today });
    expect(calculateStreak(trained, today, freeze)).toBe(5);
  });
});

describe('earning', () => {
  it('pays once per 7-day milestone', () => {
    expect(earnsFreeze(6, 7)).toBe(true);
    expect(earnsFreeze(13, 14)).toBe(true);
    expect(earnsFreeze(7, 7)).toBe(false);
    expect(earnsFreeze(7, 8)).toBe(false);
    expect(earnsFreeze(0, 1)).toBe(false);
  });

  it('counts down to the next freeze', () => {
    expect(daysToNextFreeze(0)).toBe(7);
    expect(daysToNextFreeze(5)).toBe(2);
    expect(daysToNextFreeze(7)).toBe(7);
  });

  it('merges frozen days sorted and unique', () => {
    expect(mergeFrozenDays(['2026-10-05', '2026-10-01'], ['2026-10-01', '2026-10-03'])).toEqual([
      '2026-10-01',
      '2026-10-03',
      '2026-10-05',
    ]);
  });
});

describe('Pro freeze cap', () => {
  const { bankAfterEarning, freezeCap, MAX_STREAK_FREEZES, MAX_STREAK_FREEZES_PRO } = jest.requireActual(
    '../streakFreeze',
  ) as typeof import('../streakFreeze');

  it('Pro holds more than free', () => {
    expect(freezeCap(false)).toBe(MAX_STREAK_FREEZES);
    expect(freezeCap(true)).toBe(MAX_STREAK_FREEZES_PRO);
    expect(MAX_STREAK_FREEZES_PRO).toBeGreaterThan(MAX_STREAK_FREEZES);
  });

  it('earning respects the cap and never takes freezes back', () => {
    expect(bankAfterEarning(1, 2)).toBe(2);
    expect(bankAfterEarning(2, 2)).toBe(2);
    expect(bankAfterEarning(2, 3)).toBe(3);
    // A lapsed Pro with 3 keeps them.
    expect(bankAfterEarning(3, 2)).toBe(3);
  });
});

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

describe('skipTodayOutcome', () => {
  const { skipTodayOutcome } = jest.requireActual('../streakFreeze') as typeof import('../streakFreeze');
  const trained = run('2026-10-20', 5);

  it('is safe when only the rest day would be used', () => {
    expect(skipTodayOutcome({ trainedDays: trained, frozenDays: [], banked: 0, today: '2026-10-21' })).toBe('safe');
  });

  it('spends a freeze when the rest day is gone and one is banked', () => {
    expect(skipTodayOutcome({ trainedDays: trained, frozenDays: [], banked: 1, today: '2026-10-22' })).toBe('freeze');
  });

  it('is lost when the rest day is gone and nothing is banked', () => {
    expect(skipTodayOutcome({ trainedDays: trained, frozenDays: [], banked: 0, today: '2026-10-22' })).toBe('lost');
  });

  it('is none when today is trained or there is no streak', () => {
    expect(skipTodayOutcome({ trainedDays: trained, frozenDays: [], banked: 2, today: '2026-10-20' })).toBe('none');
    expect(skipTodayOutcome({ trainedDays: [], frozenDays: [], banked: 2, today: '2026-10-20' })).toBe('none');
  });
});

describe('freezePanelCopy', () => {
  const { freezePanelCopy } = jest.requireActual('../streakFreeze') as typeof import('../streakFreeze');

  it('names the count and the next milestone', () => {
    expect(freezePanelCopy({ banked: 1, streak: 5, isPro: false })).toEqual({
      title: '1 freeze banked',
      body: 'A freeze covers a missed day after your rest day, so the streak survives. Next one in 2 days of training in a row.',
    });
    expect(freezePanelCopy({ banked: 0, streak: 6, isPro: false }).body).toMatch(/Next one in 1 day of/);
    expect(freezePanelCopy({ banked: 0, streak: 0, isPro: false }).title).toBe('No freezes banked');
  });

  it('says the bank is full at the cap, which is higher for Pro', () => {
    expect(freezePanelCopy({ banked: 2, streak: 3, isPro: false }).body).toMatch(/full/);
    expect(freezePanelCopy({ banked: 2, streak: 3, isPro: true }).body).toMatch(/Next one/);
    expect(freezePanelCopy({ banked: 3, streak: 3, isPro: true }).body).toMatch(/full/);
  });
});

describe('streakRepairOffer', () => {
  const { streakRepairOffer, REPAIR_COOLDOWN_DAYS } = jest.requireActual(
    '../streakFreeze',
  ) as typeof import('../streakFreeze');
  const trained = run('2026-10-20', 12);

  it('offers a repair for a fresh break', () => {
    // Missed 21, 22: the rest day and one more, so the streak is gone.
    expect(streakRepairOffer({ trainedDays: trained, frozenDays: [], today: '2026-10-23', lastRepairDay: null })).toEqual({
      lostStreak: 12,
      lastTrained: '2026-10-20',
      freeze: ['2026-10-22'],
    });
  });

  it('a repair brings the streak back', () => {
    const offer = streakRepairOffer({ trainedDays: trained, frozenDays: [], today: '2026-10-24', lastRepairDay: null })!;
    expect(calculateStreak(trained, '2026-10-24')).toBe(0);
    expect(calculateStreak(trained, '2026-10-24', offer.freeze)).toBe(12);
    // Train today after repairing and the run continues.
    expect(calculateStreak([...trained, '2026-10-24'], '2026-10-24', offer.freeze)).toBe(13);
  });

  it('still offers after a set today restarted the streak', () => {
    const offer = streakRepairOffer({
      trainedDays: [...trained, '2026-10-23'],
      frozenDays: [],
      today: '2026-10-23',
      lastRepairDay: null,
    });
    expect(offer?.lostStreak).toBe(12);
  });

  it('offers nothing when nothing broke', () => {
    expect(streakRepairOffer({ trainedDays: trained, frozenDays: [], today: '2026-10-22', lastRepairDay: null })).toBeNull();
    // A freeze already covered it.
    expect(
      streakRepairOffer({ trainedDays: trained, frozenDays: ['2026-10-22'], today: '2026-10-23', lastRepairDay: null }),
    ).toBeNull();
  });

  it('offers nothing for an old break, a short streak, or inside the cooldown', () => {
    expect(streakRepairOffer({ trainedDays: trained, frozenDays: [], today: '2026-10-26', lastRepairDay: null })).toBeNull();
    expect(
      streakRepairOffer({ trainedDays: run('2026-10-20', 2), frozenDays: [], today: '2026-10-23', lastRepairDay: null }),
    ).toBeNull();
    expect(
      streakRepairOffer({ trainedDays: trained, frozenDays: [], today: '2026-10-23', lastRepairDay: '2026-10-01' }),
    ).toBeNull();
    expect(
      streakRepairOffer({
        trainedDays: trained,
        frozenDays: [],
        today: '2026-10-23',
        lastRepairDay: shiftDay('2026-10-23', -REPAIR_COOLDOWN_DAYS),
      }),
    ).not.toBeNull();
  });
});

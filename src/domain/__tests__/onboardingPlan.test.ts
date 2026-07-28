import {
  blockerAnswer,
  firstWeekPlan,
  firstWeekTarget,
  goalPlan,
  leagueForWeeklyXp,
  levelMultiplier,
  projectProgress,
  weeksToNextLeague,
} from '../onboardingPlan';

describe('projectProgress', () => {
  it('accumulates XP week over week at the chosen frequency', () => {
    const weeks = projectProgress(4, 3);
    expect(weeks).toHaveLength(3);
    expect(weeks[0]!.xp).toBeGreaterThan(0);
    expect(weeks[1]!.xp).toBeGreaterThan(weeks[0]!.xp);
    expect(weeks[2]!.xp).toBeGreaterThan(weeks[1]!.xp);
  });

  it('grows faster for someone training more days', () => {
    const light = projectProgress(2, 4);
    const heavy = projectProgress(6, 4);
    expect(heavy[3]!.xp).toBeGreaterThan(light[3]!.xp);
  });

  it('numbers each week from 1', () => {
    expect(projectProgress(3, 3).map((w) => w.week)).toEqual([1, 2, 3]);
  });

  it('treats a zero frequency as no progress rather than throwing', () => {
    const weeks = projectProgress(0, 2);
    expect(weeks[0]!.xp).toBe(0);
    expect(weeks[1]!.xp).toBe(0);
  });
});

describe('leagueForWeeklyXp', () => {
  it('starts everyone in Bronze', () => {
    expect(leagueForWeeklyXp(0).name).toBe('Bronze');
  });

  it('promotes at each real league threshold', () => {
    expect(leagueForWeeklyXp(800).name).toBe('Silver');
    expect(leagueForWeeklyXp(2500).name).toBe('Gold');
    expect(leagueForWeeklyXp(5000).name).toBe('Platinum');
  });

  it('picks the highest tier the rate satisfies', () => {
    expect(leagueForWeeklyXp(9999).name).toBe('Platinum');
  });
});

describe('weeksToNextLeague', () => {
  it('names the next tier up for a modest frequency', () => {
    const next = weeksToNextLeague(2);
    expect(next).not.toBeNull();
    expect(next!.league).toBe('Silver');
    expect(next!.weeks).toBeGreaterThanOrEqual(1);
  });

  it('returns null once already at the top tier', () => {
    // A very high frequency saturates the top league.
    expect(weeksToNextLeague(1000)).toBeNull();
  });
});

describe('goalPlan', () => {
  it('tailors copy to each goal', () => {
    expect(goalPlan('strength').title).toMatch(/strength/i);
    expect(goalPlan('form').title).toMatch(/form/i);
    expect(goalPlan('compete').title).toMatch(/compete/i);
  });

  it('falls back to rep counting for an unknown or missing goal', () => {
    expect(goalPlan(null).focus).toMatch(/rep/i);
    expect(goalPlan('nonsense').focus).toMatch(/rep/i);
  });
});

describe('firstWeekPlan', () => {
  it('always lays out a full seven-day week', () => {
    expect(firstWeekPlan(4)).toHaveLength(7);
    expect(firstWeekPlan(1)).toHaveLength(7);
    expect(firstWeekPlan(7)).toHaveLength(7);
  });

  it('schedules exactly the requested number of training days', () => {
    for (const days of [1, 2, 3, 4, 5, 6, 7]) {
      const training = firstWeekPlan(days).filter((d) => !d.rest);
      expect(training).toHaveLength(days);
    }
  });

  it('sums the training days to the promised weekly target', () => {
    for (const days of [2, 3, 4, 5, 6]) {
      const plan = firstWeekPlan(days);
      const total = plan.reduce((acc, d) => acc + d.target, 0);
      expect(total).toBe(firstWeekTarget(days));
    }
  });

  it('ramps up across the week rather than repeating a flat average', () => {
    const training = firstWeekPlan(4).filter((d) => !d.rest);
    expect(training[training.length - 1]!.target).toBeGreaterThan(training[0]!.target);
  });

  it('never schedules a zero or negative target on a training day', () => {
    for (const days of [1, 3, 7]) {
      for (const day of firstWeekPlan(days).filter((d) => !d.rest)) {
        expect(day.target).toBeGreaterThan(0);
      }
    }
  });

  it('marks exactly one day as the first session', () => {
    const firsts = firstWeekPlan(5).filter((d) => d.first);
    expect(firsts).toHaveLength(1);
    expect(firsts[0]!.rest).toBe(false);
  });

  it('handles a 7-day week with no rest days', () => {
    expect(firstWeekPlan(7).every((d) => !d.rest)).toBe(true);
  });
});

describe('levelMultiplier', () => {
  it('asks less of a complete beginner and more of a regular', () => {
    expect(levelMultiplier('new')).toBeLessThan(1);
    expect(levelMultiplier('regular')).toBeGreaterThan(1);
    expect(levelMultiplier('returning')).toBe(1);
  });

  it('defaults to the middle when unanswered', () => {
    expect(levelMultiplier(null)).toBe(1);
  });
});

describe('blockerAnswer', () => {
  it('answers each blocker with a distinct feature', () => {
    const titles = (['motivation', 'consistency', 'form', 'time'] as const).map(
      (b) => blockerAnswer(b).title,
    );
    expect(new Set(titles).size).toBe(4);
  });

  it('falls back to the streak answer when unanswered', () => {
    expect(blockerAnswer(null).title).toMatch(/streak/i);
  });
});

describe('firstWeekTarget with level', () => {
  it('scales the target to the self-reported level', () => {
    const beginner = firstWeekTarget(4, 'new');
    const returning = firstWeekTarget(4, 'returning');
    const regular = firstWeekTarget(4, 'regular');
    expect(beginner).toBeLessThan(returning);
    expect(regular).toBeGreaterThan(returning);
  });

  it('never drops to a target that cannot be trained', () => {
    expect(firstWeekTarget(1, 'new')).toBeGreaterThanOrEqual(10);
  });

  it('keeps the week plan consistent with the levelled target', () => {
    for (const level of ['new', 'returning', 'regular'] as const) {
      const plan = firstWeekPlan(4, level);
      const total = plan.reduce((acc, d) => acc + d.target, 0);
      expect(total).toBe(firstWeekTarget(4, level));
    }
  });
});

describe('firstWeekTarget', () => {
  it('scales with training frequency', () => {
    expect(firstWeekTarget(5)).toBeGreaterThan(firstWeekTarget(2));
  });

  it('never sets a demoralisingly small target', () => {
    expect(firstWeekTarget(0)).toBeGreaterThanOrEqual(25);
  });
});

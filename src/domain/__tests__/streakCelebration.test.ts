import { celebrationCopy, milestoneToCelebrate, nextMilestoneAfter } from '../streakCelebration';

describe('milestoneToCelebrate', () => {
  it('celebrates a milestone streak', () => {
    expect(milestoneToCelebrate({ streak: 7, today: '2026-10-26', last: null })).toBe(7);
  });

  it('ignores streaks between milestones', () => {
    expect(milestoneToCelebrate({ streak: 8, today: '2026-10-26', last: null })).toBeNull();
    expect(milestoneToCelebrate({ streak: 0, today: '2026-10-26', last: null })).toBeNull();
  });

  it('shows each milestone once per run', () => {
    const last = { streak: 7, day: '2026-10-26' };
    // A second set the same day.
    expect(milestoneToCelebrate({ streak: 7, today: '2026-10-26', last })).toBeNull();
    // The next milestone still shows.
    expect(milestoneToCelebrate({ streak: 14, today: '2026-11-02', last })).toBe(14);
  });

  it('shows a milestone again after the streak broke and was rebuilt', () => {
    const last = { streak: 7, day: '2026-10-01' };
    expect(milestoneToCelebrate({ streak: 7, today: '2026-10-26', last })).toBe(7);
  });
});

describe('nextMilestoneAfter', () => {
  it('names the next goal and stops after the last', () => {
    expect(nextMilestoneAfter(7)).toBe(14);
    expect(nextMilestoneAfter(365)).toBeNull();
  });
});

describe('celebrationCopy', () => {
  it('leads with the number and makes no invented claims', () => {
    const c = celebrationCopy(7);
    expect(c.title).toBe('7-day streak!');
    expect(c.line).not.toMatch(/top \d|%/);
    expect(c.share).toContain('7 days in a row');
  });
});

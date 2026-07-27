import {
  WEEKLY_CHALLENGES,
  currentWeeklyChallenge,
  daysLeftInWeek,
  isoWeekNumber,
  weeklyChallengeProgress,
} from '@/domain/weeklyChallenge';

describe('currentWeeklyChallenge', () => {
  it('picks deterministically from the ISO week — same week, same challenge', () => {
    const d = new Date('2026-07-15T12:00:00Z');
    expect(currentWeeklyChallenge(d).id).toBe(currentWeeklyChallenge(d).id);
    const idx = isoWeekNumber(d) % WEEKLY_CHALLENGES.length;
    expect(currentWeeklyChallenge(d)).toBe(WEEKLY_CHALLENGES[idx]);
  });

  it('rotates as the week changes', () => {
    // Two dates a few weeks apart should differ if the pool has >1 entry.
    const a = currentWeeklyChallenge(new Date('2026-07-06T12:00:00Z'));
    const b = currentWeeklyChallenge(new Date('2026-07-13T12:00:00Z'));
    expect(a.id).not.toBe(b.id);
  });
});

describe('daysLeftInWeek', () => {
  it('is 7 on Monday and 1 on Sunday', () => {
    // 2026-07-13 is a Monday, 2026-07-19 is a Sunday.
    expect(daysLeftInWeek(new Date(2026, 6, 13))).toBe(7);
    expect(daysLeftInWeek(new Date(2026, 6, 19))).toBe(1);
  });
});

describe('weeklyChallengeProgress', () => {
  const date = new Date('2026-07-15T12:00:00Z');
  const def = currentWeeklyChallenge(date);
  const week = new Set(['2026-07-13', '2026-07-14', '2026-07-15']);

  it('sums only this-week reps of the challenge exercise', () => {
    const sessions = [
      { day: '2026-07-14', exercise: def.exercise, reps: 40 },
      { day: '2026-07-15', exercise: def.exercise, reps: 30 },
      { day: '2026-07-15', exercise: def.exercise === 'push' ? 'squat' : 'push', reps: 99 }, // wrong exercise
      { day: '2026-07-06', exercise: def.exercise, reps: 99 }, // last week
    ] as const;
    const p = weeklyChallengeProgress(sessions, week, date);
    expect(p.reps).toBe(70);
    expect(p.complete).toBe(false);
    expect(p.percent).toBeCloseTo(70 / def.target);
  });

  it('marks complete once the target is banked, capping percent at 1', () => {
    const sessions = [{ day: '2026-07-15', exercise: def.exercise, reps: def.target + 50 }] as const;
    const p = weeklyChallengeProgress(sessions, week, date);
    expect(p.complete).toBe(true);
    expect(p.percent).toBe(1);
  });
});

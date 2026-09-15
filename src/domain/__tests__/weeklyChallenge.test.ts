import {
  WEEKLY_CHALLENGES,
  currentWeekDayKeys,
  currentWeeklyChallenge,
  daysLeftInWeek,
  isoWeekKey,
  isoWeekNumber,
  weeklyChallengeProgress,
} from '@/domain/weeklyChallenge';

describe('currentWeekDayKeys', () => {
  it('is the seven Mon–Sun days of the containing week', () => {
    // 2026-07-15 is a Wednesday; its ISO week runs Mon 13th – Sun 19th.
    const keys = currentWeekDayKeys(new Date(2026, 6, 15));
    expect([...keys].sort()).toEqual([
      '2026-07-13',
      '2026-07-14',
      '2026-07-15',
      '2026-07-16',
      '2026-07-17',
      '2026-07-18',
      '2026-07-19',
    ]);
  });

  /* The whole point of deriving this from `isoWeekKey` rather than walking back
     to Monday by hand: membership here and membership in `selectWeekSessions`
     are now the same question, so they cannot answer it differently. */
  it('agrees with isoWeekKey for every day it returns', () => {
    for (let offset = 0; offset < 400; offset++) {
      const base = new Date(2026, 0, 1 + offset);
      const week = isoWeekKey(base);
      const keys = currentWeekDayKeys(base);
      expect(keys.size).toBe(7);
      for (const key of keys) {
        const [y, m, d] = key.split('-').map(Number);
        expect(isoWeekKey(new Date(y as number, (m as number) - 1, d as number))).toBe(week);
      }
    }
  });

  it('holds every day of the week to the same set', () => {
    // Mon 13th and Sun 19th must describe the same seven days.
    const fromMonday = [...currentWeekDayKeys(new Date(2026, 6, 13))].sort();
    const fromSunday = [...currentWeekDayKeys(new Date(2026, 6, 19))].sort();
    expect(fromMonday).toEqual(fromSunday);
  });

  it('crosses a year boundary without splitting the week', () => {
    // 2026-12-31 is a Thursday: its ISO week spills into January 2027.
    const keys = currentWeekDayKeys(new Date(2026, 11, 31));
    expect(keys.size).toBe(7);
    expect(keys.has('2026-12-28')).toBe(true);
    expect(keys.has('2027-01-03')).toBe(true);
  });
});

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

describe('isoWeekKey', () => {
  it('matches the leaderboard week-key shape', () => {
    expect(isoWeekKey(new Date(Date.UTC(2026, 6, 26)))).toBe('2026-W30');
  });

  it('keeps Mon–Sun of the same ISO week on one key', () => {
    // 2026-07-13 Mon … 2026-07-19 Sun
    expect(isoWeekKey(new Date(2026, 6, 13))).toBe(isoWeekKey(new Date(2026, 6, 19)));
    expect(isoWeekKey(new Date(2026, 6, 13))).not.toBe(isoWeekKey(new Date(2026, 6, 20)));
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

describe('one instant, one week', () => {
  /* The card used to read `new Date()` twice inside a memo keyed on `[sessions]`
     alone: frozen at mount, and able to straddle midnight between the two reads.
     Both call sites now take an explicit instant, so these assert the property
     that makes the injected clock worth having — everything derived from one
     moment describes one week. */
  it('pairs the day-set and the challenge from the same instant', () => {
    // Sun 2026-07-19 23:59 and Mon 2026-07-20 00:01 are different ISO weeks.
    const sunday = new Date(2026, 6, 19, 23, 59);
    const monday = new Date(2026, 6, 20, 0, 1);

    expect(isoWeekKey(sunday)).not.toBe(isoWeekKey(monday));
    expect(currentWeeklyChallenge(sunday)).not.toEqual(currentWeeklyChallenge(monday));

    // Each instant's day-set contains its own day, and not the other's.
    expect(currentWeekDayKeys(sunday).has('2026-07-19')).toBe(true);
    expect(currentWeekDayKeys(sunday).has('2026-07-20')).toBe(false);
    expect(currentWeekDayKeys(monday).has('2026-07-20')).toBe(true);
    expect(currentWeekDayKeys(monday).has('2026-07-19')).toBe(false);
  });

  /* A session logged Monday must not count toward Sunday's challenge, which is
     exactly what a stale day-set paired with a fresh definition would allow. */
  it('counts only the reps belonging to the instant it is given', () => {
    const sessions = [
      { day: '2026-07-19', exercise: 'push' as const, reps: 30 },
      { day: '2026-07-20', exercise: 'push' as const, reps: 40 },
    ];
    const sunday = new Date(2026, 6, 19, 23, 59);
    const monday = new Date(2026, 6, 20, 0, 1);

    const onSunday = weeklyChallengeProgress(sessions, currentWeekDayKeys(sunday), sunday);
    const onMonday = weeklyChallengeProgress(sessions, currentWeekDayKeys(monday), monday);

    // Whichever week's challenge is push-ups sees only that week's reps.
    if (onSunday.def.exercise === 'push') expect(onSunday.reps).toBe(30);
    if (onMonday.def.exercise === 'push') expect(onMonday.reps).toBe(40);
    expect(onSunday.reps).not.toBe(onMonday.reps);
  });

  /* The countdown must come from the same instant as the rest of the card. */
  it('counts down from the instant it is given', () => {
    expect(weeklyChallengeProgress([], currentWeekDayKeys(new Date(2026, 6, 20)), new Date(2026, 6, 20)).daysLeft).toBe(7);
    expect(weeklyChallengeProgress([], currentWeekDayKeys(new Date(2026, 6, 19)), new Date(2026, 6, 19)).daysLeft).toBe(1);
  });
});

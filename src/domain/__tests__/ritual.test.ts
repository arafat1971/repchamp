import {
  DEFAULT_PLAN,
  HABITS,
  cleanPlan,
  effectivePlan,
  guideFor,
  isGuided,
  windDownDue,
  planHabits,
  POKE_FRESH_MS,
  WALK_GOAL,
  buildRitualReminder,
  cleanPoke,
  cleanTicks,
  isHere,
  isNewPoke,
  journey,
  lastDays,
  ritualFor,
  ritualLine,
  ritualScore,
  toggleTick,
  trendLine,
  withRitualDay,
  ritualWeek,
} from '@/domain/ritual';

const side = (over: Partial<Parameters<typeof ritualFor>[0]> = {}) => ({
  ml: 0,
  goalMl: 2000,
  steps: 0,
  reps: 0,
  ticks: [],
  ...over,
});

const byId = (states: ReturnType<typeof ritualFor>, id: string) => states.find((s) => s.habit.id === id)!;

describe('ritualFor', () => {
  it('counts water, walking and exercise from what the app already knows', () => {
    const s = ritualFor(side({ ml: 2000, steps: WALK_GOAL, reps: 12 }));
    expect(byId(s, 'water').done).toBe(true);
    expect(byId(s, 'walk').done).toBe(true);
    expect(byId(s, 'move').done).toBe(true);
    expect(ritualScore(s)).toBe(3);
  });

  it('fills the counted habits part way before they are done', () => {
    const s = ritualFor(side({ ml: 500, steps: 2000 }));
    expect(byId(s, 'water').progress).toBeCloseTo(0.25);
    expect(byId(s, 'walk').progress).toBeCloseTo(0.25);
    expect(ritualScore(s)).toBe(0);
  });

  it('lets a walk be ticked where the phone cannot count steps', () => {
    expect(byId(ritualFor(side({ steps: null })), 'walk')).toMatchObject({ done: false, tickable: true });
    expect(byId(ritualFor(side({ steps: null, ticks: ['walk'] })), 'walk').done).toBe(true);
  });

  it('never counts unshared water as a miss it can show', () => {
    expect(byId(ritualFor(side({ ml: null })), 'water')).toMatchObject({ done: false, unknown: true, tickable: false });
  });

  it('takes the hand-ticked habits from ticks only', () => {
    const s = ritualFor(side({ ticks: ['stretch', 'greens'] }));
    expect(byId(s, 'stretch').done).toBe(true);
    expect(byId(s, 'greens').done).toBe(true);
    expect(byId(s, 'rest').done).toBe(false);
    expect(byId(s, 'move').tickable).toBe(false);
  });
});

describe('ticks', () => {
  it('keeps only known habits, once each', () => {
    expect(cleanTicks(['stretch', 'stretch', 'nap', 3, 'rest'])).toEqual(['stretch', 'rest']);
    expect(cleanTicks('stretch')).toEqual([]);
  });

  it('toggles', () => {
    expect(toggleTick(['stretch'], 'rest')).toEqual(['stretch', 'rest']);
    expect(toggleTick(['stretch', 'rest'], 'stretch')).toEqual(['rest']);
  });
});

describe('ritualLine', () => {
  const total = HABITS.length;
  it('celebrates a perfect day', () => {
    expect(ritualLine(total, total, 'Sam')).toBe('A perfect day, together.');
  });
  it('says where the two of you stand, plainly', () => {
    expect(ritualLine(3, 1, 'Sam')).toBe("You're ahead, 3 to 1. 3 to go.");
    expect(ritualLine(1, 3, 'Sam')).toBe('Sam is ahead, 3 to 1. 5 to go.');
    expect(ritualLine(2, 2, 'Sam')).toBe('Level at 2 each. 4 to go.');
    expect(ritualLine(0, 0, 'Sam')).toBe('Nothing ticked yet today.');
  });
  it('points the finished side at the other', () => {
    expect(ritualLine(total, 4, 'Sam')).toBe("You're done. 2 left for Sam.");
  });
});

describe('live together', () => {
  const now = 1_000_000_000;
  it('counts a recent heartbeat as here', () => {
    expect(isHere(now - 20_000, now)).toBe(true);
    expect(isHere(now - 120_000, now)).toBe(false);
    expect(isHere(null, now)).toBe(false);
  });

  it('accepts only known pokes', () => {
    expect(cleanPoke({ e: '❤️', at: 5 })).toEqual({ e: '❤️', at: 5 });
    expect(cleanPoke({ e: '💣', at: 5 })).toBeNull();
    expect(cleanPoke({ e: '❤️' })).toBeNull();
  });

  it('shows each poke once, and only while fresh', () => {
    expect(isNewPoke({ at: now - 1000 }, 0, now)).toBe(true);
    expect(isNewPoke({ at: now - 1000 }, now - 1000, now)).toBe(false);
    expect(isNewPoke({ at: now - POKE_FRESH_MS - 1 }, 0, now)).toBe(false);
  });
});

describe('buildRitualReminder', () => {
  const states = (done: string[]) =>
    ritualFor({ ml: 0, goalMl: 2000, steps: null, reps: 0, ticks: [] }).map((s) => ({ ...s, done: done.includes(s.habit.id) }));
  const all = HABITS.map((h) => h.id);

  it('stays quiet when the ritual is done', () => {
    expect(buildRitualReminder({ mine: states(all), theirs: { name: 'Sam', score: 2 } })).toBeNull();
  });

  it('names what is left, with the partner as company', () => {
    expect(buildRitualReminder({ mine: states(['water', 'walk', 'move', 'greens']), theirs: { name: 'Sam', score: 3 } })).toEqual({
      title: '4/6 today — 2 to go',
      body: 'Still time for stretch and wind down. Sam is at 3/6 💞',
    });
  });

  it('makes the last one feel close', () => {
    expect(buildRitualReminder({ mine: states(all.filter((h) => h !== 'rest')), theirs: null })).toEqual({
      title: 'One more for a perfect day ✨',
      body: 'Just wind down.',
    });
  });

  it('leads with a partner who finished', () => {
    expect(buildRitualReminder({ mine: states(['water']), theirs: { name: 'Sam', score: 6 } })?.title).toBe('Sam finished the ritual 🏆');
  });
});

describe('better, week on week', () => {
  it('keeps each day as last seen, an unknown side as last known, and forgets old days', () => {
    let h = withRitualDay({}, '2026-09-25', { me: 3, them: 2 });
    h = withRitualDay(h, '2026-09-25', { me: 2, them: -1 });
    expect(h['2026-09-25']).toEqual({ me: 2, them: 2 });
    const many = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`2026-09-0${i + 1}`, { me: 1, them: 1 }]));
    expect(Object.keys(withRitualDay(many, '2026-09-25', { me: 1, them: 1 }, 3))).toEqual(['2026-09-04', '2026-09-05', '2026-09-25']);
  });

  it('lists the last seven days, today last, and counts perfect ones', () => {
    const w = ritualWeek({ '2026-09-25': { me: 6, them: 6 }, '2026-09-24': { me: 6, them: 5 } }, '2026-09-25');
    expect(w.days).toHaveLength(7);
    expect(w.days[6]).toMatchObject({ day: '2026-09-25', perfect: true });
    expect(w.days[0]!.day).toBe('2026-09-19');
    expect(w.perfectDays).toBe(1);
  });

  it('only claims a trend with enough days on both sides', () => {
    const h: Record<string, { me: number; them: number }> = {};
    for (const d of lastDays('2026-09-25', 14).slice(0, 7)) h[d] = { me: 2, them: 2 };
    expect(ritualWeek(h, '2026-09-25').trend).toBeNull();
    for (const d of lastDays('2026-09-25', 3)) h[d] = { me: 4, them: 3 };
    expect(ritualWeek(h, '2026-09-25').trend).toEqual({ now: 4, before: 2 });
  });

  it('words the trend plainly', () => {
    expect(trendLine({ now: 4, before: 2.5 })).toBe('Up 1.5 habits a day on last week.');
    expect(trendLine({ now: 3, before: 3.1 })).toBe('Steady at 3 a day.');
    expect(trendLine({ now: 2, before: 3 })).toBe('Down 1 a day on last week.');
    expect(trendLine(null)).toBe('Your trend shows after a few days.');
  });
});

describe('the couple plan', () => {
  it('accepts three distinct catalog habits and a listed walk goal', () => {
    expect(cleanPlan({ picks: ['sleep', 'read', 'thanks'], walkGoal: 10000, at: 5 })).toEqual({ picks: ['sleep', 'read', 'thanks'], walkGoal: 10000, at: 5 });
    expect(cleanPlan({ picks: ['sleep', 'sleep', 'read'], walkGoal: 8000 })).toBeNull();
    expect(cleanPlan({ picks: ['water', 'read', 'thanks'], walkGoal: 8000 })).toBeNull();
    expect(cleanPlan({ picks: ['sleep', 'read', 'thanks'], walkGoal: 7777 })).toBeNull();
    expect(cleanPlan('nope')).toBeNull();
  });

  it('follows whichever of us chose last, else the default', () => {
    const a = { picks: ['sleep', 'read', 'thanks'], walkGoal: 5000, at: 10 };
    const b = { picks: ['stretch', 'breathe', 'outside'], walkGoal: 10000, at: 20 };
    expect(effectivePlan(a, b).walkGoal).toBe(10000);
    expect(effectivePlan(a, null).picks).toEqual(['sleep', 'read', 'thanks']);
    expect(effectivePlan(undefined, 'junk')).toEqual(DEFAULT_PLAN);
  });

  it('makes six habits: the counted three, then the chosen three', () => {
    const habits = planHabits({ picks: ['sleep', 'read', 'thanks'], walkGoal: 5000, at: 1 });
    expect(habits.map((h) => h.id)).toEqual(['water', 'walk', 'move', 'sleep', 'read', 'thanks']);
    expect(habits[1]!.hint).toBe('5,000 steps or a 20 min walk');
  });

  it('counts the walk against the chosen goal', () => {
    const plan = { picks: ['sleep', 'read', 'thanks'] as const, walkGoal: 5000, at: 1 };
    const s = ritualFor({ ml: 0, goalMl: 2000, steps: 5000, reps: 0, ticks: ['sleep'] }, { ...plan, picks: [...plan.picks] });
    expect(s.find((x) => x.habit.id === 'walk')!.done).toBe(true);
    expect(s.find((x) => x.habit.id === 'sleep')!.done).toBe(true);
  });
});

describe('journey', () => {
  const today = '2026-09-25';
  it('lays out thirty days with both scores added', () => {
    const j = journey({ [today]: { me: 4, them: 3 } }, today);
    expect(j.days).toHaveLength(30);
    expect(j.days[29]).toEqual({ day: today, together: 7 });
    expect(j.since).toBe(today);
    expect(j.tracked).toBe(1);
  });

  it('counts perfect days across everything recorded', () => {
    const j = journey({ '2026-08-01': { me: 6, them: 6 }, [today]: { me: 6, them: 6 }, '2026-09-24': { me: 6, them: 5 } }, today);
    expect(j.perfectDays).toBe(2);
  });

  it('only reports a change with a first and a latest week that do not overlap', () => {
    const h: Record<string, { me: number; them: number }> = {};
    lastDays(today, 9).forEach((d) => (h[d] = { me: 2, them: 2 }));
    expect(journey(h, today).change).toBeNull();
    lastDays(today, 14).forEach((d, i) => (h[d] = { me: i < 7 ? 2 : 4, them: 3 }));
    expect(journey(h, today).change).toEqual({ from: 2, to: 4 });
  });
});

describe('guided habits', () => {
  it('guides breathe for five minutes and wind down for three', () => {
    expect(guideFor('breathe').minutes).toBe(5);
    expect(guideFor('rest').minutes).toBe(3);
    expect(isGuided('rest')).toBe(true);
    expect(isGuided('stretch')).toBe(false);
  });

  it('offers winding down only in the evening, and only while it is open', () => {
    const open = ritualFor({ ml: 0, goalMl: 2000, steps: 0, reps: 0, ticks: [] });
    const done = ritualFor({ ml: 0, goalMl: 2000, steps: 0, reps: 0, ticks: ['rest'] });
    expect(windDownDue(open, 20)).toBe(false);
    expect(windDownDue(open, 21.5)).toBe(true);
    expect(windDownDue(done, 22)).toBe(false);
  });
});

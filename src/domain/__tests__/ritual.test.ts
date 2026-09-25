import {
  HABITS,
  POKE_FRESH_MS,
  WALK_GOAL,
  cleanPoke,
  cleanTicks,
  isHere,
  isNewPoke,
  ritualFor,
  ritualLine,
  ritualScore,
  toggleTick,
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
    expect(ritualLine(total, total, 'Sam')).toBe('A perfect day, together 🏆');
  });
  it('turns a lead into the next step', () => {
    expect(ritualLine(3, 1, 'Sam')).toBe('You lead 3–1. 3 more for your perfect day');
    expect(ritualLine(1, 3, 'Sam')).toBe("Sam leads 3–1. 5 more and you're level");
    expect(ritualLine(2, 2, 'Sam')).toBe('Level at 2 each — who takes the next one?');
    expect(ritualLine(0, 0, 'Sam')).toBe('A fresh day. First tick wins the morning ☀️');
  });
  it('points the finished side at the other', () => {
    expect(ritualLine(total, 4, 'Sam')).toBe("You're done — 2 left for Sam. Cheer them on 💦");
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

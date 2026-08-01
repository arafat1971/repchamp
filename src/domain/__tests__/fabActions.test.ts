import { buildFabModel, type FabInput } from '@/domain/fabActions';
import type { SessionSummary } from '@/state/profileStore';
import type { ExerciseId } from '@/vision/exercises';

const TODAY = '2026-08-01';
const CANDIDATES: ExerciseId[] = ['push', 'squat', 'situp', 'lunge'];

function session(day: string, exercise: ExerciseId): SessionSummary {
  return {
    id: `${day}-${exercise}`,
    exercise,
    mode: 'practice',
    reps: 10,
    opponentReps: null,
    opponentId: null,
    target: null,
    won: false,
    xp: 40,
    formScore: 80,
    durationSec: 60,
    completedAt: `${day}T09:00:00.000Z`,
    day,
  } as SessionSummary;
}

function build(over: Partial<FabInput> = {}) {
  return buildFabModel({
    sessions: [],
    today: TODAY,
    isPro: true,
    candidates: CANDIDATES,
    pendingDuels: 0,
    daily: { exercise: 'push', done: true },
    ...over,
  });
}

describe('buildFabModel — ordering', () => {
  it('keeps the authored order when there is nothing to go on', () => {
    expect(build().order.map((r) => r.exercise)).toEqual(CANDIDATES);
  });

  it('floats the movement the athlete actually does', () => {
    const m = build({
      sessions: [
        session('2026-07-30', 'squat'),
        session('2026-07-29', 'squat'),
        session('2026-07-28', 'situp'),
      ],
    });
    expect(m.order[0]?.exercise).toBe('squat');
  });

  it('sinks anything already trained today, however favoured', () => {
    const m = build({
      sessions: [
        // Squats are the clear habit *and* already done today.
        session('2026-07-30', 'squat'),
        session('2026-07-29', 'squat'),
        session(TODAY, 'squat'),
      ],
    });
    expect(m.order[m.order.length - 1]?.exercise).toBe('squat');
    expect(m.order[0]?.doneToday).toBe(false);
  });

  it('sinks locked rows below usable ones for a free athlete', () => {
    const m = build({ isPro: false });
    const lockedFrom = m.order.findIndex((r) => r.locked);
    const usable = m.order.filter((r) => !r.locked);
    // Every unlocked row appears before the first locked one.
    expect(lockedFrom).toBe(usable.length);
  });

  it('ignores sessions older than the recent window', () => {
    const m = build({ sessions: [session('2026-07-01', 'lunge')] });
    expect(m.order.find((r) => r.exercise === 'lunge')?.recentCount).toBe(0);
    expect(m.order.map((r) => r.exercise)).toEqual(CANDIDATES);
  });
});

describe('buildFabModel — primary action', () => {
  it('answers a waiting duel before anything else', () => {
    const m = build({
      pendingDuels: 2,
      daily: { exercise: 'push', done: false },
      sessions: [session('2026-07-30', 'squat')],
    });
    expect(m.primary).toEqual({ kind: 'duel' });
  });

  it('offers the daily challenge while it is unclaimed', () => {
    const m = build({ daily: { exercise: 'push', done: false } });
    expect(m.primary).toEqual({ kind: 'daily', exercise: 'push' });
  });

  it('does not offer a daily the athlete cannot start', () => {
    const m = build({ isPro: false, daily: { exercise: 'lunge', done: false } });
    expect(m.primary?.kind).not.toBe('daily');
  });

  it('offers the habitual movement once the daily is cleared', () => {
    const m = build({
      sessions: [session('2026-07-30', 'squat'), session('2026-07-29', 'squat')],
    });
    expect(m.primary).toEqual({ kind: 'exercise', exercise: 'squat' });
  });

  /*
   * The conservative cases. A button that does something different every time
   * is worse than one that reliably opens a menu, so each of these must fall
   * through to `null` rather than guess.
   */
  it('opens the menu for a brand-new athlete', () => {
    expect(build().primary).toBeNull();
  });

  it('opens the menu when two movements are equally favoured', () => {
    const m = build({
      sessions: [session('2026-07-30', 'push'), session('2026-07-29', 'squat')],
    });
    expect(m.primary).toBeNull();
  });

  it('opens the menu when the top pick is already done today', () => {
    const m = build({
      sessions: [
        session('2026-07-30', 'squat'),
        session('2026-07-29', 'squat'),
        session(TODAY, 'squat'),
      ],
    });
    // Squats sank; nothing else has history, so there is no clear next pick.
    expect(m.primary).toBeNull();
  });
});

describe('buildFabModel — badge', () => {
  it('counts pending duels and an unclaimed daily', () => {
    expect(build({ pendingDuels: 3, daily: { exercise: 'push', done: false } }).badgeCount).toBe(4);
  });

  it('is zero when nothing is waiting', () => {
    expect(build().badgeCount).toBe(0);
  });
});

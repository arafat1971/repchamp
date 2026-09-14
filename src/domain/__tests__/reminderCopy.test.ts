import {
  STREAK_WORTH_NAMING,
  buildDailyReminder,
  buildWeeklyRecap,
} from '@/domain/reminderCopy';
import type { SessionSummary } from '@/state/profileStore';

/** Minimal record — only the fields the copy actually reads carry meaning. */
const session = (o: Partial<SessionSummary> = {}): SessionSummary => ({
  id: 'x',
  exercise: 'push',
  mode: 'practice',
  reps: 10,
  opponentReps: null,
  opponentId: null,
  target: null,
  won: false,
  xp: 10,
  formScore: 80,
  durationSec: 30,
  completedAt: '2026-09-01T10:00:00.000Z',
  day: '2026-09-01',
  ...o,
});

describe('buildDailyReminder', () => {
  /* The whole point of the change: the athlete with most to lose is the one
     who was previously told the least. */
  it('names the streak once it is worth protecting', () => {
    const c = buildDailyReminder({ streak: 12 });
    expect(c.title).toBe('Day 12 — keep it going');
    expect(c.body).toBe('One set today and the streak holds.');
  });

  /* Title, not body: on a collapsed Android shade the body is what truncates,
     so a streak mentioned only there is a streak not mentioned. */
  it('puts the number in the title, which survives a collapsed shade', () => {
    expect(buildDailyReminder({ streak: 30 }).title).toContain('30');
  });

  it('falls back to the generic line below the threshold', () => {
    const c = buildDailyReminder({ streak: STREAK_WORTH_NAMING - 1 });
    expect(c.title).toBe('Time for a quick set');
    expect(c.body).toBe('Two minutes of reps keeps your streak and form sharp.');
  });

  /* A lapsed athlete does not need reminding that they lapsed, and "Day 1 —
     keep it going" is a demand made of someone who has done one set. */
  it('says nothing about a streak of zero', () => {
    expect(buildDailyReminder({ streak: 0 }).title).toBe('Time for a quick set');
    expect(buildDailyReminder({ streak: 0 }).body).not.toContain('0');
  });

  it('starts naming the streak exactly at the threshold, not before', () => {
    expect(buildDailyReminder({ streak: STREAK_WORTH_NAMING }).title).toContain(
      String(STREAK_WORTH_NAMING),
    );
    expect(buildDailyReminder({ streak: STREAK_WORTH_NAMING - 1 }).title).toBe(
      'Time for a quick set',
    );
  });

  /* The streak arrives from a selector, not a literal — a NaN or a fractional
     day count must not reach the shade as "Day NaN". */
  it('survives a non-finite or fractional streak', () => {
    expect(buildDailyReminder({ streak: Number.NaN }).title).toBe('Time for a quick set');
    expect(buildDailyReminder({ streak: 7.9 }).title).toBe('Day 7 — keep it going');
  });

  it('is tuned to name streaks from 3 days up', () => {
    expect(STREAK_WORTH_NAMING).toBe(3);
  });
});

describe('buildWeeklyRecap', () => {
  /* The recap's job is to carry a fact. "See what you got done" is an
     invitation to go and look, which is what it replaced. */
  it('carries a real claim when there is one', () => {
    const sessions = [
      session({ id: 'a', reps: 4, completedAt: '2026-09-01T10:00:00.000Z' }),
      session({ id: 'b', reps: 5, completedAt: '2026-09-02T10:00:00.000Z' }),
      session({ id: 'c', reps: 11, completedAt: '2026-09-03T10:00:00.000Z' }),
      session({ id: 'd', reps: 12, completedAt: '2026-09-04T10:00:00.000Z' }),
    ];
    expect(buildWeeklyRecap({ sessions, streak: 4 }).body).toBe(
      'Your best set has gone from 5 to 12 reps',
    );
  });

  /* `headlineProof` returns null rather than inventing a milestone, and this
     must not paper over that — a recap claiming progress that did not happen
     teaches the athlete to discount every future one. */
  it('falls back to the generic line rather than inventing progress', () => {
    expect(buildWeeklyRecap({ sessions: [], streak: 0 }).body).toBe(
      'See what you got done — and celebrate the wins.',
    );
  });

  it('keeps a stable title so the slot stays recognisable', () => {
    expect(buildWeeklyRecap({ sessions: [], streak: 0 }).title).toBe('Your week in reps');
    expect(buildWeeklyRecap({ sessions: [session()], streak: 9 }).title).toBe('Your week in reps');
  });

  /* Streak is a real input to `headlineProof`, so it must be threaded through
     rather than dropped — this is the claim a consistent athlete earns. */
  it('can report the streak when that is the strongest true thing', () => {
    expect(buildWeeklyRecap({ sessions: [session()], streak: 6 }).body).toBe(
      '6 days in a row — that is the hard part done',
    );
  });
});

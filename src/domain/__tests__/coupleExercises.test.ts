import {
  SIGNATURE_SHARE,
  coupleExerciseInsight,
  myExerciseBreakdown,
  type ExerciseSession,
} from '@/domain/coupleExercises';

const WINDOW = new Set([
  '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20',
]);

const s = (day: string, exercise: 'push' | 'squat' | 'situp', reps: number): ExerciseSession =>
  ({ day, exercise, reps });

describe('myExerciseBreakdown', () => {
  it('groups reps and distinct days per movement', () => {
    const out = myExerciseBreakdown(
      [s('2026-09-15', 'push', 20), s('2026-09-15', 'push', 10), s('2026-09-16', 'push', 30)],
      WINDOW,
    );
    expect(out.mine).toHaveLength(1);
    expect(out.mine[0]).toMatchObject({ exercise: 'push', reps: 60, days: 2 });
    expect(out.total).toBe(60);
  });

  it('ranks strongest first', () => {
    const out = myExerciseBreakdown(
      [s('2026-09-15', 'squat', 10), s('2026-09-16', 'push', 50), s('2026-09-17', 'situp', 30)],
      WINDOW,
    );
    expect(out.mine.map((m) => m.exercise)).toEqual(['push', 'situp', 'squat']);
  });

  /* An abandoned set is not a habit — the rest of the app already refuses it XP
     and streak credit, and counting it as a trained day here would contradict
     the history grid beside it. */
  it('ignores zero-rep sessions rather than counting the day', () => {
    const out = myExerciseBreakdown(
      [s('2026-09-15', 'push', 0), s('2026-09-16', 'push', 20)],
      WINDOW,
    );
    expect(out.mine[0]).toMatchObject({ reps: 20, days: 1 });
  });

  it('ignores anything outside the window', () => {
    const out = myExerciseBreakdown(
      [s('2026-08-01', 'push', 999), s('2026-09-16', 'push', 20)],
      WINDOW,
    );
    expect(out.total).toBe(20);
  });

  it('is empty, not broken, with no sessions', () => {
    const out = myExerciseBreakdown([], WINDOW);
    expect(out).toEqual({ mine: [], total: 0, signature: null });
  });

  /* Deterministic ordering: a tie must not reshuffle between renders. */
  it('breaks ties stably', () => {
    const a = myExerciseBreakdown([s('2026-09-15','push',10), s('2026-09-15','squat',10)], WINDOW);
    const b = myExerciseBreakdown([s('2026-09-15','squat',10), s('2026-09-15','push',10)], WINDOW);
    expect(a.mine.map((m) => m.exercise)).toEqual(b.mine.map((m) => m.exercise));
  });
});

describe('signature', () => {
  it('names the movement someone clearly leads with', () => {
    const out = myExerciseBreakdown(
      [s('2026-09-15', 'push', 80), s('2026-09-16', 'squat', 20)],
      WINDOW,
    );
    expect(out.signature).toBe('push');
  });

  /* "Your movement is push-ups" is a claim about a person. An even spread is
     not evidence for it, and picking the first of three equals would be reading
     noise as identity. */
  it('refuses to name one when the split is even', () => {
    const out = myExerciseBreakdown(
      [s('2026-09-15','push',34), s('2026-09-16','squat',33), s('2026-09-17','situp',33)],
      WINDOW,
    );
    expect(out.signature).toBeNull();
  });

  it('refuses on an exact tie for the lead', () => {
    const out = myExerciseBreakdown(
      [s('2026-09-15', 'push', 50), s('2026-09-16', 'squat', 50)],
      WINDOW,
    );
    expect(out.signature).toBeNull();
  });

  it('needs the documented share, not merely the lead', () => {
    // push leads but holds under 40% of the volume.
    const out = myExerciseBreakdown(
      [s('2026-09-15','push',39), s('2026-09-16','squat',31), s('2026-09-17','situp',30)],
      WINDOW,
    );
    expect(out.mine[0]?.share).toBeLessThan(SIGNATURE_SHARE);
    expect(out.signature).toBeNull();
  });
});

/*
 * The honesty constraint this module exists under: a partner's per-exercise
 * history never reaches this device. `couples/{id}` stores `trainedDays` and
 * `totalReps` and nothing more, so the only breakdown that can be shown is the
 * viewer's own. Estimating the partner's would be fabricating data about a real
 * person, in the one screen where two people compare themselves.
 */
describe('coupleExerciseInsight', () => {
  it('says nothing when nothing was trained', () => {
    expect(coupleExerciseInsight(myExerciseBreakdown([], WINDOW))).toEqual({ kind: 'no-data' });
  });

  it('reports only the viewer’s own signature', () => {
    const out = coupleExerciseInsight(
      myExerciseBreakdown([s('2026-09-15','push',80), s('2026-09-16','squat',20)], WINDOW),
    );
    expect(out).toEqual({ kind: 'mine-only', signature: 'push', share: 0.8 });
  });

  it('falls back to mixed rather than inventing a lead', () => {
    const out = coupleExerciseInsight(
      myExerciseBreakdown([s('2026-09-15','push',50), s('2026-09-16','squat',50)], WINDOW),
    );
    expect(out).toEqual({ kind: 'mixed' });
  });

  /* The guard that matters most: no branch of this type may carry partner data,
     because no partner data exists on this device. */
  it('never returns a partner movement, because it cannot know one', () => {
    for (const sessions of [
      [],
      [s('2026-09-15', 'push', 80)],
      [s('2026-09-15','push',50), s('2026-09-16','squat',50)],
    ]) {
      const out = coupleExerciseInsight(myExerciseBreakdown(sessions, WINDOW));
      expect(JSON.stringify(out)).not.toMatch(/partner|theirs/i);
    }
  });
});

import { coupleDailyDetail, sideTotals, type DayStatusRow } from '@/domain/coupleExercises';

const row = (
  day: string,
  status: DayStatusRow['status'],
  extra: Partial<DayStatusRow> = {},
): DayStatusRow => ({ day, status, isToday: false, isFuture: false, ...extra });

describe('coupleDailyDetail', () => {
  const history = [
    row('2026-09-15', 'mine'),
    row('2026-09-16', 'neither'),
    row('2026-09-17', 'both'),
    row('2026-09-18', 'theirs'),
    row('2026-09-19', 'both', { isToday: true }),
    row('2026-09-20', 'neither', { isFuture: true }),
  ];

  const sessions = [
    s('2026-09-15', 'push', 20),
    s('2026-09-17', 'push', 30),
    s('2026-09-17', 'squat', 10),
    s('2026-09-19', 'situp', 25),
  ];

  it('is newest first', () => {
    const days = coupleDailyDetail(history, sessions);
    expect(days.map((d) => d.day)).toEqual([
      '2026-09-19', '2026-09-18', '2026-09-17', '2026-09-15',
    ]);
  });

  /* A list whose rows are mostly "nobody trained" buries the days that matter;
     the history grid above already shows the month's gaps. */
  it('drops days when neither of you trained', () => {
    expect(coupleDailyDetail(history, sessions).some((d) => d.day === '2026-09-16')).toBe(false);
  });

  /* The grid renders the trailing edge of the week to keep its shape, but a
     day that has not happened is not an event. */
  it('never reports a future day', () => {
    expect(coupleDailyDetail(history, sessions).some((d) => d.day === '2026-09-20')).toBe(false);
  });

  it('carries my reps and movements for the day', () => {
    const day = coupleDailyDetail(history, sessions).find((d) => d.day === '2026-09-17');
    expect(day?.myReps).toBe(40);
    expect(day?.myExercises.map((e) => e.exercise)).toEqual(['push', 'squat']);
  });

  /* The asymmetry this module exists to be honest about: a partner's reps are
     not on this device, so the only thing sayable is that they trained. */
  it('reports the partner as a fact, never a number', () => {
    const day = coupleDailyDetail(history, sessions).find((d) => d.day === '2026-09-18');
    expect(day?.theyTrained).toBe(true);
    expect(day?.myReps).toBe(0);
    expect(Object.keys(day ?? {})).not.toContain('theirReps');
  });

  it('marks the days that advance the shared streak', () => {
    const days = coupleDailyDetail(history, sessions);
    expect(days.filter((d) => d.both).map((d) => d.day)).toEqual(['2026-09-19', '2026-09-17']);
  });

  it('honours the limit', () => {
    expect(coupleDailyDetail(history, sessions, 2)).toHaveLength(2);
  });

  it('is empty, not broken, with no history', () => {
    expect(coupleDailyDetail([], [])).toEqual([]);
  });
});

describe('sideTotals', () => {
  it('counts my reps and both sides’ days', () => {
    const days = coupleDailyDetail(
      [row('2026-09-17', 'both'), row('2026-09-18', 'theirs'), row('2026-09-15', 'mine')],
      [s('2026-09-17', 'push', 30), s('2026-09-15', 'push', 20)],
    );
    expect(sideTotals(days)).toEqual({
      myReps: 50,
      myDays: 2,
      theirDays: 2,
      sharedDays: 1,
    });
  });

  it('is all zeroes for an empty window', () => {
    expect(sideTotals([])).toEqual({ myReps: 0, myDays: 0, theirDays: 0, sharedDays: 0 });
  });
});

import { PARTNER_QUIET_AFTER_DAYS, partnerWidget } from '@/domain/coupleExercises';
import { DORMANT_AFTER_DAYS } from '@/domain/dormantReminder';

describe('partnerWidget', () => {
  const base = [
    row('2026-09-15', 'mine'),
    row('2026-09-16', 'both'),
    row('2026-09-17', 'theirs'),
    row('2026-09-18', 'neither'),
    row('2026-09-19', 'mine', { isToday: true }),
  ];
  const sessions = [s('2026-09-15', 'push', 20), s('2026-09-19', 'push', 30)];

  it('counts each side’s days and my reps', () => {
    const w = partnerWidget(base, sessions, '2026-09-19');
    expect(w).toMatchObject({ theirDays: 2, myDays: 2, sharedDays: 1, myReps: 50 });
  });

  /* The asymmetry, again: their reps are not on this device, so the widget has
     no field to put them in. */
  it('carries no partner rep count', () => {
    const w = partnerWidget(base, sessions, '2026-09-19');
    expect(Object.keys(w)).not.toContain('theirReps');
  });

  it('leads with today when they have trained', () => {
    const w = partnerWidget(
      [...base, row('2026-09-19', 'theirs', { isToday: true })],
      sessions,
      '2026-09-19',
    );
    expect(w.pulse.kind).toBe('trained-today');
  });

  it('knows whether today was shared', () => {
    const shared = partnerWidget([row('2026-09-19', 'both', { isToday: true })], [], '2026-09-19');
    expect(shared.pulse).toEqual({ kind: 'trained-today', sharedToday: true });

    const solo = partnerWidget([row('2026-09-19', 'theirs', { isToday: true })], [], '2026-09-19');
    expect(solo.pulse).toEqual({ kind: 'trained-today', sharedToday: false });
  });

  it('reports a recent partner by days ago', () => {
    const w = partnerWidget(base, sessions, '2026-09-19');
    expect(w.pulse).toEqual({ kind: 'recent', daysAgo: 2 });
  });

  it('paints the week day by day, today last, with weekday initials', () => {
    const w = partnerWidget(
      [row('2026-09-17', 'theirs'), row('2026-09-18', 'neither'), row('2026-09-19', 'both', { isToday: true }), row('2026-09-20', 'mine', { isFuture: true })],
      [],
      '2026-09-19',
    );
    expect(w.strip).toBe('TNB');
    // A set on this phone lights my dot even before the day syncs.
    const local = partnerWidget([row('2026-09-18', 'neither'), row('2026-09-19', 'theirs', { isToday: true })], [s('2026-09-18', 'push', 10), s('2026-09-19', 'squat', 5)], '2026-09-19');
    expect(local.strip).toBe('MD');
    // 17 Sep 2026 is a Thursday.
    expect(w.letters).toBe('TFS');
  });

  it('calls them quiet once they pass the threshold', () => {
    const w = partnerWidget([row('2026-09-15', 'theirs')], [], '2026-09-19');
    expect(w.pulse).toEqual({ kind: 'quiet', daysAgo: 4 });
  });

  /* An athlete the app already considers dormant must not be described to
     their partner as recently active. */
  it('goes quiet exactly when the app calls someone dormant', () => {
    expect(PARTNER_QUIET_AFTER_DAYS).toBe(DORMANT_AFTER_DAYS);
  });

  it('says nothing about a partner who has never trained', () => {
    expect(partnerWidget([row('2026-09-19', 'mine')], [], '2026-09-19').pulse).toEqual({
      kind: 'no-history',
    });
    expect(partnerWidget([], [], '2026-09-19').pulse).toEqual({ kind: 'no-history' });
  });

  /* Future days are rendered by the grid to keep its shape; they are not
     evidence a partner trained. */
  it('ignores future rows', () => {
    const w = partnerWidget(
      [row('2026-09-19', 'mine', { isToday: true }), row('2026-09-20', 'theirs', { isFuture: true })],
      [],
      '2026-09-19',
    );
    expect(w.pulse.kind).toBe('no-history');
    expect(w.theirDays).toBe(0);
  });
});

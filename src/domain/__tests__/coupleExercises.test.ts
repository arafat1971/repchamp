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

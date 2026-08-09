import { exerciseProgress, headlineProof, shareWorthyLine } from '../progressProof';
import type { SessionSummary } from '@/state/profileStore';

let seq = 0;
function session(reps: number, o: Partial<SessionSummary> = {}): SessionSummary {
  seq += 1;
  const day = String(seq).padStart(2, '0');
  return {
    id: `s${seq}`,
    exercise: 'push',
    mode: 'practice',
    reps,
    opponentReps: null,
    opponentId: null,
    target: null,
    won: false,
    xp: 10,
    formScore: 80,
    durationSec: 20,
    completedAt: `2026-08-${day}T10:00:00.000Z`,
    day: `2026-08-${day}`,
    ...o,
  };
}

beforeEach(() => {
  seq = 0;
});

describe('exerciseProgress', () => {
  it('reports the gain between early and recent best sets', () => {
    const [push] = exerciseProgress([session(4), session(6), session(9), session(11)]);
    expect(push).toMatchObject({ exercise: 'push', firstBest: 6, currentBest: 11 });
    expect(push!.percentGain).toBeGreaterThan(0);
  });

  /* Two points are noise, not a trend. Claiming improvement from a single
     good day teaches the athlete that the app's praise means nothing. */
  it('says nothing until there are enough sessions to mean anything', () => {
    expect(exerciseProgress([session(4), session(20)])).toEqual([]);
  });

  /* A light day after a heavy week is not a regression. Best-vs-best keeps a
     recovery set from erasing weeks of real progress. */
  it('does not treat a lighter recent set as going backwards', () => {
    const progress = exerciseProgress([session(4), session(5), session(14), session(6)]);
    expect(progress[0]).toMatchObject({ firstBest: 5, currentBest: 14 });
  });

  it('claims nothing when the athlete genuinely has not improved', () => {
    expect(exerciseProgress([session(10), session(9), session(8), session(7)])).toEqual([]);
  });

  it('keeps exercises separate and leads with the biggest gain', () => {
    const out = exerciseProgress([
      session(4), session(5), session(6), session(7),
      session(10, { exercise: 'squat' }),
      session(11, { exercise: 'squat' }),
      session(40, { exercise: 'squat' }),
      session(42, { exercise: 'squat' }),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]!.exercise).toBe('squat');
  });
});

describe('headlineProof', () => {
  it('leads with a measurable rep gain when there is one', () => {
    const line = headlineProof([session(4), session(5), session(9), session(12)], 0);
    expect(line).toContain('5 to 12 reps');
  });

  it('falls back to the streak when reps have not improved yet', () => {
    expect(headlineProof([session(10), session(10)], 5)).toBe(
      '5 days in a row — that is the hard part done',
    );
  });

  it('counts total volume when there is no gain and no streak', () => {
    const many = Array.from({ length: 12 }, () => session(10));
    expect(headlineProof(many, 0)).toContain('reps banked');
  });

  /* Day one has earned nothing. A fabricated milestone here is the fastest way
     to make every later milestone worthless. */
  it('says nothing to an athlete who has just arrived', () => {
    expect(headlineProof([], 0)).toBeNull();
    expect(headlineProof([session(5)], 0)).toBeNull();
  });
});

describe('shareWorthyLine', () => {
  it('offers a share only for a substantial gain', () => {
    const line = shareWorthyLine([session(4), session(4), session(9), session(10)], 0);
    expect(line).toContain('%');
  });

  it('offers a share for a long streak', () => {
    expect(shareWorthyLine([session(10)], 9)).toContain('9-day');
  });

  /* Prompting someone to broadcast an unremarkable day costs them social
     credit and trains them to ignore the prompt. */
  it('stays quiet on an ordinary day', () => {
    expect(shareWorthyLine([session(10), session(10), session(10)], 2)).toBeNull();
  });
});

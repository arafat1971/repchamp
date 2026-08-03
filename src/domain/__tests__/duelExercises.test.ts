import {
  DUEL_EXERCISE_IDS,
  duelExerciseOptions,
  parseDuelExercise,
} from '@/domain/duelExercises';
import { isExerciseFree } from '@/domain/pro';
import { EXERCISES } from '@/vision/exercises';

/**
 * `parseDuelExercise` reads a route param, and routes here are reachable from
 * deep links (`repchamp://duel/new?exercise=...`). That makes its input
 * attacker-controlled in the ordinary sense: whatever arrives must resolve to a
 * real exercise or fall back, never propagate an unknown id into a session.
 */
describe('parseDuelExercise', () => {
  it('accepts every id the duel picker offers', () => {
    for (const id of DUEL_EXERCISE_IDS) {
      expect(parseDuelExercise(id)).toBe(id);
    }
  });

  it('falls back to push-ups for anything it does not recognise', () => {
    expect(parseDuelExercise(undefined)).toBe('push');
    expect(parseDuelExercise('')).toBe('push');
    expect(parseDuelExercise('not-an-exercise')).toBe('push');
  });

  /*
   * A real ExerciseId that is not in the duel list must still be refused —
   * accepting one would put a movement into a duel that the picker, the HUD and
   * the scoring copy were never written for.
   */
  it('refuses a valid exercise that is not duel-eligible', () => {
    const nonDuel = Object.keys(EXERCISES).find(
      (id) => !(DUEL_EXERCISE_IDS as readonly string[]).includes(id),
    );
    // Guard the guard: if every exercise becomes duel-eligible this test is moot
    // rather than silently passing on an empty search.
    expect(nonDuel).toBeDefined();
    expect(parseDuelExercise(nonDuel)).toBe('push');
  });

  it('does not coerce case or whitespace into a match', () => {
    expect(parseDuelExercise('PUSH')).toBe('push');
    expect(parseDuelExercise(' push ')).toBe('push');
    // Both land on the default, which happens to be 'push' — assert the reason
    // rather than the value by using an id whose fallback is distinguishable.
    expect(parseDuelExercise('SQUAT')).not.toBe('squat');
  });
});

describe('duelExerciseOptions', () => {
  it('returns one option per duel exercise, in the declared order', () => {
    expect(duelExerciseOptions().map((o) => o.id)).toEqual([...DUEL_EXERCISE_IDS]);
  });

  it('labels each option from the exercise registry rather than a second copy', () => {
    for (const option of duelExerciseOptions()) {
      expect(option.label).toBe(EXERCISES[option.id].label);
    }
  });

  /*
   * The `free` flag drives whether the picker shows a lock. It has to agree
   * with the entitlement check the session screen actually enforces, or the
   * athlete picks an exercise and is bounced to the paywall afterwards.
   */
  it('marks free exercises the same way the entitlement check does', () => {
    for (const option of duelExerciseOptions()) {
      expect(option.free).toBe(isExerciseFree(option.id));
    }
  });

  it('gives every option the metadata the picker renders', () => {
    for (const option of duelExerciseOptions()) {
      expect(option.label).toBeTruthy();
      expect(option.emoji).toBeTruthy();
    }
  });
});

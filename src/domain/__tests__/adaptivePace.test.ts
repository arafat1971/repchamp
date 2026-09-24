import {
  FLOOR_RPM,
  NEWCOMER_RPM,
  athletePace,
  matchedPace,
  type PaceSample,
} from '../adaptivePace';

const push = (reps: number, durationSec = 20): PaceSample => ({ exercise: 'push', reps, durationSec });

describe('athletePace', () => {
  it('is null with no usable history', () => {
    expect(athletePace([], 'push')).toBeNull();
    expect(athletePace([{ exercise: 'squat', reps: 10, durationSec: 20 }], 'push')).toBeNull();
    expect(athletePace([push(0), push(5, 5)], 'push')).toBeNull();
  });

  /* One abandoned or one freak set must not swing the next race. */
  it('takes the median of the most recent sets of this movement', () => {
    const history = [push(5), push(6), push(30), push(1), push(5), push(40)];
    // Newest five: 5, 6, 30, 1, 5 in 20 s → 15, 18, 90, 3, 15 rpm → median 15.
    expect(athletePace(history, 'push')).toBe(15);
  });
});

describe('matchedPace', () => {
  /* The race that motivated this: 5 push-ups in 20 s against Coach Spark's
     listed 44 rpm (12 reps). The gentlest partner now races at the athlete's
     own pace instead. */
  it('races a normal athlete at their own pace, not the listed one', () => {
    expect(matchedPace(44, [push(5), push(5)], 'push')).toBe(15);
  });

  it('pushes a fifth harder on the toughest partner', () => {
    expect(matchedPace(92, [push(10)], 'push')).toBeCloseTo(36);
  });

  it('never runs faster than the partner’s listed pace', () => {
    expect(matchedPace(44, [push(30)], 'push')).toBe(44);
  });

  it('gives a newcomer a gentle race', () => {
    expect(matchedPace(44, [], 'push')).toBe(NEWCOMER_RPM);
  });

  it('keeps a floor so it is still a race', () => {
    expect(matchedPace(44, [push(1, 60)], 'push')).toBe(FLOOR_RPM);
  });
});

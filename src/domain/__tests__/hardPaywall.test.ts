import {
  FREE_REP_LIMIT,
  evaluateHardWall,
  isNearingWall,
  isWalled,
  repsRemaining,
} from '../hardPaywall';

const input = (o: Partial<Parameters<typeof evaluateHardWall>[0]> = {}) => ({
  isPro: false,
  repsSoFar: 0,
  billingReady: true,
  ...o,
});

describe('evaluateHardWall', () => {
  it('allows training under the allowance', () => {
    expect(evaluateHardWall(input({ repsSoFar: FREE_REP_LIMIT - 1 }))).toEqual({
      walled: false,
    });
  });

  it('walls the moment the allowance is spent', () => {
    expect(evaluateHardWall(input({ repsSoFar: FREE_REP_LIMIT }))).toEqual({
      walled: true,
      reason: 'rep-limit',
    });
  });

  it('stays walled past the limit', () => {
    expect(isWalled(input({ repsSoFar: FREE_REP_LIMIT + 50 }))).toBe(true);
  });

  it('never walls Pro', () => {
    expect(isWalled(input({ isPro: true, repsSoFar: 9999 }))).toBe(false);
  });

  /* The viral loop. Whoever reaches a together-set was invited by someone
     else, so walling them walls the referrer's pitch, not just their own
     session. */
  it('never walls couple mode', () => {
    expect(isWalled(input({ isCoupleMode: true, repsSoFar: 9999 }))).toBe(false);
  });

  /* A wall on a build that cannot sell anything is a dead end with no way
     out — the same shape as the paywall Play rejected. */
  it('never walls when billing is unavailable', () => {
    expect(isWalled(input({ billingReady: false, repsSoFar: 9999 }))).toBe(false);
  });

  /* Exemptions are checked before the count, so they hold at any rep total. */
  it('applies exemptions regardless of reps', () => {
    const spent = { repsSoFar: 10_000 };
    expect(isWalled(input({ ...spent, isPro: true }))).toBe(false);
    expect(isWalled(input({ ...spent, isCoupleMode: true }))).toBe(false);
    expect(isWalled(input({ ...spent, billingReady: false }))).toBe(false);
  });
});

describe('repsRemaining', () => {
  it('counts down to the wall', () => {
    expect(repsRemaining(input({ repsSoFar: 0 }))).toBe(FREE_REP_LIMIT);
    expect(repsRemaining(input({ repsSoFar: FREE_REP_LIMIT - 1 }))).toBe(1);
  });

  it('floors at zero rather than going negative', () => {
    expect(repsRemaining(input({ repsSoFar: FREE_REP_LIMIT + 20 }))).toBe(0);
  });

  it('is unbounded for anyone the wall does not apply to', () => {
    expect(repsRemaining(input({ isPro: true }))).toBe(Number.POSITIVE_INFINITY);
    expect(repsRemaining(input({ isCoupleMode: true }))).toBe(Number.POSITIVE_INFINITY);
    expect(repsRemaining(input({ billingReady: false }))).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('isNearingWall', () => {
  /* A wall that arrives unannounced reads as a crash, so the session warns
     first. */
  it('warns on the last two reps', () => {
    expect(isNearingWall(input({ repsSoFar: FREE_REP_LIMIT - 2 }))).toBe(true);
    expect(isNearingWall(input({ repsSoFar: FREE_REP_LIMIT - 1 }))).toBe(true);
  });

  it('does not warn while there is room', () => {
    expect(isNearingWall(input({ repsSoFar: 0 }))).toBe(false);
  });

  /* Once the wall is up the warning is wrong — the wall itself is the
     message. */
  it('stops warning once walled', () => {
    expect(isNearingWall(input({ repsSoFar: FREE_REP_LIMIT }))).toBe(false);
  });

  it('never warns someone the wall does not apply to', () => {
    expect(isNearingWall(input({ isPro: true, repsSoFar: FREE_REP_LIMIT - 1 }))).toBe(false);
  });
});

/* The wall is evaluated on *banked* reps, never banked + live.
 *
 * An earlier version added the live rep count, which cut the set off the
 * instant the limit was crossed. That unmounted the session before the result
 * screen could run `recordSession`, so the athlete's last set was lost — and
 * because those reps were never banked, the total stayed under the limit and
 * re-walled them on every future session. These pin the arithmetic that the
 * call site depends on. */
describe('the allowance is spent by banked reps, not live ones', () => {
  it('does not wall an athlete whose banked total is still under the limit', () => {
    expect(isWalled(input({ repsSoFar: FREE_REP_LIMIT - 1 }))).toBe(false);
  });

  it('walls once those reps have actually been banked', () => {
    expect(isWalled(input({ repsSoFar: FREE_REP_LIMIT }))).toBe(true);
  });

  /* The warning counts the live set, so it can reach zero during the set that
     spends the allowance — while the wall itself stays down until those reps
     are recorded. */
  it('lets the countdown reach zero without the wall being up', () => {
    const banked = FREE_REP_LIMIT - 2;
    expect(repsRemaining(input({ repsSoFar: banked + 2 }))).toBe(0);
    expect(isWalled(input({ repsSoFar: banked }))).toBe(false);
  });
});

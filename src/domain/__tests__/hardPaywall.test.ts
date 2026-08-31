import {
  FREE_REP_LIMIT,
  HARD_WALL_ENABLED,
  evaluateHardWall,
  evaluateHardWallRule,
  isNearingWall,
  isWalled,
  repsRemaining,
  repsRemainingRule,
} from '../hardPaywall';

/** `isNearingWall` without the master switch, mirroring its real logic. */
const nearing = (i: Parameters<typeof repsRemainingRule>[0]) => {
  const left = repsRemainingRule(i);
  return Number.isFinite(left) && left > 0 && left <= 2;
};

const input = (o: Partial<Parameters<typeof evaluateHardWall>[0]> = {}) => ({
  isPro: false,
  repsSoFar: 0,
  billingReady: true,
  ...o,
});

describe('evaluateHardWall', () => {
  it('allows training under the allowance', () => {
    expect(evaluateHardWallRule(input({ repsSoFar: FREE_REP_LIMIT - 1 }))).toEqual({
      walled: false,
    });
  });

  it('walls the moment the allowance is spent', () => {
    expect(evaluateHardWallRule(input({ repsSoFar: FREE_REP_LIMIT }))).toEqual({
      walled: true,
      reason: 'rep-limit',
    });
  });

  it('stays walled past the limit', () => {
    expect(evaluateHardWallRule(input({ repsSoFar: FREE_REP_LIMIT + 50 })).walled).toBe(true);
  });

  it('never walls Pro', () => {
    expect(evaluateHardWallRule(input({ isPro: true, repsSoFar: 9999 })).walled).toBe(false);
  });

  /* The viral loop. Whoever reaches a together-set was invited by someone
     else, so walling them walls the referrer's pitch, not just their own
     session. */
  it('never walls couple mode', () => {
    expect(evaluateHardWallRule(input({ isCoupleMode: true, repsSoFar: 9999 })).walled).toBe(false);
  });

  /* A wall on a build that cannot sell anything is a dead end with no way
     out — the same shape as the paywall Play rejected. */
  it('never walls when billing is unavailable', () => {
    expect(evaluateHardWallRule(input({ billingReady: false, repsSoFar: 9999 })).walled).toBe(false);
  });

  /* Exemptions are checked before the count, so they hold at any rep total. */
  it('applies exemptions regardless of reps', () => {
    const spent = { repsSoFar: 10_000 };
    expect(evaluateHardWallRule(input({ ...spent, isPro: true })).walled).toBe(false);
    expect(evaluateHardWallRule(input({ ...spent, isCoupleMode: true })).walled).toBe(false);
    expect(evaluateHardWallRule(input({ ...spent, billingReady: false })).walled).toBe(false);
  });
});

describe('repsRemaining', () => {
  it('counts down to the wall', () => {
    expect(repsRemainingRule(input({ repsSoFar: 0 }))).toBe(FREE_REP_LIMIT);
    expect(repsRemainingRule(input({ repsSoFar: FREE_REP_LIMIT - 1 }))).toBe(1);
  });

  it('floors at zero rather than going negative', () => {
    expect(repsRemainingRule(input({ repsSoFar: FREE_REP_LIMIT + 20 }))).toBe(0);
  });

  it('is unbounded for anyone the wall does not apply to', () => {
    expect(repsRemainingRule(input({ isPro: true }))).toBe(Number.POSITIVE_INFINITY);
    expect(repsRemainingRule(input({ isCoupleMode: true }))).toBe(Number.POSITIVE_INFINITY);
    expect(repsRemainingRule(input({ billingReady: false }))).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('isNearingWall', () => {
  /* A wall that arrives unannounced reads as a crash, so the session warns
     first. */
  it('warns on the last two reps', () => {
    expect(nearing(input({ repsSoFar: FREE_REP_LIMIT - 2 }))).toBe(true);
    expect(nearing(input({ repsSoFar: FREE_REP_LIMIT - 1 }))).toBe(true);
  });

  it('does not warn while there is room', () => {
    expect(nearing(input({ repsSoFar: 0 }))).toBe(false);
  });

  /* Once the wall is up the warning is wrong — the wall itself is the
     message. */
  it('stops warning once walled', () => {
    expect(nearing(input({ repsSoFar: FREE_REP_LIMIT }))).toBe(false);
  });

  it('never warns someone the wall does not apply to', () => {
    expect(nearing(input({ isPro: true, repsSoFar: FREE_REP_LIMIT - 1 }))).toBe(false);
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
    expect(evaluateHardWallRule(input({ repsSoFar: FREE_REP_LIMIT - 1 })).walled).toBe(false);
  });

  it('walls once those reps have actually been banked', () => {
    expect(evaluateHardWallRule(input({ repsSoFar: FREE_REP_LIMIT })).walled).toBe(true);
  });

  /* The warning counts the live set, so it can reach zero during the set that
     spends the allowance — while the wall itself stays down until those reps
     are recorded. */
  it('lets the countdown reach zero without the wall being up', () => {
    const banked = FREE_REP_LIMIT - 2;
    expect(repsRemainingRule(input({ repsSoFar: banked + 2 }))).toBe(0);
    expect(evaluateHardWallRule(input({ repsSoFar: banked })).walled).toBe(false);
  });
});

/* The master switch itself.
 *
 * On since Play review cleared. These assert that the switch is genuinely all
 * that separates the shipped app from the rules tested above — so if it is
 * ever turned off again, the failures point at the switch rather than leaving
 * the rules silently unverified. */
describe('HARD_WALL_ENABLED', () => {
  it('is on — Play review has cleared', () => {
    expect(HARD_WALL_ENABLED).toBe(true);
  });

  /* With the switch on, the public functions and the rule functions must agree
     exactly. Any divergence means the switch is doing more than gating. */
  it('delegates to the rules unchanged', () => {
    const cases = [
      input({ repsSoFar: 0 }),
      input({ repsSoFar: FREE_REP_LIMIT }),
      input({ repsSoFar: FREE_REP_LIMIT, isPro: true }),
      input({ repsSoFar: FREE_REP_LIMIT, isCoupleMode: true }),
      input({ repsSoFar: FREE_REP_LIMIT, billingReady: false }),
    ];
    for (const c of cases) {
      expect(evaluateHardWall(c)).toEqual(evaluateHardWallRule(c));
      expect(repsRemaining(c)).toBe(repsRemainingRule(c));
    }
  });

  it('walls a spent athlete, and only a spent athlete', () => {
    expect(isWalled(input({ repsSoFar: FREE_REP_LIMIT }))).toBe(true);
    expect(isWalled(input({ repsSoFar: FREE_REP_LIMIT - 1 }))).toBe(false);
  });

  /* The exemptions still hold with the switch on — this is what keeps the
     invite loop and no-billing builds out of the wall. */
  it('keeps every exemption', () => {
    const spent = { repsSoFar: 10_000 };
    expect(isWalled(input({ ...spent, isPro: true }))).toBe(false);
    expect(isWalled(input({ ...spent, isCoupleMode: true }))).toBe(false);
    expect(isWalled(input({ ...spent, billingReady: false }))).toBe(false);
  });

  it('shows a real countdown rather than an unlimited one', () => {
    expect(repsRemaining(input({ repsSoFar: FREE_REP_LIMIT - 2 }))).toBe(2);
    expect(isNearingWall(input({ repsSoFar: FREE_REP_LIMIT - 1 }))).toBe(true);
  });
});

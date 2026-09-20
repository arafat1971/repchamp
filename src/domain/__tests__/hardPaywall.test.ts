import {
  FREE_REP_LIMIT,
  HARD_WALL_ENABLED,
  NEARING_WALL_REPS,
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
  return Number.isFinite(left) && left > 0 && left <= NEARING_WALL_REPS;
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
  it('warns through the closing reps', () => {
    expect(nearing(input({ repsSoFar: FREE_REP_LIMIT - NEARING_WALL_REPS }))).toBe(true);
    expect(nearing(input({ repsSoFar: FREE_REP_LIMIT - 1 }))).toBe(true);
  });

  /* The boundary itself, which the thresholds above sit inside and so cannot
     pin. Without this the window could widen or narrow silently — the failure
     that hid when the warning stayed at 2 reps against a 50-rep allowance. */
  it('starts exactly at the threshold, not before', () => {
    expect(nearing(input({ repsSoFar: FREE_REP_LIMIT - NEARING_WALL_REPS }))).toBe(true);
    expect(nearing(input({ repsSoFar: FREE_REP_LIMIT - NEARING_WALL_REPS - 1 }))).toBe(false);
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
 * On since 2026-09-20. These pin what athletes actually meet, which the `*Rule`
 * tests above cannot: those exercise the logic regardless of the switch, and
 * these assert the switch is passing that logic through to the shipped app.
 *
 * If the wall is ever stood down again, this block is the honest record of what
 * changed — flip the expectations rather than deleting them, so the difference
 * between "the rules say walled" and "an athlete is walled" stays visible. */
describe('HARD_WALL_ENABLED', () => {
  it('is on — the wall is live', () => {
    expect(HARD_WALL_ENABLED).toBe(true);
  });

  /* The allowance, as an athlete meets it. The boundary matters more than the
     extremes: 49 reps trains, 50 stops. */
  it('walls exactly when the allowance is spent, not before', () => {
    expect(isWalled(input({ repsSoFar: FREE_REP_LIMIT - 1 }))).toBe(false);
    expect(isWalled(input({ repsSoFar: FREE_REP_LIMIT }))).toBe(true);
    expect(evaluateHardWall(input({ repsSoFar: FREE_REP_LIMIT }))).toEqual({
      walled: true,
      reason: 'rep-limit',
    });
  });

  /* The exemptions are the part that must survive the switch being on, because
     each one protects something worth more than the conversion it costs: Pro
     already paid, couple mode is the invite loop, and a build with no billing
     would be a lock with nothing to buy. */
  it('still exempts Pro, couple mode and unconfigured billing', () => {
    const spent = { repsSoFar: 10_000 };
    expect(isWalled(input({ ...spent, isPro: true }))).toBe(false);
    expect(isWalled(input({ ...spent, isCoupleMode: true }))).toBe(false);
    expect(isWalled(input({ ...spent, billingReady: false }))).toBe(false);
  });

  /* The countdown and its warning are now live, and `Number.isFinite` at the
     call site is what decides whether the session renders them. */
  it('counts down and warns as the allowance closes', () => {
    expect(repsRemaining(input({ repsSoFar: FREE_REP_LIMIT - 2 }))).toBe(2);
    expect(Number.isFinite(repsRemaining(input({ repsSoFar: FREE_REP_LIMIT - 2 })))).toBe(true);
    expect(isNearingWall(input({ repsSoFar: FREE_REP_LIMIT - NEARING_WALL_REPS }))).toBe(true);
    expect(isNearingWall(input({ repsSoFar: 0 }))).toBe(false);
  });

  /* Anyone exempt keeps an unbounded countdown, so a countdown UI can render
     "∞" or hide itself without special-casing each exemption. */
  it('leaves the countdown unbounded for the exempt', () => {
    expect(repsRemaining(input({ repsSoFar: 10_000, isPro: true }))).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(repsRemaining(input({ repsSoFar: 10_000, isCoupleMode: true }))).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  /* The switch gates and nothing else: with it on, the public functions and the
     rule functions must agree everywhere. If they ever diverge, one of them has
     grown logic the other does not have. */
  it('passes the rules through unchanged', () => {
    expect(evaluateHardWallRule(input({ repsSoFar: FREE_REP_LIMIT }))).toEqual({
      walled: true,
      reason: 'rep-limit',
    });
    expect(evaluateHardWallRule(input({ repsSoFar: FREE_REP_LIMIT - 1 })).walled).toBe(false);
    expect(repsRemainingRule(input({ repsSoFar: FREE_REP_LIMIT - 2 }))).toBe(2);

    /* And the exemptions, which must survive a return to the wall — they are
       what keeps the invite loop and no-billing builds out of it. */
    const spent = { repsSoFar: 10_000 };
    expect(evaluateHardWallRule(input({ ...spent, isPro: true })).walled).toBe(false);
    expect(evaluateHardWallRule(input({ ...spent, isCoupleMode: true })).walled).toBe(false);
    expect(evaluateHardWallRule(input({ ...spent, billingReady: false })).walled).toBe(false);
  });

  /* The literal values, pinned. 50 rather than 5 is the substance of this turn:
     at 5 the wall landed on the second session, since onboarding's last tap
     drops straight into a practice set. */
  it('records the allowance athletes actually get', () => {
    expect(FREE_REP_LIMIT).toBe(50);
    expect(NEARING_WALL_REPS).toBe(8);
  });
});

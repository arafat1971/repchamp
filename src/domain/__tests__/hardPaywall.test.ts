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
 * Off since 2026-09-13 — gating the core experience hurts retention. These
 * assert that the switch is genuinely all that separates the shipped app from
 * the rules tested above, so the two stay distinguishable: the rules keep their
 * own coverage via the `*Rule` functions, and these pin what athletes actually
 * meet, which is no wall at all. */
describe('HARD_WALL_ENABLED', () => {
  it('is off — the wall is stood down', () => {
    expect(HARD_WALL_ENABLED).toBe(false);
  });

  /* The point of the switch: nobody is walled, at any rep total, ever. If this
     fails the wall is live again and athletes are being stopped mid-habit. */
  it('never walls anyone, however many reps they have spent', () => {
    expect(isWalled(input({ repsSoFar: FREE_REP_LIMIT }))).toBe(false);
    expect(isWalled(input({ repsSoFar: FREE_REP_LIMIT - 1 }))).toBe(false);
    expect(isWalled(input({ repsSoFar: 10_000 }))).toBe(false);
    expect(evaluateHardWall(input({ repsSoFar: 10_000 }))).toEqual({ walled: false });
  });

  /* With the switch off the countdown is unbounded, so the session renders no
     allowance warning — `Number.isFinite` at the call site is what hides it. */
  it('shows no countdown and no warning', () => {
    expect(repsRemaining(input({ repsSoFar: FREE_REP_LIMIT - 2 }))).toBe(Number.POSITIVE_INFINITY);
    expect(repsRemaining(input({ repsSoFar: 10_000 }))).toBe(Number.POSITIVE_INFINITY);
    expect(isNearingWall(input({ repsSoFar: FREE_REP_LIMIT - 1 }))).toBe(false);
    expect(isNearingWall(input({ repsSoFar: FREE_REP_LIMIT - NEARING_WALL_REPS }))).toBe(false);
  });

  /* The switch only gates — it must not have edited the rules on its way out.
     Every case the public functions now wave through is still a case the rule
     functions decide correctly, ready for the switch being turned back on. */
  it('leaves the rules underneath intact', () => {
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

  /* The literal values stay pinned while the switch is off. They are what the
     wall would come back as, and a silent drift now would only surface on the
     day someone turns it on. */
  it('still records the allowance it would return as', () => {
    expect(FREE_REP_LIMIT).toBe(50);
    expect(NEARING_WALL_REPS).toBe(8);
  });
});

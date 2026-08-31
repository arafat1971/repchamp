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
 * It is off while the Play appeal is open, so these are what guarantee the
 * shipped app behaves as though the wall does not exist — and, when it is
 * flipped back on, that the switch is genuinely all that changed. The rules
 * above are tested through `*Rule` so they stay pinned in either state. */
describe('HARD_WALL_ENABLED', () => {
  it('is off — the wall must not ship while Play review is open', () => {
    expect(HARD_WALL_ENABLED).toBe(false);
  });

  it('nothing is walled while the switch is off, at any rep count', () => {
    expect(evaluateHardWall(input({ repsSoFar: 10_000 }))).toEqual({ walled: false });
    expect(isWalled(input({ repsSoFar: 10_000 }))).toBe(false);
  });

  it('the allowance reads as unlimited, so no countdown is shown', () => {
    expect(repsRemaining(input({ repsSoFar: 10_000 }))).toBe(Number.POSITIVE_INFINITY);
    expect(isNearingWall(input({ repsSoFar: FREE_REP_LIMIT - 1 }))).toBe(false);
  });

  /* The switch is checked before every exemption, so its behaviour cannot
     depend on who the athlete is. */
  it('is off for everyone, not just the exempt', () => {
    for (const who of [{ isPro: true }, { isCoupleMode: true }, { billingReady: false }, {}]) {
      expect(isWalled(input({ ...who, repsSoFar: 10_000 }))).toBe(false);
    }
  });
});

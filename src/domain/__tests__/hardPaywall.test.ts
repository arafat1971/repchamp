import {
  FREE_REP_LIMIT,
  HARD_WALL_ENABLED,
  NEARING_WALL_REPS,
  WALL_COPY,
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

/* The allowance is 50 (restored 2026-11-05): 2-3 sessions to experience core
 * AI rep counter before the wall locks. These pin that, plus every exemption that
 * must survive it. */
describe('evaluateHardWall', () => {
  it('allows reps below the allowance', () => {
    expect(evaluateHardWallRule(input({ repsSoFar: 0 }))).toEqual({
      walled: false,
    });
    expect(evaluateHardWallRule(input({ repsSoFar: 49 }))).toEqual({
      walled: false,
    });
  });

  it('walls when the allowance is reached or exceeded', () => {
    expect(evaluateHardWallRule(input({ repsSoFar: FREE_REP_LIMIT }))).toEqual({
      walled: true,
      reason: 'rep-limit',
    });
    expect(evaluateHardWallRule(input({ repsSoFar: FREE_REP_LIMIT + 50 })).walled).toBe(true);
  });

  it('never walls Pro', () => {
    expect(evaluateHardWallRule(input({ isPro: true, repsSoFar: 0 })).walled).toBe(false);
  });

  /* The viral loop. Whoever reaches a together-set was invited by someone
     else, so walling them walls the referrer's pitch, not just their own
     session. */
  it('never walls couple mode', () => {
    expect(evaluateHardWallRule(input({ isCoupleMode: true, repsSoFar: 0 })).walled).toBe(false);
  });

  /* A wall on a build that cannot sell anything is a dead end with no way
     out — the same shape as the paywall Play rejected. */
  it('never walls when billing is unavailable', () => {
    expect(evaluateHardWallRule(input({ billingReady: false, repsSoFar: 0 })).walled).toBe(false);
  });

  /* Exemptions are checked before the count, so they hold at any rep total. */
  it('applies exemptions regardless of reps', () => {
    for (const repsSoFar of [0, 10_000]) {
      expect(evaluateHardWallRule(input({ repsSoFar, isPro: true })).walled).toBe(false);
      expect(evaluateHardWallRule(input({ repsSoFar, isCoupleMode: true })).walled).toBe(false);
      expect(evaluateHardWallRule(input({ repsSoFar, billingReady: false })).walled).toBe(false);
    }
  });
});

describe('repsRemaining', () => {
  it('is zero from the start and never negative', () => {
    expect(repsRemainingRule(input({ repsSoFar: 0 }))).toBe(FREE_REP_LIMIT);
    expect(repsRemainingRule(input({ repsSoFar: FREE_REP_LIMIT + 20 }))).toBe(0);
  });

  it('is unbounded for anyone the wall does not apply to', () => {
    expect(repsRemainingRule(input({ isPro: true }))).toBe(Number.POSITIVE_INFINITY);
    expect(repsRemainingRule(input({ isCoupleMode: true }))).toBe(Number.POSITIVE_INFINITY);
    expect(repsRemainingRule(input({ billingReady: false }))).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('isNearingWall', () => {
  it('warns when reps remaining is between 1 and NEARING_WALL_REPS', () => {
    expect(nearing(input({ repsSoFar: 0 }))).toBe(false);
    expect(nearing(input({ repsSoFar: FREE_REP_LIMIT - NEARING_WALL_REPS }))).toBe(true);
    expect(nearing(input({ repsSoFar: FREE_REP_LIMIT - 1 }))).toBe(true);
    expect(nearing(input({ repsSoFar: FREE_REP_LIMIT }))).toBe(false);
  });

  it('never warns someone the wall does not apply to', () => {
    expect(nearing(input({ isPro: true, repsSoFar: FREE_REP_LIMIT - 2 }))).toBe(false);
  });
});

/* The master switch itself. On since 2026-09-20; flip the expectations rather
 * than deleting them if the wall is ever stood down. */
describe('HARD_WALL_ENABLED', () => {
  it('is on — the wall is live', () => {
    expect(HARD_WALL_ENABLED).toBe(true);
  });

  it('allows training under the limit and walls at or above it', () => {
    expect(isWalled(input({ repsSoFar: 0 }))).toBe(false);
    expect(isWalled(input({ repsSoFar: FREE_REP_LIMIT }))).toBe(true);
    expect(evaluateHardWall(input({ repsSoFar: FREE_REP_LIMIT }))).toEqual({
      walled: true,
      reason: 'rep-limit',
    });
  });

  it('still exempts Pro, couple mode and unconfigured billing', () => {
    expect(isWalled(input({ isPro: true }))).toBe(false);
    expect(isWalled(input({ isCoupleMode: true }))).toBe(false);
    expect(isWalled(input({ billingReady: false }))).toBe(false);
  });

  it('shows countdown to the free athlete and unbounded to the exempt', () => {
    expect(repsRemaining(input({ repsSoFar: 0 }))).toBe(50);
    expect(repsRemaining(input({ repsSoFar: 50 }))).toBe(0);
    expect(isNearingWall(input({ repsSoFar: 45 }))).toBe(true);
    expect(isNearingWall(input({ repsSoFar: 0 }))).toBe(false);
    expect(repsRemaining(input({ isPro: true }))).toBe(Number.POSITIVE_INFINITY);
    expect(repsRemaining(input({ isCoupleMode: true }))).toBe(Number.POSITIVE_INFINITY);
  });

  it('passes the rules through unchanged', () => {
    expect(evaluateHardWall(input())).toEqual(evaluateHardWallRule(input()));
    expect(evaluateHardWall(input({ isPro: true }))).toEqual(
      evaluateHardWallRule(input({ isPro: true })),
    );
  });

  it('records the allowance athletes actually get', () => {
    expect(FREE_REP_LIMIT).toBe(50);
    expect(NEARING_WALL_REPS).toBe(8);
  });

  it('words the locked state with free reps copy', () => {
    expect(FREE_REP_LIMIT).toBe(50);
    expect(WALL_COPY.pill).toBe('Free reps used');
  });
});

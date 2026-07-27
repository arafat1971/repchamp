import {
  FREE_REP_LIMIT,
  evaluatePaywallGate,
  isWalled,
  repsRemaining,
} from '@/domain/paywallGate';

describe('evaluatePaywallGate', () => {
  it('lets a brand-new athlete train until the free rep allowance is spent', () => {
    expect(evaluatePaywallGate({ isPro: false, repsSoFar: 0 })).toEqual({ allowed: true });
    expect(evaluatePaywallGate({ isPro: false, repsSoFar: FREE_REP_LIMIT - 1 })).toEqual({
      allowed: true,
    });
  });

  it('walls a non-Pro athlete the instant the rep limit is reached', () => {
    expect(evaluatePaywallGate({ isPro: false, repsSoFar: FREE_REP_LIMIT })).toEqual({
      allowed: false,
      reason: 'rep-limit',
    });
    expect(evaluatePaywallGate({ isPro: false, repsSoFar: FREE_REP_LIMIT + 5 })).toEqual({
      allowed: false,
      reason: 'rep-limit',
    });
  });

  it('never walls a Pro athlete, however many reps', () => {
    expect(evaluatePaywallGate({ isPro: true, repsSoFar: 9999 })).toEqual({ allowed: true });
  });

  it('never walls couple mode — the viral loop stays open', () => {
    expect(evaluatePaywallGate({ isPro: false, repsSoFar: 9999, isCoupleMode: true })).toEqual({
      allowed: true,
    });
  });
});

describe('isWalled', () => {
  it('mirrors the decision', () => {
    expect(isWalled({ isPro: false, repsSoFar: 0 })).toBe(false);
    expect(isWalled({ isPro: false, repsSoFar: FREE_REP_LIMIT })).toBe(true);
    expect(isWalled({ isPro: true, repsSoFar: 100 })).toBe(false);
    expect(isWalled({ isPro: false, repsSoFar: 100, isCoupleMode: true })).toBe(false);
  });
});

describe('repsRemaining', () => {
  it('counts down to the wall', () => {
    expect(repsRemaining({ isPro: false, repsSoFar: 0 })).toBe(FREE_REP_LIMIT);
    expect(repsRemaining({ isPro: false, repsSoFar: 2 })).toBe(FREE_REP_LIMIT - 2);
    expect(repsRemaining({ isPro: false, repsSoFar: FREE_REP_LIMIT })).toBe(0);
    expect(repsRemaining({ isPro: false, repsSoFar: FREE_REP_LIMIT + 3 })).toBe(0);
  });

  it('is unbounded for Pro and couple mode', () => {
    expect(repsRemaining({ isPro: true, repsSoFar: 0 })).toBe(Number.POSITIVE_INFINITY);
    expect(repsRemaining({ isPro: false, repsSoFar: 0, isCoupleMode: true })).toBe(
      Number.POSITIVE_INFINITY,
    );
  });
});

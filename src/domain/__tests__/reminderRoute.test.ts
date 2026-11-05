import { FREE_REP_LIMIT } from '../hardPaywall';
import { reminderTapIsWalled } from '../reminderRoute';

const past = { repsSoFar: FREE_REP_LIMIT + 10, billingReady: true };

describe('reminderTapIsWalled', () => {
  it('walls a free athlete past the allowance once entitlement is known', () => {
    expect(reminderTapIsWalled({ proReady: true, isPro: false, bonusActive: false, ...past })).toBe(true);
  });

  it('does not wall while entitlement is still unresolved (cold start)', () => {
    expect(reminderTapIsWalled({ proReady: false, isPro: false, bonusActive: false, ...past })).toBe(false);
  });

  it('does not wall a subscriber', () => {
    expect(reminderTapIsWalled({ proReady: true, isPro: true, bonusActive: false, ...past })).toBe(false);
  });

  it('treats the pairing bonus as Pro', () => {
    expect(reminderTapIsWalled({ proReady: true, isPro: false, bonusActive: true, ...past })).toBe(false);
  });

  // Under FREE_REP_LIMIT = 50, a free athlete with 0 reps has free allowance left.
  it('does not wall a free athlete who has not used their free reps', () => {
    expect(
      reminderTapIsWalled({ proReady: true, isPro: false, bonusActive: false, repsSoFar: 0, billingReady: true }),
    ).toBe(false);
  });
});

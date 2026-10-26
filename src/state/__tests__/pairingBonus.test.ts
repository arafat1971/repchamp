import { selectFreeRepCeiling, selectPairingBonusActive, useProfileStore } from '@/state/profileStore';

describe('selectPairingBonusActive', () => {
  const now = 1_000_000_000_000;

  it('is inactive with no bonus', () => {
    expect(selectPairingBonusActive({ pairingBonusUntil: 0 }, now)).toBe(false);
  });

  it('is active while the bonus is in the future', () => {
    expect(selectPairingBonusActive({ pairingBonusUntil: now + 1 }, now)).toBe(true);
  });

  it('expires once the deadline passes', () => {
    expect(selectPairingBonusActive({ pairingBonusUntil: now - 1 }, now)).toBe(false);
    expect(selectPairingBonusActive({ pairingBonusUntil: now }, now)).toBe(false);
  });
});

describe('grantPairingBonus', () => {
  beforeEach(() => {
    useProfileStore.getState().reset();
  });

  it('grants free reps counted from today\'s total, once', () => {
    useProfileStore.setState({ lifetimeReps: 120 });
    useProfileStore.getState().grantPairingBonus(10);
    expect(selectFreeRepCeiling(useProfileStore.getState())).toBe(130);
    expect(useProfileStore.getState().pairingBonusClaimed).toBe(true);
    // No timed Pro any more.
    expect(useProfileStore.getState().pairingBonusUntil).toBe(0);

    // Leave and re-pair later: nothing more.
    useProfileStore.setState({ lifetimeReps: 500 });
    useProfileStore.getState().grantPairingBonus(10);
    expect(selectFreeRepCeiling(useProfileStore.getState())).toBe(130);
  });
});

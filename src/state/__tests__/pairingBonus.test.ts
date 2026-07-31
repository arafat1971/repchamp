import { selectPairingBonusActive, useProfileStore } from '@/state/profileStore';

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

  it('grants once and refuses leave/re-pair farming', () => {
    useProfileStore.getState().grantPairingBonus(7);
    const first = useProfileStore.getState().pairingBonusUntil;
    expect(first).toBeGreaterThan(Date.now());
    expect(useProfileStore.getState().pairingBonusClaimed).toBe(true);

    useProfileStore.setState({ pairingBonusUntil: 0 });
    useProfileStore.getState().grantPairingBonus(7);
    expect(useProfileStore.getState().pairingBonusUntil).toBe(0);
  });
});

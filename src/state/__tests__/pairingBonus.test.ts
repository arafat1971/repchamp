import { selectPairingBonusActive } from '@/state/profileStore';

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

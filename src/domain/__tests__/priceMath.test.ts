import { formatMoney, perDay, perSession, yearlySavingPercent } from '../priceMath';

describe('perDay', () => {
  it('divides a year by 365', () => {
    expect(perDay(365)).toBe(1);
    expect(perDay(36.5)).toBeCloseTo(0.1, 5);
  });
});

describe('perSession', () => {
  it('divides a year by the sessions the athlete promised', () => {
    expect(perSession(520, 5)).toBe(2); // 5 days x 52 weeks = 260 sessions
    expect(perSession(364, 7)).toBe(1);
  });

  it('clamps days per week so it can never divide by zero or go negative', () => {
    expect(perSession(104, 0)).toBe(2);
    expect(perSession(104, -3)).toBe(2);
    expect(perSession(364, 99)).toBe(1);
    expect(Number.isFinite(perSession(100, 0))).toBe(true);
  });

  it('gets cheaper per session the more often they train', () => {
    expect(perSession(300, 6)).toBeLessThan(perSession(300, 2));
  });
});

describe('yearlySavingPercent', () => {
  it('is the real gap between twelve months of monthly and the yearly price', () => {
    expect(yearlySavingPercent(10, 60)).toBe(50);
    expect(yearlySavingPercent(10, 90)).toBe(25);
  });

  it('never claims a saving that is not there', () => {
    expect(yearlySavingPercent(10, 120)).toBe(0);
    expect(yearlySavingPercent(10, 150)).toBe(0);
    expect(yearlySavingPercent(0, 60)).toBe(0);
    expect(yearlySavingPercent(10, 0)).toBe(0);
    expect(yearlySavingPercent(Number.NaN, 60)).toBe(0);
  });

  it('caps at 99, so a free yearly plan cannot read as 100% off', () => {
    expect(yearlySavingPercent(10, 0.01)).toBe(99);
  });
});

describe('formatMoney', () => {
  it('includes the amount and survives an unknown currency without throwing', () => {
    expect(formatMoney(1.5, 'USD')).toContain('1.50');
    expect(() => formatMoney(1.5, 'NOT-A-CURRENCY')).not.toThrow();
    expect(formatMoney(1.5, 'NOT-A-CURRENCY')).toContain('1.50');
  });

  it('drops the cents on large amounts, where they are noise', () => {
    expect(formatMoney(7100, 'BDT')).not.toContain('.00');
  });

  it('returns nothing for a non-finite amount rather than printing NaN', () => {
    expect(formatMoney(Number.NaN, 'USD')).toBe('');
  });
});

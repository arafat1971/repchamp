import { bindAction } from '@/domain/bondScope';

describe('bindAction', () => {
  it('keeps history for the same pairing, or when there is none', () => {
    expect(bindAction('AB12', 'AB12')).toBe('keep');
    expect(bindAction('AB12', '')).toBe('keep');
  });
  it('adopts history written before owners existed', () => {
    expect(bindAction('', 'AB12')).toBe('adopt');
  });
  it('clears history when the partner changes', () => {
    expect(bindAction('AB12', 'ZZ99')).toBe('reset');
  });
});

import {
  isValidEmail,
  isValidPassword,
  isValidUsername,
  normalizeEmail,
  normalizeUsername,
  passwordError,
  sanitizeDisplayName,
  usernameError,
} from '../input';

describe('username', () => {
  it('normalizes @ and case', () => {
    expect(normalizeUsername('  @Champ_1  ')).toBe('champ_1');
  });

  it('accepts 3–20 [a-z0-9_]', () => {
    expect(isValidUsername('abc')).toBe(true);
    expect(isValidUsername('a'.repeat(20))).toBe(true);
    expect(isValidUsername('ab')).toBe(false);
    expect(isValidUsername('a'.repeat(21))).toBe(false);
    expect(isValidUsername('Bad Name')).toBe(false);
    expect(isValidUsername('admin')).toBe(false);
  });

  it('returns a clear error string', () => {
    expect(usernameError('')).toMatch(/Pick/);
    expect(usernameError('ab')).toMatch(/At least/);
  });
});

describe('email', () => {
  it('normalizes and validates', () => {
    expect(normalizeEmail('  A@B.Co  ')).toBe('a@b.co');
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('nope')).toBe(false);
  });
});

describe('password', () => {
  it('requires 8–128 chars for new accounts', () => {
    expect(isValidPassword('short')).toBe(false);
    expect(isValidPassword('longenough')).toBe(true);
    expect(passwordError('short')).toMatch(/8/);
  });
});

describe('displayName', () => {
  it('trims, collapses spaces, and caps length', () => {
    expect(sanitizeDisplayName('  Ace   Champ  ')).toBe('Ace Champ');
    expect(sanitizeDisplayName('x'.repeat(50)).length).toBe(40);
    expect(sanitizeDisplayName('   ')).toBe('Champion');
  });
});

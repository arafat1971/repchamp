import {
  ACTIVE_WINDOW_MS,
  invitePresentation,
  isRecentlyActive,
  parseInviteKind,
} from '../presence';

describe('isRecentlyActive', () => {
  const now = 1_700_000_000_000;

  it('is true inside the active window', () => {
    expect(isRecentlyActive(now - 60_000, now)).toBe(true);
  });

  it('is false when the stamp is older than the window', () => {
    expect(isRecentlyActive(now - ACTIVE_WINDOW_MS - 1, now)).toBe(false);
  });

  it('is false for missing or non-finite stamps', () => {
    expect(isRecentlyActive(null, now)).toBe(false);
    expect(isRecentlyActive(undefined, now)).toBe(false);
    expect(isRecentlyActive(Number.NaN, now)).toBe(false);
  });
});

describe('invitePresentation', () => {
  it('labels duel / train / compete distinctly', () => {
    expect(invitePresentation('duel').verb).toMatch(/duel/i);
    expect(invitePresentation('train').chip).toBe('Train together');
    expect(invitePresentation('compete').verb).toMatch(/compete/i);
  });

  it('falls back to train when cooperative and kind missing', () => {
    expect(invitePresentation(undefined, true).chip).toBe('Train together');
  });
});

describe('parseInviteKind', () => {
  it('accepts known kinds and defaults to duel', () => {
    expect(parseInviteKind('train')).toBe('train');
    expect(parseInviteKind('compete')).toBe('compete');
    expect(parseInviteKind('nope')).toBe('duel');
  });
});

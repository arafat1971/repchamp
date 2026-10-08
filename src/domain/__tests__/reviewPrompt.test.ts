import {
  REVIEW_COOLDOWN_DAYS,
  REVIEW_MAX_ASKS,
  REVIEW_MIN_SESSIONS,
  parseAsks,
  shouldAskForReview,
  type ReviewPromptInput,
} from '@/domain/reviewPrompt';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 9, 12);

const good: ReviewPromptInput = {
  now: NOW,
  sessionCount: REVIEW_MIN_SESSIONS,
  highlightTier: 'epic',
  lostDuel: false,
  proMomentShown: false,
  asks: [],
};

describe('shouldAskForReview', () => {
  it('asks at a rare or epic moment for an experienced athlete never asked', () => {
    expect(shouldAskForReview(good)).toBe(true);
    expect(shouldAskForReview({ ...good, highlightTier: 'rare' })).toBe(true);
  });

  it.each([
    ['an ordinary set', { highlightTier: null }],
    ['a merely good highlight', { highlightTier: 'good' as const }],
    ['too few sessions', { sessionCount: REVIEW_MIN_SESSIONS - 1 }],
    ['a lost duel', { lostDuel: true }],
    ['the Pro offer on screen', { proMomentShown: true }],
  ])('never asks for %s', (_name, patch) => {
    expect(shouldAskForReview({ ...good, ...patch })).toBe(false);
  });

  it('respects the cooldown, then asks again once it has passed', () => {
    const recent = NOW - (REVIEW_COOLDOWN_DAYS - 1) * DAY;
    const old = NOW - (REVIEW_COOLDOWN_DAYS + 1) * DAY;
    expect(shouldAskForReview({ ...good, asks: [recent] })).toBe(false);
    expect(shouldAskForReview({ ...good, asks: [old] })).toBe(true);
  });

  it('stops for good after the lifetime cap', () => {
    const asks = Array.from({ length: REVIEW_MAX_ASKS }, (_, i) => NOW - (400 + i * 100) * DAY);
    expect(shouldAskForReview({ ...good, asks })).toBe(false);
  });
});

describe('parseAsks', () => {
  it('reads a valid log and shrugs off anything else', () => {
    expect(parseAsks('[1,2,3]')).toEqual([1, 2, 3]);
    expect(parseAsks(null)).toEqual([]);
    expect(parseAsks('not json')).toEqual([]);
    expect(parseAsks('{"a":1}')).toEqual([]);
    expect(parseAsks('[1,"x",null,4]')).toEqual([1, 4]);
  });
});

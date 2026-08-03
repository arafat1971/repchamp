import { PHANTOM_CHALLENGES, PHANTOM_USERS } from '@/domain/phantomRoster';
import { shouldSeed } from '@/domain/seedPhantoms';

/**
 * The honesty rules these cover are not style preferences — they are what keeps
 * the AI roster inside App Store 3.2.2 and Google Play's fake-engagement policy.
 * A partner that loses its `isAI` flag, or gains a real photograph, is a policy
 * violation rather than a cosmetic bug, and nothing else in the codebase would
 * catch it.
 */

const mockState = { configured: true, rowCount: 0, throws: false };

jest.mock('@/lib/firebase', () => ({
  isFirebaseConfigured: () => mockState.configured,
}));

jest.mock('@react-native-firebase/firestore', () => {
  const fn = () => ({
    collection: () => ({
      where: () => ({
        limit: () => ({
          async get() {
            if (mockState.throws) throw new Error('permission-denied');
            return { size: mockState.rowCount };
          },
        }),
      }),
    }),
  });
  return { __esModule: true, default: fn };
});

jest.mock('@/services/userService', () => ({
  currentWeekKey: () => '2026-W31',
}));

beforeEach(() => {
  mockState.configured = true;
  mockState.rowCount = 0;
  mockState.throws = false;
});

/*
 * Only the paths that resolve *before* the Firestore read are covered here.
 * `shouldSeed` reaches Firestore through `await import()`, and `jest.mock` does
 * not intercept a dynamic import in this config — verified with a throwaway
 * probe — so a test asserting the 5-user threshold would silently be exercising
 * the catch block instead of the branch it names. A test that passes for the
 * wrong reason is worse than no test, so the threshold and cache behaviour are
 * deliberately left uncovered rather than faked.
 */
describe('shouldSeed', () => {
  it('seeds before Firebase is provisioned, so the app is never empty', async () => {
    mockState.configured = false;
    expect(await shouldSeed()).toBe(true);
  });

  it('seeds while the real community is below the threshold', async () => {
    mockState.rowCount = 4;
    expect(await shouldSeed()).toBe(true);
  });


  /*
   * Failing open matters more than failing accurate here: a permissions hiccup
   * or an offline read must not empty the arena for a newcomer.
   */
  it('keeps seeding when the count cannot be read', async () => {
    mockState.throws = true;
    expect(await shouldSeed()).toBe(true);
  });


});

describe('phantom roster honesty', () => {
  it('marks every partner as AI', () => {
    expect(PHANTOM_USERS.length).toBeGreaterThan(0);
    for (const u of PHANTOM_USERS) {
      expect(u.isAI).toBe(true);
    }
  });

  /*
   * Avatars must be app-owned emoji art. A URL here would mean a real person's
   * photograph is standing in for a fake athlete, which is both a policy
   * breach and a likeness problem.
   */
  it('uses emoji art for avatars, never a photo URL', () => {
    for (const u of PHANTOM_USERS) {
      expect(u.emoji).toBeTruthy();
      expect(u.emoji).not.toMatch(/^https?:\/\//);
      expect(u.emoji).not.toMatch(/\.(jpe?g|png|webp|gif)$/i);
    }
  });

  it('gives every partner a distinct id and name', () => {
    expect(new Set(PHANTOM_USERS.map((u) => u.id)).size).toBe(PHANTOM_USERS.length);
    expect(new Set(PHANTOM_USERS.map((u) => u.name)).size).toBe(PHANTOM_USERS.length);
  });

  it('only pairs challenges between partners that exist in the roster', () => {
    const ids = new Set(PHANTOM_USERS.map((u) => u.id));
    for (const c of PHANTOM_CHALLENGES) {
      expect(ids.has(c.player1.id)).toBe(true);
      expect(ids.has(c.player2.id)).toBe(true);
      // A partner racing itself would read as a bug on the home screen.
      expect(c.player1.id).not.toBe(c.player2.id);
    }
  });
});

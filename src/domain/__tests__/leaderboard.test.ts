import { evaluateAchievements } from '../achievements';
import { buildLeaderboard } from '../leaderboard';
import type { SessionSummary } from '@/state/profileStore';

function session(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: 'x',
    exercise: 'push',
    mode: 'versus',
    reps: 12,
    opponentReps: 9,
    opponentId: 'adrian',
    target: null,
    won: true,
    xp: 200,
    formScore: 88,
    durationSec: 20,
    completedAt: new Date().toISOString(),
    day: '2026-07-22',
    ...overrides,
  };
}

describe('buildLeaderboard', () => {
  it('places a brand-new athlete last', () => {
    const board = buildLeaderboard(0, 'Ada');
    expect(board[board.length - 1]?.isYou).toBe(true);
  });

  it('puts a high scorer at the top', () => {
    const board = buildLeaderboard(99_999, 'Ada');
    expect(board[0]?.isYou).toBe(true);
    expect(board[0]?.rank).toBe(1);
  });

  it('ranks every row uniquely and in order', () => {
    const board = buildLeaderboard(2000, 'Ada');
    board.forEach((row, i) => expect(row.rank).toBe(i + 1));
  });

  it('breaks ties in the athlete favour', () => {
    // Dani sits on exactly 2180.
    const board = buildLeaderboard(2180, 'Ada');
    const you = board.findIndex((r) => r.isYou);
    const dani = board.findIndex((r) => r.id === 'dani');
    expect(you).toBeLessThan(dani);
  });

  it('improves rank as weekly XP grows', () => {
    const low = buildLeaderboard(500, 'Ada').find((r) => r.isYou)!.rank;
    const high = buildLeaderboard(3000, 'Ada').find((r) => r.isYou)!.rank;
    expect(high).toBeLessThan(low);
  });
});

describe('evaluateAchievements', () => {
  const base = { sessions: [], bestStreak: 0, weeklyXp: 0 };

  it('reports nothing earned for a new account', () => {
    const result = evaluateAchievements(base);
    expect(result.every((a) => !a.earned)).toBe(true);
  });

  it('unlocks First Win after one won duel', () => {
    const result = evaluateAchievements({ ...base, sessions: [session()] });
    expect(result.find((a) => a.id === 'first-win')?.earned).toBe(true);
  });

  it('does not unlock First Win from a loss', () => {
    const result = evaluateAchievements({ ...base, sessions: [session({ won: false })] });
    expect(result.find((a) => a.id === 'first-win')?.earned).toBe(false);
  });

  it('tracks the best single session for Century', () => {
    const result = evaluateAchievements({
      ...base,
      sessions: [session({ reps: 64 }), session({ reps: 31 })],
    });
    const century = result.find((a) => a.id === 'century');
    expect(century?.current).toBe(64);
    expect(century?.earned).toBe(false);
    expect(century?.label).toBe('64/100');
  });

  it('unlocks Champion on reaching Gold', () => {
    const result = evaluateAchievements({ ...base, weeklyXp: 2600 });
    const champion = result.find((a) => a.id === 'champion');
    expect(champion?.earned).toBe(true);
    expect(champion?.label).toBe('Gold');
  });

  it('sorts earned badges first', () => {
    const result = evaluateAchievements({ ...base, sessions: [session()] });
    expect(result[0]?.earned).toBe(true);
  });
});

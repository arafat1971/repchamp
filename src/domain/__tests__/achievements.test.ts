import { ACHIEVEMENTS, evaluateAchievements, type AchievementInput } from '@/domain/achievements';
import { LEAGUES } from '@/domain/progression';
import type { SessionSummary } from '@/state/profileStore';
import type { ExerciseId } from '@/vision/exercises';

function session(over: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: 's1',
    exercise: 'push' as ExerciseId,
    mode: 'practice',
    reps: 10,
    opponentReps: null,
    opponentId: null,
    target: null,
    won: false,
    xp: 40,
    formScore: 70,
    durationSec: 60,
    completedAt: '2026-08-01T09:00:00.000Z',
    day: '2026-08-01',
    ...over,
  } as SessionSummary;
}

function build(over: Partial<AchievementInput> = {}) {
  return evaluateAchievements({ sessions: [], bestStreak: 0, weeklyXp: 0, ...over });
}

const byId = (input: Partial<AchievementInput>, id: string) =>
  build(input).find((a) => a.id === id)!;

describe('evaluateAchievements', () => {
  it('earns nothing on a fresh account', () => {
    expect(build().every((a) => !a.earned)).toBe(true);
  });

  it('counts only won versus sets toward duel badges', () => {
    const sessions = [
      session({ mode: 'versus', won: true }),
      session({ mode: 'versus', won: false }),
      // A practice PB is not a duel win, however good it was.
      session({ mode: 'practice', won: true }),
    ];
    expect(byId({ sessions }, 'first-win').current).toBe(1);
    expect(byId({ sessions }, 'first-win').earned).toBe(true);
    expect(byId({ sessions }, 'duel-master').earned).toBe(false);
  });

  it('takes the best single session, not the total, for rep and form badges', () => {
    const sessions = [
      session({ reps: 60, formScore: 80 }),
      session({ reps: 40, formScore: 96 }),
    ];
    // 60 + 40 would wrongly earn Century; the badge is 100 reps in ONE session.
    expect(byId({ sessions }, 'century').current).toBe(60);
    expect(byId({ sessions }, 'century').earned).toBe(false);
    expect(byId({ sessions }, 'perfect-form').earned).toBe(true);
  });

  it('sorts earned badges ahead of unearned ones', () => {
    const list = build({ bestStreak: 5 });
    const firstUnearned = list.findIndex((a) => !a.earned);
    expect(list.slice(0, firstUnearned).every((a) => a.earned)).toBe(true);
    expect(list.slice(firstUnearned).some((a) => a.earned)).toBe(false);
  });

  it('caps the progress label at the goal but leaves `current` honest', () => {
    const streak = byId({ bestStreak: 42 }, 'streak-3');
    expect(streak.label).toBe('3/3');
    expect(streak.current).toBe(42);
  });

  it('labels the champion badge with the league name rather than a ratio', () => {
    expect(byId({ weeklyXp: 0 }, 'champion').label).toBe('Bronze');
    expect(byId({ weeklyXp: 2500 }, 'champion').label).toBe('Gold');
  });

  it('earns Champion at Gold and holds it above', () => {
    expect(byId({ weeklyXp: 2499 }, 'champion').earned).toBe(false);
    expect(byId({ weeklyXp: 2500 }, 'champion').earned).toBe(true);
    expect(byId({ weeklyXp: 99999 }, 'champion').earned).toBe(true);
  });

  /*
   * The champion badge maps a league id to a rank through a list of ids written
   * out inside achievements.ts, separate from LEAGUES itself. `indexOf` returns
   * -1 for anything missing, which would silently score a real league as 0 —
   * the athlete would simply never earn the badge, with nothing to debug.
   *
   * This fails the moment a league is added or renamed without updating that
   * second copy, which is the only warning that duplication will ever give.
   */
  it('scores every defined league, so the id list cannot drift from LEAGUES', () => {
    for (const league of LEAGUES) {
      const badge = byId({ weeklyXp: league.minWeeklyXp }, 'champion');
      expect(badge.current).toBeGreaterThan(0);
      expect(badge.label).toBe(league.name);
    }
  });

  it('returns one entry per definition, with no duplicate ids', () => {
    const list = build();
    expect(list).toHaveLength(ACHIEVEMENTS.length);
    expect(new Set(list.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });
});

/*
 * A badge must describe what it actually measures.
 *
 * `streak-3` read "Train 3 days in a row" while its progress is `bestStreak`,
 * and both streak functions deliberately keep a run alive across one rest day —
 * so Monday/Wednesday/Friday unlocked a badge for three consecutive days that
 * were never consecutive. The module contract is that the profile never shows a
 * badge the athlete has not earned, and this was the definition breaking it.
 */
describe('badge text matches what the badge measures', () => {
  const streakBadge = () => {
    const found = ACHIEVEMENTS.find((a) => a.id === 'streak-3');
    if (!found) throw new Error('streak-3 badge missing');
    return found;
  };

  it('does not promise consecutive days when a rest day counts', () => {
    expect(streakBadge().description.toLowerCase()).not.toContain('in a row');
  });

  it('says that a rest day keeps the streak alive', () => {
    expect(streakBadge().description.toLowerCase()).toContain('rest day');
  });

  /* The streak rule itself is deliberately unchanged: tightening it would also
     revoke badges already earned, and `selectBestStreak`'s tests argue for the
     rest-day tolerance on its own terms. Only the wording moved. */
  it('still unlocks at a streak of 3', () => {
    const badge = streakBadge();
    expect(badge.goal).toBe(3);
    expect(badge.progress({ sessions: [], bestStreak: 3, weeklyXp: 0 })).toBe(3);
  });
});

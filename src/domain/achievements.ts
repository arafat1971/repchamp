import type { SessionSummary } from '@/state/profileStore';

import { leagueFromWeeklyXp } from './progression';

export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
  emoji: string;
  /** Value needed to unlock. */
  goal: number;
  /** Current progress toward `goal`, given the athlete's history. */
  progress: (input: AchievementInput) => number;
  /** Rendered as a label instead of "n/goal" when set, e.g. "Silver". */
  progressLabel?: (input: AchievementInput) => string;
}

export interface AchievementInput {
  sessions: readonly SessionSummary[];
  bestStreak: number;
  weeklyXp: number;
}

export interface Achievement extends Omit<AchievementDefinition, 'progress' | 'progressLabel'> {
  current: number;
  earned: boolean;
  label: string;
}

/**
 * Badge definitions. Each one derives its progress from real session history so
 * the profile can never show a badge the athlete has not actually earned.
 */
export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  {
    id: 'first-win',
    title: 'First Win',
    description: 'Win your first duel',
    emoji: '🥇',
    goal: 1,
    progress: ({ sessions }) => sessions.filter((s) => s.mode === 'versus' && s.won).length,
  },
  {
    id: 'streak-3',
    title: '3-Day Streak',
    description: 'Train 3 days in a row',
    emoji: '🔥',
    goal: 3,
    progress: ({ bestStreak }) => bestStreak,
  },
  {
    id: 'century',
    title: 'Century',
    description: 'Do 100 reps in one session',
    emoji: '💯',
    goal: 100,
    progress: ({ sessions }) => sessions.reduce((max, s) => Math.max(max, s.reps), 0),
  },
  {
    id: 'duel-master',
    title: 'Duel Master',
    description: 'Win 25 duels',
    emoji: '🏆',
    goal: 25,
    progress: ({ sessions }) => sessions.filter((s) => s.mode === 'versus' && s.won).length,
  },
  {
    id: 'perfect-form',
    title: 'Perfect Form',
    description: 'Finish a session with a form score of 95+',
    emoji: '🎯',
    goal: 95,
    progress: ({ sessions }) => sessions.reduce((max, s) => Math.max(max, s.formScore), 0),
  },
  {
    id: 'champion',
    title: 'Champion',
    description: 'Reach the Gold League',
    emoji: '👑',
    goal: 3,
    progress: ({ weeklyXp }) => {
      const order = ['bronze', 'silver', 'gold', 'platinum'];
      return order.indexOf(leagueFromWeeklyXp(weeklyXp).id) + 1;
    },
    progressLabel: ({ weeklyXp }) => leagueFromWeeklyXp(weeklyXp).name,
  },
];

/** Resolves every badge against the athlete's history, earned ones first. */
export function evaluateAchievements(input: AchievementInput): Achievement[] {
  return ACHIEVEMENTS.map((definition) => {
    const current = definition.progress(input);
    const earned = current >= definition.goal;

    return {
      id: definition.id,
      title: definition.title,
      description: definition.description,
      emoji: definition.emoji,
      goal: definition.goal,
      current,
      earned,
      label: definition.progressLabel
        ? definition.progressLabel(input)
        : `${Math.min(current, definition.goal)}/${definition.goal}`,
    };
  }).sort((a, b) => Number(b.earned) - Number(a.earned));
}

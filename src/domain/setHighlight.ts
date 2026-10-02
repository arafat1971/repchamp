import type { SessionSummary } from '@/state/profileStore';

/**
 * The one true thing worth celebrating after a set.
 *
 * Short-video feeds hold people because each swipe might pay off, and the payoff
 * is never the same twice. A workout has the same property if it is surfaced:
 * most sets are ordinary, some are a personal best, some close a streak
 * milestone. This picks the rarest *genuine* fact about the set just finished,
 * so the result screen has a moment the athlete can't predict — without
 * inventing one. Every line is checkable against their own history, and an
 * ordinary set returns null instead of being dressed up.
 */
export type HighlightTier = 'good' | 'rare' | 'epic';

export interface SetHighlight {
  tier: HighlightTier;
  emoji: string;
  title: string;
  body: string;
}

const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365];

/**
 * `sessions` is the history *including* the set just finished, newest first
 * (the order the profile store keeps). `streak` is the streak after that set.
 */
export function setHighlight(
  sessions: readonly SessionSummary[],
  streak: number,
  exerciseLabel: string,
): SetHighlight | null {
  const latest = sessions[0];
  if (!latest || latest.reps <= 0) return null;

  const earlier = sessions.slice(1);
  const sameExercise = earlier.filter((s) => s.exercise === latest.exercise);
  const priorBest = sameExercise.reduce((m, s) => Math.max(m, s.reps), 0);
  const firstOfDay = !earlier.some((s) => s.day === latest.day);

  if (firstOfDay && STREAK_MILESTONES.includes(streak)) {
    return {
      tier: 'epic',
      emoji: '🔥',
      title: `${streak}-day streak`,
      body: `${streak} days in a row. Fewer than most people ever reach — keep it lit.`,
    };
  }

  if (sameExercise.length >= 1 && latest.reps > priorBest) {
    const gain = latest.reps - priorBest;
    return {
      tier: 'epic',
      emoji: '🏆',
      title: 'New personal best',
      body: `${latest.reps} ${exerciseLabel} — ${gain} more than your previous best of ${priorBest}.`,
    };
  }

  const dayReps = sessions
    .filter((s) => s.day === latest.day)
    .reduce((n, s) => n + s.reps, 0);
  const bestOtherDay = bestDayReps(earlier.filter((s) => s.day !== latest.day));
  if (bestOtherDay > 0 && dayReps > bestOtherDay) {
    return {
      tier: 'rare',
      emoji: '⚡',
      title: 'Your biggest day yet',
      body: `${dayReps} reps today, past your old best day of ${bestOtherDay}.`,
    };
  }

  if (latest.formScore >= 90 && latest.reps >= 5) {
    return {
      tier: 'rare',
      emoji: '🎯',
      title: 'Textbook form',
      body: `A form score of ${Math.round(latest.formScore)} over ${latest.reps} reps.`,
    };
  }

  if (firstOfDay && sameExercise.length >= 1) {
    const previous = sameExercise[0];
    if (previous && latest.reps > previous.reps) {
      return {
        tier: 'good',
        emoji: '📈',
        title: 'Beat your last set',
        body: `${latest.reps} vs ${previous.reps} last time.`,
      };
    }
  }

  return null;
}

function bestDayReps(sessions: readonly SessionSummary[]): number {
  const byDay = new Map<string, number>();
  for (const s of sessions) byDay.set(s.day, (byDay.get(s.day) ?? 0) + s.reps);
  let best = 0;
  for (const v of byDay.values()) best = Math.max(best, v);
  return best;
}

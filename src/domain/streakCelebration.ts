/**
 * The full-screen streak milestone celebration — the Duolingo moment.
 *
 * Hitting 7 days in a row is the point where a streak starts to matter to
 * someone, and it is the single most shared moment in habit apps: a big
 * number, earned, that says something about the person. So it gets its own
 * screen once per milestone, with a share card, instead of a chip on the
 * result screen nobody reads twice.
 *
 * Pure: which streak to celebrate, and what to say about it.
 */

import { daysBetween } from './retention';
import { STREAK_MILESTONES } from './consistency';

/** The last celebration, persisted so each milestone shows once per run. */
export interface StreakCelebrated {
  streak: number;
  day: string;
}

/**
 * The milestone to celebrate after today's set, or null.
 *
 * A milestone shows once per run. The same number may come round again only
 * after the streak broke and was rebuilt — that is, when the last celebration
 * of it lies before the start of the current run.
 */
export function milestoneToCelebrate(input: {
  streak: number;
  today: string;
  last: StreakCelebrated | null;
}): number | null {
  const { streak, today, last } = input;
  if (!(STREAK_MILESTONES as readonly number[]).includes(streak)) return null;
  if (last && last.streak === streak && daysBetween(last.day, today) < streak) return null;
  return streak;
}

/** The milestone after this one, for "next: 14 days". Null past the last. */
export function nextMilestoneAfter(streak: number): number | null {
  return STREAK_MILESTONES.find((m) => m > streak) ?? null;
}

/** Words for the celebration. Honest: no invented "top 5%" claims. */
export function celebrationCopy(streak: number): { title: string; line: string; share: string } {
  const title = `${streak}-day streak!`;
  const line =
    streak <= 3
      ? 'Three days in a row. This is how habits start.'
      : streak <= 7
        ? 'A full week without missing a day.'
        : streak <= 14
          ? 'Two weeks straight. It is a habit now.'
          : streak <= 30
            ? 'A whole month of showing up.'
            : streak <= 100
              ? `${streak} days. Most people never get here.`
              : `${streak} days. That is who you are now.`;
  return {
    title,
    line,
    share: `${streak} days in a row on RepChamp 🔥 Every rep counted by my phone camera.`,
  };
}

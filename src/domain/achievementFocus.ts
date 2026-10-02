import type { Achievement } from '@/domain/achievements';

/** 0–100, how far an achievement is from unlocking. */
export function achievementPercent(a: Pick<Achievement, 'current' | 'goal' | 'earned'>): number {
  if (a.earned) return 100;
  if (a.goal <= 0) return 0;
  return Math.max(0, Math.min(99, Math.floor((a.current / a.goal) * 100)));
}

/**
 * The badge worth chasing next: the unearned one that is furthest along.
 *
 * Ties go to the earlier definition, so the answer is stable between renders.
 * Null when everything is earned — the screen then celebrates instead of nudging.
 */
export function nextUp(achievements: readonly Achievement[]): Achievement | null {
  let best: Achievement | null = null;
  let bestPct = -1;
  for (const a of achievements) {
    if (a.earned) continue;
    const pct = achievementPercent(a);
    if (pct > bestPct) {
      best = a;
      bestPct = pct;
    }
  }
  return best;
}

/** What is left to do, in the badge's own units — "7 to go". Null once earned. */
export function remainingLabel(a: Pick<Achievement, 'current' | 'goal' | 'earned'>): string | null {
  if (a.earned) return null;
  const left = Math.max(0, a.goal - a.current);
  return `${left.toLocaleString()} to go`;
}

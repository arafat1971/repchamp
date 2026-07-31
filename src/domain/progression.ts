/**
 * XP, levels, leagues and streaks.
 *
 * The prototype hard-coded these ("Level 7", "Silver", "3 day streak"); here
 * they're derived from real session history so the numbers stay honest.
 */

/** XP required to advance one level. The prototype's bar reads "x / 1,000". */
export const XP_PER_LEVEL = 1000;

export type LeagueId = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface League {
  id: LeagueId;
  name: string;
  emoji: string;
  /** Minimum weekly XP to sit in this league. */
  minWeeklyXp: number;
}

export const LEAGUES: readonly League[] = [
  { id: 'bronze', name: 'Bronze', emoji: '🥉', minWeeklyXp: 0 },
  { id: 'silver', name: 'Silver', emoji: '🥈', minWeeklyXp: 800 },
  { id: 'gold', name: 'Gold', emoji: '🥇', minWeeklyXp: 2500 },
  { id: 'platinum', name: 'Platinum', emoji: '💎', minWeeklyXp: 5000 },
];

/** Rank titles shown beside the crown on the home card. */
const RANK_TITLES = [
  'Rookie',
  'Contender',
  'Challenger',
  'Champion',
  'Legend',
] as const;

export interface LevelProgress {
  level: number;
  /** XP accumulated within the current level, 0..XP_PER_LEVEL. */
  xpInLevel: number;
  xpToNextLevel: number;
  /** 0..100, for the progress bar width. */
  percent: number;
  nextLevel: number;
  rankName: string;
}

export function levelFromXp(totalXp: number): LevelProgress {
  const safeXp = Math.max(0, Math.floor(totalXp));
  const level = Math.floor(safeXp / XP_PER_LEVEL) + 1;
  const xpInLevel = safeXp % XP_PER_LEVEL;
  const rankIndex = Math.min(RANK_TITLES.length - 1, Math.floor((level - 1) / 3));

  return {
    level,
    xpInLevel,
    xpToNextLevel: XP_PER_LEVEL - xpInLevel,
    percent: Math.round((xpInLevel / XP_PER_LEVEL) * 100),
    nextLevel: level + 1,
    rankName: RANK_TITLES[rankIndex] as string,
  };
}

export function leagueFromWeeklyXp(weeklyXp: number): League {
  let current = LEAGUES[0] as League;
  for (const league of LEAGUES) {
    if (weeklyXp >= league.minWeeklyXp) current = league;
  }
  return current;
}

export type SessionMode = 'versus' | 'solo' | 'practice' | 'together';

/**
 * XP awarded for a finished session. Mirrors the prototype's payouts:
 * a won duel pays 200, a cleared daily target 300, practice a flat 40.
 *
 * A `together` set pays the duel rate flat, win or lose, because there is no
 * loser: it is cooperative, and taxing the partner who managed fewer reps would
 * punish exactly the person the mode exists to keep showing up.
 */
export function xpForSession(
  mode: SessionMode,
  won: boolean,
  opts?: { drew?: boolean; reps?: number; forfeited?: boolean },
): number {
  // Give-up / empty sets must not farm XP or weekly board.
  if (opts?.forfeited || (opts?.reps != null && opts.reps <= 0)) return 0;

  switch (mode) {
    case 'practice':
      return 40;
    case 'solo':
      return won ? 300 : 80;
    case 'versus':
      if (opts?.drew) return 100;
      return won ? 200 : 60;
    case 'together':
      return 200;
  }
}

/**
 * Recomputes a streak given the days the athlete trained.
 *
 * Rest days do not break a streak — the prototype's Rest Day screen promises
 * exactly that — so the streak survives a single missed day but not two.
 */
export function calculateStreak(trainedDays: readonly string[], today: string): number {
  if (trainedDays.length === 0) return 0;

  const days = new Set(trainedDays);
  const cursor = new Date(`${today}T00:00:00Z`);
  if (Number.isNaN(cursor.getTime())) return 0;

  let streak = 0;
  let missesAllowed = 1;

  // Walk backwards from today, tolerating one gap before giving up.
  for (let i = 0; i < 400; i++) {
    const key = cursor.toISOString().slice(0, 10);
    if (days.has(key)) {
      streak += 1;
      missesAllowed = 1;
    } else if (i > 0 && missesAllowed > 0) {
      missesAllowed -= 1;
    } else if (i > 0) {
      break;
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return streak;
}

/** ISO `YYYY-MM-DD` in local time — the key format used for streak days. */
export function dayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * The last `n` day keys ending today, oldest first — for the who-trained-which-day
 * strip on the couple card. `n = 7` gives a rolling week.
 */
export function lastNDayKeys(n: number, today: Date = new Date()): string[] {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    keys.push(dayKey(d));
  }
  return keys;
}

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

/**
 * Single weekday letter for an ISO `YYYY-MM-DD` day key.
 * Uses noon local time so DST edges don't shift the calendar day.
 */
export function weekdayLetter(isoDay: string): string {
  const d = new Date(`${isoDay}T12:00:00`);
  return WEEKDAY_LETTERS[d.getDay()] ?? '?';
}

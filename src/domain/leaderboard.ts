export interface LeaderboardRow {
  id: string;
  name: string;
  initial: string;
  xp: number;
  level: number;
  background: string;
  color: string;
  rank: number;
  isYou: boolean;
  /** Remote headshot URL (phantom/cloud users). */
  avatarUri?: string;
}

/**
 * Rival XP totals for the weekly board.
 *
 * These are fixed rather than random so the athlete's rank moves only when
 * *they* earn XP — a leaderboard that reshuffles on every render teaches
 * nothing about whether the last session helped.
 *
 * Replace with a server query once multiplayer lands; `buildLeaderboard` is the
 * only thing the UI depends on.
 */
const RIVALS: readonly Omit<LeaderboardRow, 'rank' | 'isYou'>[] = [
  { id: 'mia', name: 'Mia', initial: 'M', xp: 4120, level: 7, background: '#fde68a', color: '#92400e' },
  { id: 'adrian', name: 'Ada', initial: 'A', xp: 3880, level: 4, background: '#ddd6fe', color: '#5b21b6' },
  { id: 'zheng', name: 'Zara', initial: 'Z', xp: 3540, level: 6, background: '#bfdbfe', color: '#1e40af' },
  { id: 'lena', name: 'Lena', initial: 'L', xp: 2910, level: 5, background: '#fecdd3', color: '#be123c' },
  { id: 'kojo', name: 'Kojo', initial: 'K', xp: 2640, level: 4, background: '#bbf7d0', color: '#15803d' },
  { id: 'dani', name: 'Dani', initial: 'D', xp: 2180, level: 3, background: '#e9d5ff', color: '#7c3aed' },
  { id: 'noor', name: 'Noor', initial: 'N', xp: 1740, level: 3, background: '#bae6fd', color: '#0369a1' },
  { id: 'sam', name: 'Sam', initial: 'S', xp: 1210, level: 2, background: '#fed7aa', color: '#c2410c' },
  { id: 'ines', name: 'Inès', initial: 'I', xp: 860, level: 2, background: '#d9f99d', color: '#4d7c0f' },
  { id: 'theo', name: 'Théo', initial: 'T', xp: 430, level: 1, background: '#e2e8f0', color: '#475569' },
];

/**
 * Merges the athlete into the rival board and ranks everyone by weekly XP.
 *
 * Ties are broken in the athlete's favour, so hitting exactly a rival's total
 * shows as overtaking them rather than sitting behind.
 */
export function buildLeaderboard(weeklyXp: number, username: string): LeaderboardRow[] {
  const you: Omit<LeaderboardRow, 'rank' | 'isYou'> = {
    id: '__you__',
    name: username,
    initial: (username || 'Y').charAt(0).toUpperCase(),
    xp: weeklyXp,
    level: 1,
    background: '#22C55E',
    color: '#ffffff',
  };

  return [...RIVALS, you]
    .sort((a, b) => {
      if (b.xp !== a.xp) return b.xp - a.xp;
      if (a.id === '__you__') return -1;
      if (b.id === '__you__') return 1;
      return 0;
    })
    .map((row, index) => ({ ...row, rank: index + 1, isYou: row.id === '__you__' }));
}

/** How many places the podium has. */
export const PODIUM_SIZE = 3;

/**
 * The podium's three places, in rank order, with `null` for a place nobody
 * has earned yet.
 *
 * Only rows with XP this week can stand on it. On a Monday every weekly total
 * has reset to zero, and ranking a field of zeros crowned whoever won the tie
 * (the athlete, since ties go their way) as #1 for doing nothing. An open
 * place says something true instead: it is there for the taking.
 */
export function podiumOf<T extends Pick<LeaderboardRow, 'xp'>>(board: readonly T[]): (T | null)[] {
  const earned = board.filter((row) => row.xp > 0).slice(0, PODIUM_SIZE);
  return Array.from({ length: PODIUM_SIZE }, (_, i) => earned[i] ?? null);
}

/** One line on where the athlete stands this week. */
export function standingLine(you: Pick<LeaderboardRow, 'rank' | 'xp'>): string {
  if (you.xp <= 0) return 'Finish a set this week to get ranked';
  return `You're #${you.rank} with ${you.xp.toLocaleString()} XP this week`;
}

/**
 * The weekly list as it should read: athletes with XP this week, ranked 1..n,
 * then the idle rows `keepIdle` wants kept, unranked (`rank: 0`), at the end.
 *
 * A row with no XP has not taken a place, so it gets no number. On the global
 * board that drops a wall of zero-XP strangers (most still on the placeholder
 * name, so identical); among friends, idle friends stay listed, just unranked.
 */
export function rankedBoard<T extends Pick<LeaderboardRow, 'xp' | 'rank'>>(
  rows: readonly T[],
  keepIdle: (row: T) => boolean,
): T[] {
  const earned = rows.filter((row) => row.xp > 0).map((row, i) => ({ ...row, rank: i + 1 }));
  const idle = rows.filter((row) => row.xp <= 0 && keepIdle(row)).map((row) => ({ ...row, rank: 0 }));
  return [...earned, ...idle];
}

import { LEAGUES, leagueFromWeeklyXp, type League } from '@/domain/progression';

export type LeagueDivision = 'I' | 'II' | 'III';

export type LeagueProgress = {
  league: League;
  /** Sub-tier inside the current league band. */
  division: LeagueDivision;
  /** Display like "Bronze II". */
  title: string;
  weeklyXp: number;
  /** Next league, or null at Platinum. */
  nextLeague: League | null;
  /** XP still needed to reach the next league. */
  xpToNext: number;
  /** 0..1 progress through the current league band. */
  fill: number;
};

const DIVISIONS: readonly LeagueDivision[] = ['I', 'II', 'III'];

/**
 * Game-style league readout: Bronze II, XP to Silver, fill for the XP bar.
 *
 * Each league band is split into three equal divisions so climbing feels
 * granular before the next named league unlocks.
 */
export function leagueProgressFromWeeklyXp(weeklyXp: number): LeagueProgress {
  const safe = Math.max(0, Math.floor(weeklyXp));
  const league = leagueFromWeeklyXp(safe);
  const index = LEAGUES.findIndex((l) => l.id === league.id);
  const nextLeague = index >= 0 && index < LEAGUES.length - 1 ? (LEAGUES[index + 1] as League) : null;
  const floor = league.minWeeklyXp;
  const ceiling = nextLeague?.minWeeklyXp ?? floor + 1000;
  const span = Math.max(1, ceiling - floor);
  const into = Math.min(span, Math.max(0, safe - floor));
  const fill = into / span;
  const third = span / 3;
  const divisionIndex = Math.min(2, Math.floor(into / third));
  const division = DIVISIONS[divisionIndex] as LeagueDivision;

  return {
    league,
    division,
    title: `${league.name} ${division}`,
    weeklyXp: safe,
    nextLeague,
    xpToNext: nextLeague ? Math.max(0, nextLeague.minWeeklyXp - safe) : 0,
    fill,
  };
}

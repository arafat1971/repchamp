import {
  XP_PER_LEVEL,
  calculateStreak,
  dayKey,
  lastNDayKeys,
  leagueFromWeeklyXp,
  levelFromXp,
  weekdayLetter,
  xpForSession,
} from '../progression';

describe('levelFromXp', () => {
  it('starts a new account at level 1 with an empty bar', () => {
    const p = levelFromXp(0);
    expect(p.level).toBe(1);
    expect(p.xpInLevel).toBe(0);
    expect(p.percent).toBe(0);
    expect(p.rankName).toBe('Rookie');
  });

  it('reports progress within the current level', () => {
    const p = levelFromXp(1240);
    expect(p.level).toBe(2);
    expect(p.xpInLevel).toBe(240);
    expect(p.xpToNextLevel).toBe(760);
    expect(p.percent).toBe(24);
  });

  it('levels up exactly on the boundary', () => {
    expect(levelFromXp(XP_PER_LEVEL - 1).level).toBe(1);
    expect(levelFromXp(XP_PER_LEVEL).level).toBe(2);
  });

  it('promotes the rank title as levels climb', () => {
    expect(levelFromXp(0).rankName).toBe('Rookie');
    expect(levelFromXp(3 * XP_PER_LEVEL).rankName).toBe('Contender');
    expect(levelFromXp(6 * XP_PER_LEVEL).rankName).toBe('Challenger');
  });

  it('clamps negative or fractional XP rather than producing level 0', () => {
    expect(levelFromXp(-500).level).toBe(1);
    expect(levelFromXp(999.9).level).toBe(1);
  });
});

describe('leagueFromWeeklyXp', () => {
  it('places a new athlete in Bronze', () => {
    expect(leagueFromWeeklyXp(0).id).toBe('bronze');
  });

  it('promotes at each threshold', () => {
    expect(leagueFromWeeklyXp(800).id).toBe('silver');
    expect(leagueFromWeeklyXp(2500).id).toBe('gold');
    expect(leagueFromWeeklyXp(9999).id).toBe('platinum');
  });

  it('stays in the lower league just below a threshold', () => {
    expect(leagueFromWeeklyXp(2499).id).toBe('silver');
  });
});

describe('xpForSession', () => {
  it('pays out per the design spec', () => {
    expect(xpForSession('versus', true)).toBe(200);
    expect(xpForSession('versus', false)).toBe(60);
    expect(xpForSession('solo', true)).toBe(300);
    expect(xpForSession('solo', false)).toBe(80);
    expect(xpForSession('practice', true)).toBe(40);
    expect(xpForSession('practice', false)).toBe(40);
  });
});

describe('calculateStreak', () => {
  it('is zero with no training history', () => {
    expect(calculateStreak([], '2026-07-22')).toBe(0);
  });

  it('counts consecutive days ending today', () => {
    expect(calculateStreak(['2026-07-20', '2026-07-21', '2026-07-22'], '2026-07-22')).toBe(3);
  });

  it('survives a single rest day', () => {
    // Trained Mon/Tue, rested Wed, trained Thu.
    expect(calculateStreak(['2026-07-20', '2026-07-21', '2026-07-23'], '2026-07-23')).toBe(3);
  });

  it('breaks after two consecutive missed days', () => {
    expect(calculateStreak(['2026-07-18', '2026-07-19', '2026-07-23'], '2026-07-23')).toBe(1);
  });

  it('keeps yesterday-only streaks alive so today can extend them', () => {
    expect(calculateStreak(['2026-07-21'], '2026-07-22')).toBe(1);
  });
});

describe('dayKey', () => {
  it('formats as YYYY-MM-DD with zero padding', () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('weekdayLetter', () => {
  it('returns the correct letter for an ISO day (noon-safe)', () => {
    // 2026-07-30 is a Thursday.
    expect(weekdayLetter('2026-07-30')).toBe('T');
    expect(weekdayLetter('2026-07-26')).toBe('S'); // Sunday
    expect(weekdayLetter('2026-07-27')).toBe('M');
  });
});

describe('lastNDayKeys', () => {
  it('returns n days ending on the given date, oldest first', () => {
    const keys = lastNDayKeys(3, new Date(2026, 6, 30));
    expect(keys).toEqual(['2026-07-28', '2026-07-29', '2026-07-30']);
  });
});

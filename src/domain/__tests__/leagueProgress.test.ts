import { leagueProgressFromWeeklyXp } from '@/domain/leagueProgress';

describe('leagueProgressFromWeeklyXp', () => {
  it('labels early bronze as Bronze I', () => {
    const p = leagueProgressFromWeeklyXp(50);
    expect(p.title).toBe('Bronze I');
    expect(p.nextLeague?.id).toBe('silver');
    expect(p.xpToNext).toBe(750);
  });

  it('moves into Bronze II mid-band', () => {
    const p = leagueProgressFromWeeklyXp(300);
    expect(p.title).toBe('Bronze II');
    expect(p.fill).toBeGreaterThan(0.3);
  });

  it('shows Silver once the threshold is cleared', () => {
    const p = leagueProgressFromWeeklyXp(800);
    expect(p.league.id).toBe('silver');
    expect(p.title).toMatch(/^Silver/);
  });
});

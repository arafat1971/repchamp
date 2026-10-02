import { consistencyFor, nextMilestone } from '../consistency';

// Wednesday 2026-09-30.
const NOW = new Date(2026, 8, 30, 12);

describe('consistencyFor', () => {
  it('has no streak to protect before the first set', () => {
    const c = consistencyFor([], 4, NOW);
    expect(c.state).toBe('start');
    expect(c.streak).toBe(0);
    expect(c.milestone?.target).toBe(3);
  });

  it('is safe once today is trained', () => {
    const c = consistencyFor(['2026-09-29', '2026-09-30'], 4, NOW);
    expect(c.state).toBe('safe');
    expect(c.trainedToday).toBe(true);
    expect(c.streak).toBe(2);
  });

  it('allows a rest day: trained yesterday, today still open', () => {
    const c = consistencyFor(['2026-09-28', '2026-09-29'], 4, NOW);
    expect(c.state).toBe('open');
    expect(c.line).toMatch(/Rest days are allowed/);
  });

  it('is at risk only when yesterday and today are both empty but a streak is alive', () => {
    const c = consistencyFor(['2026-09-28', '2026-09-27'], 4, NOW);
    expect(c.streak).toBeGreaterThan(0);
    expect(c.state).toBe('at-risk');
  });

  it('reports the climb to the next milestone', () => {
    const c = consistencyFor(['2026-09-28', '2026-09-29', '2026-09-30'], 4, NOW);
    expect(c.streak).toBe(3);
    expect(c.milestone).toMatchObject({ target: 7, daysToGo: 4 });
    expect(c.milestone!.fraction).toBeGreaterThan(0);
  });

  it('counts this week and the last 28 days', () => {
    const c = consistencyFor(['2026-09-28', '2026-09-30', '2026-09-10'], 4, NOW);
    expect(c.daysThisWeek).toBe(2);
    expect(c.last28.days).toBe(3);
    expect(c.last28.pct).toBe(11);
  });

  it('names a favourite weekday only with enough data and no tie', () => {
    expect(consistencyFor(['2026-09-29'], 4, NOW).favouriteDay).toBeNull();
    const tuesdays = ['2026-09-29', '2026-09-22', '2026-09-15', '2026-09-08', '2026-09-01', '2026-08-25', '2026-09-30'];
    expect(consistencyFor(tuesdays, 4, NOW).favouriteDay).toBe('Tuesday');
  });

  it('has no milestone past the last one', () => {
    expect(nextMilestone(365)).toBeNull();
    expect(nextMilestone(2)).toBe(3);
  });
});

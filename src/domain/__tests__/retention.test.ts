import {
  daysBetween,
  leagueMove,
  returnVisit,
  streakOutcome,
} from '@/domain/retention';

const LADDER = ['bronze', 'silver', 'gold', 'platinum'];

describe('streakOutcome', () => {
  it('calls a first-ever session a start, not a break', () => {
    expect(streakOutcome([], '2026-09-13')).toEqual({ kind: 'started', length: 1 });
  });

  it('continues a live run and brackets the change', () => {
    const out = streakOutcome(['2026-09-11', '2026-09-12'], '2026-09-13');
    expect(out).toEqual({ kind: 'continued', length: 3, previous: 2 });
  });

  it('ignores a second session on a day already trained', () => {
    // Three sets in one evening must not read as three days of retention.
    expect(streakOutcome(['2026-09-13'], '2026-09-13')).toEqual({ kind: 'same-day' });
  });

  it('reports a break on the return after a real gap', () => {
    const out = streakOutcome(['2026-08-01', '2026-08-02'], '2026-09-13');
    expect(out.kind).toBe('broken');
  });

  it('treats a single rest day as continuation, matching calculateStreak', () => {
    // The streak rule forgives one day; the event must not contradict it.
    const out = streakOutcome(['2026-09-11'], '2026-09-13');
    expect(out.kind).toBe('continued');
  });
});

describe('returnVisit', () => {
  it('is silent until a first day is known', () => {
    expect(returnVisit(null, null, '2026-09-13')).toBeNull();
  });

  it('is silent on repeat opens the same day', () => {
    expect(returnVisit('2026-09-01', '2026-09-13', '2026-09-13')).toBeNull();
  });

  it('counts dayN from install, not from the last visit', () => {
    const v = returnVisit('2026-09-06', '2026-09-12', '2026-09-13');
    expect(v).toEqual({ dayN: 7, daysSinceLast: 1 });
  });

  it('reports the gap length when somebody comes back late', () => {
    const v = returnVisit('2026-09-01', '2026-09-03', '2026-09-13');
    expect(v?.daysSinceLast).toBe(10);
  });

  /* The install-day open is a real first open and must fire: `dayN: 0` is the
     D0 baseline that every D1/D7 ratio is divided by, so suppressing it would
     leave the denominator unmeasurable. (This assertion originally expected
     null; the implementation was right and the expectation was wrong.) */
  it('fires on the install day as day 0, the D0 baseline', () => {
    expect(returnVisit('2026-09-13', null, '2026-09-13')).toEqual({
      dayN: 0,
      daysSinceLast: 0,
    });
  });
});

describe('daysBetween', () => {
  it('counts whole days and clamps a reversed range', () => {
    expect(daysBetween('2026-09-01', '2026-09-08')).toBe(7);
    expect(daysBetween('2026-09-08', '2026-09-01')).toBe(0);
  });

  it('survives a malformed key rather than emitting NaN', () => {
    expect(daysBetween('not-a-day', '2026-09-13')).toBe(0);
  });
});

describe('leagueMove', () => {
  it('reports a promotion', () => {
    expect(leagueMove('bronze', 'silver', LADDER)).toEqual({
      kind: 'promoted',
      from: 'bronze',
      to: 'silver',
    });
  });

  it('reports a demotion, which weekly-XP resets make possible', () => {
    expect(leagueMove('gold', 'silver', LADDER).kind).toBe('demoted');
  });

  it('is silent with no previous league, and when nothing moved', () => {
    expect(leagueMove(null, 'bronze', LADDER)).toEqual({ kind: 'unchanged' });
    expect(leagueMove('gold', 'gold', LADDER)).toEqual({ kind: 'unchanged' });
  });

  it('is silent for an id outside the ladder rather than inventing movement', () => {
    expect(leagueMove('diamond', 'gold', LADDER)).toEqual({ kind: 'unchanged' });
  });
});

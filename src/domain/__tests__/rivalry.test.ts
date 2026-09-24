import { rivalryLine, rivalryNudge, rivalryWith, type RivalrySession } from '../rivalry';

let t = 0;
/** Oldest first; each call is one minute later than the last. */
function duel(outcome: 'won' | 'lost' | 'drew', opponentId = 'bea', mode = 'versus'): RivalrySession {
  t += 1;
  return {
    mode,
    opponentId,
    won: outcome === 'won',
    drew: outcome === 'drew',
    completedAt: new Date(Date.UTC(2026, 8, 24, 0, t)).toISOString(),
  };
}

beforeEach(() => {
  t = 0;
});

describe('rivalryWith', () => {
  it('is empty without an opponent or any duels', () => {
    expect(rivalryWith([duel('won')], null).played).toBe(0);
    expect(rivalryWith([], 'bea')).toEqual({
      wins: 0,
      losses: 0,
      draws: 0,
      played: 0,
      last: null,
      run: null,
    });
  });

  it('counts only versus sessions against this opponent', () => {
    const history = [duel('won'), duel('lost'), duel('won', 'cal'), duel('won', 'bea', 'together')];
    expect(rivalryWith(history, 'bea')).toMatchObject({ wins: 1, losses: 1, played: 2 });
  });

  it('keeps draws separate', () => {
    expect(rivalryWith([duel('drew'), duel('won')], 'bea')).toMatchObject({ wins: 1, draws: 1 });
  });

  /* Order comes from the timestamp, not the array: the profile stores
     newest-first, but nothing here should depend on that. */
  it('reads the latest result and current run by time', () => {
    const history = [duel('lost'), duel('won'), duel('won'), duel('won')].reverse();
    expect(rivalryWith(history, 'bea')).toMatchObject({
      last: 'won',
      run: { outcome: 'won', count: 3 },
    });
  });

  it('only calls a run from two in a row, and never for a draw', () => {
    expect(rivalryWith([duel('lost'), duel('won')], 'bea').run).toBeNull();
    expect(rivalryWith([duel('drew'), duel('drew')], 'bea').run).toBeNull();
  });
});

describe('rivalryLine', () => {
  it('says who leads, bigger number first', () => {
    expect(rivalryLine(rivalryWith([duel('won'), duel('won'), duel('lost')], 'bea'), 'Bea')).toBe(
      'You lead Bea 2–1',
    );
    expect(rivalryLine(rivalryWith([duel('lost'), duel('lost'), duel('won')], 'bea'), 'Bea')).toBe(
      'Bea leads 2–1',
    );
  });

  it('calls a level series and notes draws', () => {
    expect(rivalryLine(rivalryWith([duel('won'), duel('lost'), duel('drew')], 'bea'), 'Bea')).toBe(
      'All square with Bea at 1–1 (1 drawn)',
    );
  });

  it('is empty before the first duel', () => {
    expect(rivalryLine(rivalryWith([], 'bea'), 'Bea')).toBe('');
  });
});

describe('rivalryNudge', () => {
  it('aims at the next race', () => {
    expect(rivalryNudge(rivalryWith([], 'bea'), 'Bea')).toContain('No duels yet');
    expect(rivalryNudge(rivalryWith([duel('won'), duel('won')], 'bea'), 'Bea')).toBe(
      '2 wins in a row. Bea wants this back.',
    );
    expect(rivalryNudge(rivalryWith([duel('lost'), duel('lost')], 'bea'), 'Bea')).toBe(
      'Bea has won 2 straight. Time to end it.',
    );
    expect(rivalryNudge(rivalryWith([duel('lost'), duel('won')], 'bea'), 'Bea')).toBe(
      'You took the last one. Make it two.',
    );
  });
});

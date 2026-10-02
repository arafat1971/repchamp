import {
  ACTION_META,
  PANDA_ACTIONS,
  actionCode,
  actionFromCode,
  cleanActionPoke,
  parseAction,
  smartAction,
} from '../pandaActions';

describe('panda action codes', () => {
  it('round-trips every gesture and fits the 8-character poke slot', () => {
    for (const a of PANDA_ACTIONS) {
      expect(actionCode(a).length).toBeLessThanOrEqual(8);
      expect(actionFromCode(actionCode(a))).toBe(a);
    }
    expect(new Set(PANDA_ACTIONS.map((a) => ACTION_META[a].code)).size).toBe(PANDA_ACTIONS.length);
  });

  it('ignores emoji pokes and junk', () => {
    expect(actionFromCode('❤️')).toBeNull();
    expect(actionFromCode('p:zz')).toBeNull();
    expect(actionFromCode(42)).toBeNull();
    expect(parseAction('hug')).toBe('hug');
    expect(parseAction('kiss')).toBeNull();
  });

  it('cleans a gesture poke', () => {
    expect(cleanActionPoke({ e: 'p:hg', at: 5 })).toEqual({ e: 'p:hg', at: 5 });
    expect(cleanActionPoke({ e: '❤️', at: 5 })).toBeNull();
    expect(cleanActionPoke({ e: 'p:hg', at: -1 })).toBeNull();
  });
});

describe('smartAction', () => {
  const now = 1_000_000_000;
  const base = { now, myLastSipAt: null, theirLastSipAt: null, theyMet: false, theirBehindMl: 0 };

  it('high-fives a partner who just hit the goal', () => {
    expect(smartAction({ ...base, theyMet: true, theirBehindMl: 900 })).toBe('highfive');
  });

  it('suggests cheers when both drank in the last quarter hour', () => {
    expect(smartAction({ ...base, myLastSipAt: now - 60_000, theirLastSipAt: now - 600_000 })).toBe('cheers');
    expect(smartAction({ ...base, myLastSipAt: now - 60_000, theirLastSipAt: now - 3_600_000 })).toBe('tickle');
  });

  it('hugs a partner who is falling behind, otherwise tickles', () => {
    expect(smartAction({ ...base, theirBehindMl: 400 })).toBe('hug');
    expect(smartAction(base)).toBe('tickle');
  });
});

import { THIRSTY_BEHIND_ML, bottleRemaining, pandaMood } from '../pandaMood';

describe('pandaMood', () => {
  it('celebrates a finished bottle, whatever the hour', () => {
    expect(pandaMood({ met: true, pace: 'done', hour: 23 })).toBe('celebrate');
  });

  it('gets thirsty only when clearly behind pace', () => {
    expect(pandaMood({ met: false, pace: 'behind', behindMl: THIRSTY_BEHIND_ML, hour: 15 })).toBe('thirsty');
    expect(pandaMood({ met: false, pace: 'behind', behindMl: THIRSTY_BEHIND_ML - 1, hour: 15 })).toBe('happy');
    expect(pandaMood({ met: false, pace: 'on', hour: 15 })).toBe('happy');
  });

  it('is sleepy at night instead of nagging', () => {
    expect(pandaMood({ met: false, pace: 'behind', behindMl: 2000, hour: 23 })).toBe('sleepy');
    expect(pandaMood({ met: false, pace: null, hour: 3 })).toBe('sleepy');
    expect(pandaMood({ met: false, pace: 'early', hour: 7 })).toBe('happy');
  });
});

describe('bottleRemaining', () => {
  it('starts full and drains as you drink', () => {
    expect(bottleRemaining(0, 2000)).toBe(100);
    expect(bottleRemaining(500, 2000)).toBe(75);
    expect(bottleRemaining(2000, 2000)).toBe(0);
  });

  it('never goes below empty or above full', () => {
    expect(bottleRemaining(3000, 2000)).toBe(0);
    expect(bottleRemaining(-5, 2000)).toBe(100);
    expect(bottleRemaining(100, 0)).toBe(100);
  });
});

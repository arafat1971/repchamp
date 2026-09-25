import { HOT_C, freshWeather, weatherEmoji, weatherKind } from '@/domain/weather';
import { meadow, weekSoFar, weekWrap, weekdayIndex, withTotals, wrapLine } from '@/domain/week';

// 2026-09-21 is a Monday; 2026-09-27 a Sunday.
describe('week', () => {
  it('indexes Monday as 0 and Sunday as 6', () => {
    expect(weekdayIndex('2026-09-21')).toBe(0);
    expect(weekdayIndex('2026-09-27')).toBe(6);
  });

  it('lists the week so far from Monday', () => {
    expect(weekSoFar('2026-09-23')).toEqual(['2026-09-21', '2026-09-22', '2026-09-23']);
    expect(weekSoFar('2026-09-21')).toEqual(['2026-09-21']);
  });

  it('fills the meadow from earlier days only, capped', () => {
    const h = { '2026-09-21': { them: 1000, me: 500 }, '2026-09-22': { them: 5000, me: 5000 }, '2026-09-23': { them: 750, me: 750 } };
    expect(meadow(h, '2026-09-23')).toEqual([6, 10, 0, 0, 0, 0, 0]);
    expect(meadow(h, '2026-09-28')).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('counts wins and rainbows, and wraps up on Sunday only', () => {
    const h = {
      '2026-09-21': { them: 1000, me: 1500 },
      '2026-09-22': { them: 2000, me: 1500 },
      '2026-09-23': { them: 1000, me: 1000 },
      '2026-09-27': { them: 500, me: 900 },
    };
    const w = weekWrap(h, ['2026-09-22'], '2026-09-27');
    expect([w.mine, w.theirs, w.rainbows]).toEqual([2, 1, 1]);
    expect(wrapLine(w, 'Bea', '2026-09-27')).toBe('Week wrap: you 2 · Bea 1 · 🌈 1');
    expect(wrapLine(w, 'Bea', '2026-09-26')).toBeNull();
    expect(wrapLine(weekWrap({}, [], '2026-09-27'), 'Bea', '2026-09-27')).toBeNull();
  });

  it('keeps the higher total per day and only two weeks', () => {
    let h = withTotals({}, '2026-09-21', { them: 500, me: 250 });
    h = withTotals(h, '2026-09-21', { them: 250, me: 750 });
    expect(h['2026-09-21']).toEqual({ them: 500, me: 750 });
    const many: Record<string, { them: number; me: number }> = {};
    for (let d = 1; d <= 20; d++) many[`2026-09-${String(d).padStart(2, '0')}`] = { them: 1, me: 1 };
    expect(Object.keys(withTotals(many, '2026-09-21', { them: 1, me: 1 })).length).toBe(14);
  });
});

describe('weather', () => {
  it('folds WMO codes into skies', () => {
    expect(weatherKind(0)).toBe('clear');
    expect(weatherKind(2)).toBe('cloudy');
    expect(weatherKind(45)).toBe('fog');
    expect(weatherKind(63)).toBe('rain');
    expect(weatherKind(81)).toBe('rain');
    expect(weatherKind(73)).toBe('snow');
    expect(weatherKind(96)).toBe('storm');
    expect(weatherEmoji('rain')).toBe('🌧️');
    expect(HOT_C).toBe(30);
  });

  it('drops a stale reading', () => {
    const w = { kind: 'clear' as const, tempC: 20, at: 1000 };
    expect(freshWeather(w, 1000 + 60_000)).toBe(w);
    expect(freshWeather(w, 1000 + 4 * 3600_000)).toBeNull();
    expect(freshWeather(null, 0)).toBeNull();
  });
});

import { bondMonths, occasionFor, occasionLine, seasonFor } from '@/domain/season';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 12);

describe('seasonFor', () => {
  it('follows the meteorological calendar in the north', () => {
    expect(seasonFor(d(2026, 1, 10))).toBe('winter');
    expect(seasonFor(d(2026, 4, 10))).toBe('spring');
    expect(seasonFor(d(2026, 7, 10))).toBe('summer');
    expect(seasonFor(d(2026, 10, 10))).toBe('autumn');
    expect(seasonFor(d(2026, 12, 10))).toBe('winter');
  });

  it('flips in the south', () => {
    expect(seasonFor(d(2026, 7, 10), true)).toBe('winter');
    expect(seasonFor(d(2026, 1, 10), true)).toBe('summer');
  });
});

describe('bondMonths', () => {
  it('counts whole months on the anniversary day only', () => {
    const paired = d(2026, 6, 25).getTime();
    expect(bondMonths(paired, d(2026, 9, 25))).toBe(3);
    expect(bondMonths(paired, d(2026, 9, 24))).toBe(0);
    expect(bondMonths(paired, d(2026, 6, 25))).toBe(0);
    expect(bondMonths(null, d(2026, 9, 25))).toBe(0);
  });

  it('celebrates a 31st on the last day of a short month', () => {
    expect(bondMonths(d(2026, 1, 31).getTime(), d(2026, 2, 28))).toBe(1);
  });
});

describe('occasions', () => {
  it('prefers the bond, then the shared days', () => {
    expect(occasionFor(d(2027, 2, 14), 3)).toBe('bond');
    expect(occasionFor(d(2027, 2, 14), 0)).toBe('valentine');
    expect(occasionFor(d(2027, 1, 1), 0)).toBe('newyear');
    expect(occasionFor(d(2027, 5, 5), 0)).toBe('');
  });

  it('phrases each', () => {
    expect(occasionLine('bond', 3)).toBe('3-month bond today 💞');
    expect(occasionLine('bond', 12)).toBe('1-year bond today 💞');
    expect(occasionLine('newyear', 0)).toBe('Happy New Year 🎆 — first sip of the year?');
    expect(occasionLine('', 0)).toBeNull();
  });
});

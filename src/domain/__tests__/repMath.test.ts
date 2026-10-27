import {
  clampDays,
  DEFAULT_REPS_PER_SET,
  formatPerRep,
  repMath,
  repMathVerdict,
  typicalSetSize,
} from '../repMath';

describe('repMath', () => {
  it('divides a yearly price into a year of sets and reps', () => {
    const m = repMath({ price: 52, weeks: 52, daysPerWeek: 3, repsPerSet: 20 })!;
    expect(m.setsPerYear).toBe(156);
    expect(m.repsPerYear).toBe(3120);
    expect(m.perSet).toBeCloseTo(52 / 156);
    expect(m.perRep).toBeCloseTo(52 / 3120);
  });

  it('scales a weekly plan to a full year before dividing', () => {
    const m = repMath({ price: 2, weeks: 1, daysPerWeek: 1, repsPerSet: 10 })!;
    expect(m.perRep).toBeCloseTo((2 * 52) / (52 * 10));
  });

  it('returns null without a price', () => {
    expect(repMath({ price: 0, weeks: 52, daysPerWeek: 3, repsPerSet: 20 })).toBeNull();
    expect(repMath({ price: 10, weeks: 0, daysPerWeek: 3, repsPerSet: 20 })).toBeNull();
  });
});

describe('clampDays', () => {
  it('holds the divisor to 1–7', () => {
    expect(clampDays(0)).toBe(1);
    expect(clampDays(9)).toBe(7);
    expect(clampDays(4.4)).toBe(4);
    expect(clampDays(Number.NaN)).toBe(3);
  });
});

describe('typicalSetSize', () => {
  it('falls back to the default with no history', () => {
    expect(typicalSetSize([])).toBe(DEFAULT_REPS_PER_SET);
    expect(typicalSetSize([{ reps: 0 }])).toBe(DEFAULT_REPS_PER_SET);
  });

  it('takes the median so one huge set does not skew it', () => {
    expect(typicalSetSize([{ reps: 10 }, { reps: 12 }, { reps: 150 }])).toBe(12);
    expect(typicalSetSize([{ reps: 10 }, { reps: 20 }])).toBe(15);
  });

  it('clamps stray figures', () => {
    expect(typicalSetSize([{ reps: 1 }])).toBe(5);
    expect(typicalSetSize([{ reps: 900 }])).toBe(200);
  });
});

describe('formatPerRep', () => {
  it('never prints a zero price', () => {
    expect(formatPerRep(0.004, '$')).toBe('under $0.01');
    expect(formatPerRep(0.0456, '$')).toBe('$0.046');
    expect(formatPerRep(0.25, '£')).toBe('£0.25');
    expect(formatPerRep(0, '$')).toBe('');
  });
});

describe('repMathVerdict', () => {
  it('leads with the per-rep figure when it is under a hundredth', () => {
    const m = repMath({ price: 30, weeks: 52, daysPerWeek: 4, repsPerSet: 20 })!;
    expect(repMathVerdict(m, '$')).toBe('Less than $0.01 for every rep counted and form-checked.');
  });

  it('falls back to the per-workout figure for dearer reps', () => {
    const m = repMath({ price: 10, weeks: 1, daysPerWeek: 1, repsPerSet: 5 })!;
    expect(repMathVerdict(m, '$')).toBe('$10.00 a workout, every rep counted and form-checked.');
  });
});

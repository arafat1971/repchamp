import {
  cadence,
  cadenceLabel,
  goalStreak,
  journeyAt,
  lastSevenDays,
  recordStepDay,
  shiftDay,
  stepBadges,
  stepStats,
  type StepDay,
} from '@/domain/stepsHistory';

const day = (d: string, steps: number, goal = 8000): StepDay => ({ day: d, steps, goal });

describe('recordStepDay', () => {
  it('keeps the day max and sorts newest first', () => {
    let h = recordStepDay([], '2026-10-14', 5000, 8000);
    h = recordStepDay(h, '2026-10-15', 1000, 8000);
    h = recordStepDay(h, '2026-10-15', 800, 8000);
    expect(h.map((d) => d.day)).toEqual(['2026-10-15', '2026-10-14']);
    expect(h[0]?.steps).toBe(1000);
  });

  it('refuses nonsense', () => {
    expect(recordStepDay([], '2026-10-15', NaN, 8000)).toEqual([]);
    expect(recordStepDay([], '2026-10-15', -5, 8000)).toEqual([]);
  });
});

describe('shiftDay', () => {
  it('crosses month ends', () => {
    expect(shiftDay('2026-10-01', 1)).toBe('2026-09-30');
    expect(shiftDay('2026-12-31', -1)).toBe('2027-01-01');
  });
});

describe('lastSevenDays', () => {
  it('is oldest first, ends today, fills gaps with zero', () => {
    const w = lastSevenDays([day('2026-10-15', 9000), day('2026-10-13', 2000)], '2026-10-15', 8000);
    expect(w).toHaveLength(7);
    expect(w[6]).toMatchObject({ day: '2026-10-15', met: true, isToday: true });
    expect(w[4]?.steps).toBe(2000);
    expect(w[5]?.steps).toBe(0);
  });
});

describe('goalStreak', () => {
  it('counts back from today, or from yesterday while today is in progress', () => {
    const h = [day('2026-10-14', 9000), day('2026-10-13', 8000), day('2026-10-12', 100)];
    expect(goalStreak(h, '2026-10-15')).toBe(2);
    expect(goalStreak([day('2026-10-15', 8000), ...h], '2026-10-15')).toBe(3);
    expect(goalStreak([], '2026-10-15')).toBe(0);
  });
});

describe('stepStats', () => {
  it('totals, best day and week-on-week trend', () => {
    const h = [day('2026-10-15', 6000), day('2026-10-14', 4000), day('2026-10-05', 5000)];
    const s = stepStats(h, '2026-10-15');
    expect(s.weekTotal).toBe(10000);
    expect(s.weekAvg).toBe(5000);
    expect(s.weekTrend).toBeCloseTo(1);
    expect(s.best?.steps).toBe(6000);
    expect(s.lifetime).toBe(15000);
  });
});

describe('stepBadges', () => {
  it('earns day badges from the best day and shows progress on the rest', () => {
    const b = stepBadges([day('2026-10-15', 10500)], '2026-10-15');
    expect(b.find((x) => x.id === 'ten-k')?.earned).toBe(true);
    const sky = b.find((x) => x.id === 'fifteen-k');
    expect(sky?.earned).toBe(false);
    expect(sky?.progress).toBeCloseTo(0.7);
  });
});

describe('journeyAt', () => {
  it('places km between two stops', () => {
    const j = journeyAt(30);
    expect(j.from.km).toBe(21);
    expect(j.to?.km).toBe(42);
    expect(j.kmToNext).toBe(12);
  });
  it('ends at the last stop', () => {
    expect(journeyAt(50000).to).toBeNull();
  });
});

describe('cadence', () => {
  it('steps per minute over the window', () => {
    const s = [
      { at: 0, steps: 100 },
      { at: 30_000, steps: 160 },
    ];
    expect(cadence(s)).toBe(120);
    expect(cadenceLabel(120).tone).toBe('brisk');
    expect(cadence([{ at: 0, steps: 1 }])).toBe(0);
  });
});

import { consistencyGrid, weekComparison } from '../progressSummary';

/* Thursday 24 September 2026. This ISO week: 21–27 Sep. Last week: 14–20. */
const NOW = new Date(2026, 8, 24, 12);

describe('weekComparison', () => {
  it('totals this week and last, and lays this week out Monday to Sunday', () => {
    const r = weekComparison(
      [
        { day: '2026-09-21', reps: 10 },
        { day: '2026-09-24', reps: 15 },
        { day: '2026-09-24', reps: 5 },
        { day: '2026-09-16', reps: 20 },
        { day: '2026-09-01', reps: 99 },
      ],
      NOW,
    );
    expect(r.thisWeek).toBe(30);
    expect(r.lastWeek).toBe(20);
    expect(r.deltaPct).toBe(50);
    expect(r.days).toEqual([10, 0, 0, 20, 0, 0, 0]);
    expect(r.labels[0]).toBe('M');
    expect(r.todayIndex).toBe(3);
  });

  /* Any number beats nothing; a percentage off a tiny week is noise. */
  it('makes no percentage claim without a fair baseline', () => {
    expect(weekComparison([{ day: '2026-09-22', reps: 30 }], NOW).deltaPct).toBeNull();
    expect(
      weekComparison(
        [
          { day: '2026-09-22', reps: 30 },
          { day: '2026-09-15', reps: 4 },
        ],
        NOW,
      ).deltaPct,
    ).toBeNull();
  });

  it('reports a drop honestly', () => {
    expect(
      weekComparison(
        [
          { day: '2026-09-22', reps: 15 },
          { day: '2026-09-15', reps: 30 },
        ],
        NOW,
      ).deltaPct,
    ).toBe(-50);
  });
});

describe('consistencyGrid', () => {
  it('is twelve weeks of seven days ending with this week', () => {
    const grid = consistencyGrid([], NOW);
    expect(grid).toHaveLength(12);
    expect(grid.every((w) => w.length === 7)).toBe(true);
    expect(grid[11]![0]!.day).toBe('2026-09-21');
    expect(grid[11]![6]!.day).toBe('2026-09-27');
    expect(grid[0]![0]!.day).toBe('2026-07-06');
  });

  it('marks rest days, future days, and shades by the athlete’s own quartiles', () => {
    const grid = consistencyGrid(
      [
        { day: '2026-09-21', reps: 5 },
        { day: '2026-09-22', reps: 10 },
        { day: '2026-09-23', reps: 20 },
        { day: '2026-09-24', reps: 40 },
      ],
      NOW,
    );
    const week = grid[11]!;
    expect(week.map((c) => c.level)).toEqual([1, 2, 3, 4, 0, 0, 0]);
    expect(week.filter((c) => c.isFuture).map((c) => c.day)).toEqual([
      '2026-09-25',
      '2026-09-26',
      '2026-09-27',
    ]);
  });
});

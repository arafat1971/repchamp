import { weekReps } from '../weekReps';

// Wednesday 2026-09-30; its ISO week is Mon 09-28 .. Sun 10-04.
const NOW = new Date(2026, 8, 30);

describe('weekReps', () => {
  it('sums reps per day, Monday to Sunday', () => {
    const w = weekReps(
      [
        { day: '2026-09-28', reps: 10 },
        { day: '2026-09-28', reps: 5 },
        { day: '2026-09-30', reps: 20 },
      ],
      NOW,
    );
    expect(w.days.map((d) => d.reps)).toEqual([15, 0, 20, 0, 0, 0, 0]);
    expect(w.total).toBe(35);
    expect(w.peak).toBe(20);
    expect(w.days[2]!.isToday).toBe(true);
  });

  it('keeps last week out of this week and reports it separately', () => {
    const w = weekReps([{ day: '2026-09-24', reps: 40 }], NOW);
    expect(w.total).toBe(0);
    expect(w.lastWeekTotal).toBe(40);
    expect(w.peak).toBe(1);
  });
});

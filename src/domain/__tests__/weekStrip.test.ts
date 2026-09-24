import { weekStrip } from '../weekStrip';

/* Thursday 24 September 2026, local time. */
const NOW = new Date(2026, 8, 24, 12);

describe('weekStrip', () => {
  it('lays out Monday to Sunday of the current ISO week', () => {
    const cells = weekStrip([], NOW);
    expect(cells.map((c) => c.day)).toEqual([
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
      '2026-09-27',
    ]);
    expect(cells[0]!.letter).toBe('M');
  });

  it('marks trained days, today and the days still ahead', () => {
    const cells = weekStrip(['2026-09-21', '2026-09-24', '2026-09-14'], NOW);
    expect(cells.filter((c) => c.trained).map((c) => c.day)).toEqual(['2026-09-21', '2026-09-24']);
    expect(cells.find((c) => c.isToday)!.day).toBe('2026-09-24');
    expect(cells.filter((c) => c.isFuture).length).toBe(3);
  });
});

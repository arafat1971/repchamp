import { advanceClock, clockAt } from '../homeClock';

const at = (y: number, m: number, d: number, h = 12, min = 0) =>
  new Date(y, m - 1, d, h, min).getTime();

describe('advanceClock', () => {
  it('keeps the same object for an unpaired athlete within a day — no re-render', () => {
    const prev = clockAt(at(2026, 10, 3, 9));
    expect(advanceClock(prev, at(2026, 10, 3, 9, 1), false)).toBe(prev);
  });

  it('moves the minute on when something on screen reads it', () => {
    const prev = clockAt(at(2026, 10, 3, 9));
    const next = advanceClock(prev, at(2026, 10, 3, 9, 1), true);
    expect(next).not.toBe(prev);
    expect(next.now).toBe(at(2026, 10, 3, 9, 1));
  });

  it('rolls the day over even when nothing reads the minute', () => {
    const prev = clockAt(at(2026, 10, 3, 23, 59));
    const next = advanceClock(prev, at(2026, 10, 4, 0, 0), false);
    expect(next.day).toBe('2026-10-04');
    expect(next).not.toBe(prev);
  });
});

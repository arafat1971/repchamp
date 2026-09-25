import { duoStreak, previousDay, withDay } from '@/domain/duoStreak';
import { dailyVisitor } from '@/domain/waterWidget';

describe('duoStreak', () => {
  it('steps back across a month boundary', () => {
    expect(previousDay('2026-10-01')).toBe('2026-09-30');
  });

  it('counts back from today when today is earned', () => {
    expect(duoStreak(['2026-09-23', '2026-09-24', '2026-09-25'], '2026-09-25')).toBe(3);
  });

  it('does not break before the day is over', () => {
    expect(duoStreak(['2026-09-23', '2026-09-24'], '2026-09-25')).toBe(2);
  });

  it('is broken by a missed day', () => {
    expect(duoStreak(['2026-09-21', '2026-09-23'], '2026-09-25')).toBe(0);
    expect(duoStreak(['2026-09-21', '2026-09-24'], '2026-09-25')).toBe(1);
  });

  it('keeps the list sorted, unique and short', () => {
    expect(withDay(['2026-09-02', '2026-09-01'], '2026-09-01')).toEqual(['2026-09-02', '2026-09-01']);
    expect(withDay(['2026-09-02'], '2026-09-01')).toEqual(['2026-09-01', '2026-09-02']);
    expect(withDay(['a', 'b', 'c'], 'd', 2)).toEqual(['c', 'd']);
  });
});

describe('dailyVisitor', () => {
  it('is the same all day and within range', () => {
    const v = dailyVisitor('2026-09-25');
    expect(v).toBe(dailyVisitor('2026-09-25'));
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(4);
  });

  it('changes across days', () => {
    const seen = new Set(['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'].map(dailyVisitor));
    expect(seen.size).toBeGreaterThan(1);
  });
});

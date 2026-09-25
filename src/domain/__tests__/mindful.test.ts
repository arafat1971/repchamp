import {
  MEDITATIONS,
  appendEntry,
  bestScore,
  breathAt,
  mindfulStreak,
  promptSchedule,
  weekMinutes,
  type MindfulEntry,
} from '../mindful';

describe('promptSchedule', () => {
  it.each(MEDITATIONS.flatMap((m) => m.minutes.map((min) => [m.id, min, m] as const)))(
    '%s for %i min: ordered, inside the session, opening first and closing last',
    (_id, min, med) => {
      const total = min * 60;
      const s = promptSchedule(med, total);
      expect(s.length).toBeGreaterThanOrEqual(med.opening.length);
      for (let i = 1; i < s.length; i++) expect(s[i]!.at).toBeGreaterThan(s[i - 1]!.at);
      expect(s.every((p) => p.at >= 0 && p.at < total)).toBe(true);
      expect(s[0]!.text).toBe(med.opening[0]);
      expect(s[s.length - 1]!.text).toBe(med.closing[med.closing.length - 1]);
    },
  );

  it('a longer sit says more middle lines', () => {
    const scan = MEDITATIONS.find((m) => m.id === 'body-scan')!;
    expect(promptSchedule(scan, 900).length).toBeGreaterThan(promptSchedule(scan, 300).length);
  });
});

describe('breathAt', () => {
  const box = { inhale: 4, holdIn: 4, exhale: 4, holdOut: 4 };
  it('walks the phases of a cycle', () => {
    expect(breathAt(box, 0).phase).toBe('inhale');
    expect(breathAt(box, 5).phase).toBe('holdIn');
    expect(breathAt(box, 9).phase).toBe('exhale');
    expect(breathAt(box, 13).phase).toBe('holdOut');
    expect(breathAt(box, 16).phase).toBe('inhale');
    expect(breathAt(box, 2).progress).toBeCloseTo(0.5);
  });
  it('skips zero-length phases', () => {
    const calm = { inhale: 4, holdIn: 0, exhale: 6, holdOut: 0 };
    expect(breathAt(calm, 4).phase).toBe('exhale');
    expect(breathAt(calm, 10).phase).toBe('inhale');
  });
});

describe('the log', () => {
  const e = (day: string, minutes = 5, extra: Partial<MindfulEntry> = {}): MindfulEntry => ({ day, kind: 'meditation', id: 'calm', minutes, ...extra });

  it('streak counts back from today, or from yesterday before today is done', () => {
    const log = [e('2026-09-23'), e('2026-09-24'), e('2026-09-25')];
    expect(mindfulStreak(log, '2026-09-25')).toBe(3);
    expect(mindfulStreak(log, '2026-09-26')).toBe(3);
    expect(mindfulStreak(log, '2026-09-27')).toBe(0);
    expect(mindfulStreak([], '2026-09-27')).toBe(0);
  });

  it('streak crosses a month end', () => {
    expect(mindfulStreak([e('2026-08-31'), e('2026-09-01')], '2026-09-01')).toBe(2);
  });

  it('week minutes covers the last seven days only', () => {
    const log = [e('2026-09-19', 30), e('2026-09-20', 10), e('2026-09-26', 5)];
    expect(weekMinutes(log, '2026-09-26')).toBe(15);
  });

  it('best score per flow', () => {
    const log = [e('2026-09-25', 10, { kind: 'yoga', id: 'power', score: 70 }), e('2026-09-26', 10, { kind: 'yoga', id: 'power', score: 82 })];
    expect(bestScore(log, 'power')).toBe(82);
    expect(bestScore(log, 'wake-up')).toBeNull();
  });

  it('the log stays bounded', () => {
    let log: MindfulEntry[] = [];
    for (let i = 0; i < 450; i++) log = appendEntry(log, e('2026-09-26'));
    expect(log.length).toBe(400);
  });
});

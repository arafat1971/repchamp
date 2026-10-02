import { GUIDED, getGuided, promptSchedule } from '../guidedMeditation';

describe('promptSchedule', () => {
  it.each(GUIDED.flatMap((m) => m.minutes.map((min) => [m.id, min, m] as const)))(
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
    const scan = getGuided('body-scan')!;
    expect(promptSchedule(scan, 900).length).toBeGreaterThan(promptSchedule(scan, 300).length);
  });

  it('only the voice-led sits live here; paced breathing is the breathe screen', () => {
    expect(GUIDED.map((m) => m.id)).toEqual(['body-scan', 'focus', 'kindness']);
    expect(getGuided('box')).toBeUndefined();
  });
});

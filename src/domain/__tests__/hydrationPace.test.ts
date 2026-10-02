import { formatWait, hydrationPace } from '@/domain/hydrationPace';

const at = (h: number, m = 0) => new Date(2026, 8, 26, h, m);

describe('hydrationPace', () => {
  it('is done once the goal is met', () => {
    const p = hydrationPace(2000, 2000, at(15));
    expect(p.status).toBe('done');
    expect(p.catchUpMl).toBe(0);
    expect(p.nextSipMin).toBeNull();
  });

  it('puts the line halfway through the goal at 15:00', () => {
    // 08:00–22:00 is 14 h; 15:00 is 7 h in.
    expect(hydrationPace(0, 2000, at(15)).expectedMl).toBe(1000);
  });

  it('says behind, with a rounded catch-up, when well under the line', () => {
    const p = hydrationPace(600, 2000, at(15));
    expect(p.status).toBe('behind');
    expect(p.behindMl).toBe(400);
    expect(p.catchUpMl).toBe(400);
    expect(p.line).toContain('400 ml behind');
  });

  it('caps the catch-up at one sensible drink', () => {
    expect(hydrationPace(0, 3000, at(21)).catchUpMl).toBe(750);
  });

  it('treats a glass either side of the line as on pace', () => {
    const p = hydrationPace(900, 2000, at(15));
    expect(p.status).toBe('on');
    expect(p.nextSipMin).not.toBeNull();
    expect(p.line).toMatch(/^On pace · next sip in /);
  });

  it('says ahead, and lets the next sip wait, when well over the line', () => {
    const ahead = hydrationPace(1600, 2000, at(12));
    expect(ahead.status).toBe('ahead');
    const on = hydrationPace(600, 2000, at(12));
    expect(ahead.nextSipMin!).toBeGreaterThan(on.nextSipMin!);
  });

  it('invites a first glass before the drinking day starts', () => {
    expect(hydrationPace(0, 2000, at(6)).status).toBe('early');
  });

  it('calls an early drink a head start, with no absurd wait', () => {
    const p = hydrationPace(500, 2000, at(2));
    expect(p.status).toBe('ahead');
    expect(p.nextSipMin).toBeNull();
    expect(p.line).toContain('head start');
  });

  it('after the drinking day, asks for one more glass rather than a catch-up', () => {
    const p = hydrationPace(1200, 2000, at(23));
    expect(p.status).toBe('behind');
    expect(p.catchUpMl).toBe(500);
    expect(p.line).toContain('before bed');
  });

  it('formats waits in minutes and hours', () => {
    expect(formatWait(25)).toBe('in 25 min');
    expect(formatWait(60)).toBe('in 1 h');
    expect(formatWait(70)).toBe('in 1 h 10 min');
  });
});

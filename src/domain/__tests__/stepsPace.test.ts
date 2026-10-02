import { stepsExtras, stepsPace } from '@/domain/stepsPace';

const at = (h: number, m = 0) => new Date(2026, 8, 26, h, m);

describe('stepsPace', () => {
  it('is done at the goal', () => {
    expect(stepsPace(8000, 8000, at(12)).status).toBe('done');
  });

  it('puts the line halfway at 15:00', () => {
    expect(stepsPace(0, 8000, at(15)).expectedSteps).toBe(4000);
  });

  it('turns a gap into a walk, rounded up to 5 minutes', () => {
    const p = stepsPace(2800, 8000, at(15));
    expect(p.status).toBe('behind');
    expect(p.behindSteps).toBe(1200);
    expect(p.walkMin).toBe(15);
    expect(p.line).toContain('15-min walk');
  });

  it('never suggests less than a 5-minute walk', () => {
    expect(stepsPace(3500, 8000, at(15)).walkMin).toBe(5);
  });

  it('calls a small gap on pace', () => {
    expect(stepsPace(3800, 8000, at(15)).status).toBe('on');
  });

  it('says ahead when well over the line', () => {
    expect(stepsPace(6000, 8000, at(15)).status).toBe('ahead');
  });

  it('is gentle before the day starts', () => {
    expect(stepsPace(0, 8000, at(6)).status).toBe('early');
  });
});

describe('stepsExtras', () => {
  it('estimates distance and energy', () => {
    expect(stepsExtras(8000)).toEqual({ km: 6, kcal: 320 });
    expect(stepsExtras(0)).toEqual({ km: 0, kcal: 0 });
  });
});

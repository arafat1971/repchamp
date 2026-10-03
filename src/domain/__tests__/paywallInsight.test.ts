import { paywallLead, priceInsight, shortDate, trialTimeline } from '../paywallInsight';

const plan = { price: 60, weeks: 52, symbol: '$' };
const wall = { fromRepWall: false, freeLimit: 50, totalReps: 0 };

describe('paywallLead', () => {
  it('names the rep count on the wall', () => {
    const l = paywallLead('rep-limit', { fromRepWall: true, freeLimit: 50, totalReps: 1234 });
    expect(l.title).toBe('You’ve used your 50 free reps');
    expect(l.sub).toContain('1,234');
  });
  it('answers a refusal with what was refused', () => {
    expect(paywallLead('programme', wall).title).toMatch(/plan/);
    expect(paywallLead('form-report', wall).title).toMatch(/move/);
    expect(paywallLead('exercise-library', wall).title).toMatch(/exercise/);
  });
  it('falls back to the general line for browsing', () => {
    expect(paywallLead('profile', wall).title).toBe('Train without limits');
    expect(paywallLead(undefined, wall).title).toBe('Train without limits');
  });
});

describe('priceInsight', () => {
  it('uses per-workout once there is enough history', () => {
    expect(priceInsight(plan, 10)).toBe('About $0.50 a workout at your pace');
  });
  it('uses per-day below the workout threshold', () => {
    expect(priceInsight(plan, 1)).toBe('Works out to $0.16 a day');
  });
  it('is silent for a plan with no rate', () => {
    expect(priceInsight({ price: 99, weeks: 0, symbol: '$' }, 10)).toBeNull();
  });
});

describe('trialTimeline', () => {
  const now = new Date(2026, 9, 3);
  it('adds the trial and finds the cancel-by day', () => {
    expect(trialTimeline(7, now)).toEqual({ chargeDate: '10 Oct', cancelBy: '9 Oct' });
  });
  it('rolls over month ends', () => {
    expect(trialTimeline(30, now)).toEqual({ chargeDate: '2 Nov', cancelBy: '1 Nov' });
  });
  it('draws nothing without a trial', () => {
    expect(trialTimeline(null, now)).toBeNull();
    expect(trialTimeline(0, now)).toBeNull();
  });
  it('formats short dates without a locale', () => {
    expect(shortDate(new Date(2026, 0, 5))).toBe('5 Jan');
  });
});

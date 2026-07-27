import {
  FREE_EXERCISES,
  PRO_ENTITLEMENT,
  canStartExercise,
  canUse,
  isExerciseFree,
} from '../pro';

describe('pro gating', () => {
  it('push-ups and squats are free; nothing else is', () => {
    expect(isExerciseFree('push')).toBe(true);
    expect(isExerciseFree('squat')).toBe(true);
    expect(isExerciseFree('shoulder')).toBe(false);
    expect(isExerciseFree('stretch')).toBe(false);
  });

  it('the free set is exactly the two staples', () => {
    expect([...FREE_EXERCISES].sort()).toEqual(['push', 'squat']);
  });

  it('a free athlete can start the staples but not the rest', () => {
    expect(canStartExercise(false, 'push')).toBe(true);
    expect(canStartExercise(false, 'squat')).toBe(true);
    expect(canStartExercise(false, 'shoulder')).toBe(false);
  });

  it('a Pro athlete can start anything', () => {
    expect(canStartExercise(true, 'shoulder')).toBe(true);
    expect(canStartExercise(true, 'stretch')).toBe(true);
  });

  it('named Pro features are gated by isPro', () => {
    expect(canUse(false, 'form-history')).toBe(false);
    expect(canUse(false, 'advanced-stats')).toBe(false);
    expect(canUse(true, 'form-history')).toBe(true);
    expect(canUse(true, 'custom-programmes')).toBe(true);
  });

  it('the entitlement id is stable (matches the RevenueCat dashboard)', () => {
    expect(PRO_ENTITLEMENT).toBe('pro');
  });
});

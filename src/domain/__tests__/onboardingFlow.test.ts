import { firstWeekPlan, firstWeekTarget, blockerAnswer, goalPlan } from '@/domain/onboardingPlan';

describe('onboarding answers shape the plan end-to-end', () => {
  it('a beginner training 2 days gets a gentler week than a regular training 6', () => {
    const beginner = firstWeekTarget(2, 'new');
    const regular = firstWeekTarget(6, 'regular');
    expect(regular).toBeGreaterThan(beginner * 2);
  });

  it('each blocker leads to a different antidote headline', () => {
    expect(blockerAnswer('time').title).not.toBe(blockerAnswer('form').title);
  });

  it('the day ladder always sums to the levelled target', () => {
    for (const days of [1, 3, 5, 7]) {
      for (const level of ['new', 'returning', 'regular'] as const) {
        const plan = firstWeekPlan(days, level);
        const sum = plan.reduce((a, d) => a + d.target, 0);
        expect(sum).toBe(firstWeekTarget(days, level));
      }
    }
  });

  it('goal choice changes the focus shown on the plan screen', () => {
    expect(goalPlan('compete').focus).not.toBe(goalPlan('form').focus);
  });
});

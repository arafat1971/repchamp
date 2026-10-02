import { NECK_AND_NECK, stepsDuo, walkMinutes } from '../stepsDuo';

const base = { myGoal: 8000, theirGoal: 8000, name: 'Sam' };

describe('stepsDuo', () => {
  it('adds both counts toward a team goal', () => {
    const d = stepsDuo({ ...base, mine: 4000, theirs: 6000 });
    expect(d.together).toBe(10_000);
    expect(d.togetherGoal).toBe(16_000);
    expect(d.togetherPct).toBeCloseTo(0.625);
  });

  it('waits politely while their count is unknown', () => {
    const d = stepsDuo({ ...base, mine: 4000, theirs: null });
    expect(d.leader).toBeNull();
    expect(d.line).toBe("Waiting for Sam's steps");
  });

  it('calls a tie within the margin', () => {
    expect(stepsDuo({ ...base, mine: 5000, theirs: 5000 + NECK_AND_NECK }).leader).toBe('tie');
  });

  it('turns a deficit into minutes of walking', () => {
    const d = stepsDuo({ ...base, mine: 3000, theirs: 4800 });
    expect(d.leader).toBe('them');
    expect(d.line).toBe('1,800 behind Sam — a 20-min walk takes the lead');
  });

  it('celebrates both goals, and cheers a partner still going', () => {
    expect(stepsDuo({ ...base, mine: 9000, theirs: 8500 }).tone).toBe('win');
    expect(stepsDuo({ ...base, mine: 9000, theirs: 5000 }).line).toBe("You're done — cheer Sam through the last 3,000");
  });

  it('rounds walks up to five minutes', () => {
    expect(walkMinutes(120)).toBe(5);
    expect(walkMinutes(1800)).toBe(20);
  });
});

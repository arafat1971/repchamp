import type { CoupleMember } from '../couple';
import {
  DEFAULT_SHARING,
  partnerToday,
  sharingSummary,
  stepRace,
  stepRaceLine,
} from '../partnerSharing';

const TODAY = '2026-09-24';

function member(over: Partial<CoupleMember> = {}): CoupleMember {
  return {
    uid: 'bea',
    displayName: 'Bea',
    avatarUrl: null,
    trainedDays: [],
    totalReps: 0,
    ...over,
  };
}

describe('sharingSummary', () => {
  it('lists what is shared', () => {
    expect(sharingSummary(DEFAULT_SHARING, 'Bea')).toBe(
      "Bea sees your workouts and today's steps and water.",
    );
    expect(sharingSummary({ steps: false, water: true }, 'Bea')).toBe(
      "Bea sees your workouts and today's water.",
    );
  });

  it('says workouts are all that is left when both are off', () => {
    expect(sharingSummary({ steps: false, water: false }, 'Bea')).toBe(
      'Bea sees only the days you train.',
    );
  });
});

describe('stepRace', () => {
  it('is null when either side has no number', () => {
    expect(stepRace(null, 5000)).toBeNull();
    expect(stepRace(5000, null)).toBeNull();
    expect(stepRace(Number.NaN, 5000)).toBeNull();
  });

  it('calls a small gap level', () => {
    expect(stepRace(5000, 5050)).toEqual({ kind: 'level' });
  });

  it('reports who is ahead and by how much', () => {
    expect(stepRace(6200, 5000)).toEqual({ kind: 'ahead', by: 1200 });
    expect(stepRace(5000, 6200)).toEqual({ kind: 'behind', by: 1200 });
  });

  it('writes a line for each state and nothing for no race', () => {
    expect(stepRaceLine(null, 'Bea')).toBe('');
    expect(stepRaceLine({ kind: 'ahead', by: 1200 }, 'Bea')).toBe("You're 1,200 steps ahead of Bea");
    expect(stepRaceLine({ kind: 'behind', by: 1200 }, 'Bea')).toContain('Bea is 1,200 steps ahead');
    expect(stepRaceLine({ kind: 'level' }, 'Bea')).toContain('Neck and neck');
  });
});

describe('partnerToday', () => {
  it('shows shared metrics with a label and ring percent', () => {
    const view = partnerToday(
      member({ daily: { day: TODAY, steps: 4000, waterMl: 1000 } }),
      false,
      TODAY,
    );
    expect(view.steps).toEqual({ kind: 'shown', value: 4000, label: '4,000', percent: 50, met: false });
    expect(view.water.kind).toBe('shown');
  });

  /* The whole point of the switch: a withdrawn figure must read as not
     shared, never as zero. */
  it('treats absent, stale and zero metrics as unshared', () => {
    expect(partnerToday(member(), false, TODAY).steps).toEqual({ kind: 'unshared' });
    expect(
      partnerToday(member({ daily: { day: '2026-09-23', steps: 9000 } }), false, TODAY).steps,
    ).toEqual({ kind: 'unshared' });
    expect(partnerToday(member({ daily: { day: TODAY, waterMl: 0 } }), false, TODAY).water).toEqual({
      kind: 'unshared',
    });
  });

  it('caps the ring at 100 and marks the goal met', () => {
    const view = partnerToday(member({ daily: { day: TODAY, steps: 20000 } }), false, TODAY);
    expect(view.steps).toMatchObject({ percent: 100, met: true });
  });

  it('leads with who has trained today', () => {
    const trained = member({ trainedDays: [TODAY] });
    expect(partnerToday(trained, true, TODAY)).toMatchObject({
      trainedToday: true,
      bothTrainedToday: true,
      headline: 'You and Bea both trained today',
    });
    expect(partnerToday(trained, false, TODAY).headline).toBe('Bea trained today — your move');
    expect(partnerToday(member(), true, TODAY).headline).toBe("You're in. Bea hasn't trained yet");
  });

  it('stays silent when there is nothing to say', () => {
    expect(partnerToday(member(), false, TODAY).headline).toBe('');
    expect(partnerToday(null, false, TODAY).trainedToday).toBe(false);
  });
});

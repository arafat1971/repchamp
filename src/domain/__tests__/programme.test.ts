import {
  PUSHUP_LADDER,
  SQUAT_LADDER,
  advanceProgramme,
  getProgramme,
  programmeState,
  type ProgrammeProgress,
} from '../programme';

describe('programme templates', () => {
  it('the push-up ladder is 4 weeks of 5 days', () => {
    expect(PUSHUP_LADDER.weeks).toBe(4);
    expect(PUSHUP_LADDER.daysPerWeek).toBe(5);
    expect(PUSHUP_LADDER.days).toHaveLength(20);
  });

  it('day indices, weeks and rest flags are laid out correctly', () => {
    const first = PUSHUP_LADDER.days[0];
    expect(first).toMatchObject({ index: 1, week: 1, dayOfWeek: 1, target: 10, rest: false });
    // Mid-week rest is day 3 of each week.
    const rest = PUSHUP_LADDER.days.find((d) => d.week === 1 && d.dayOfWeek === 3);
    expect(rest?.rest).toBe(true);
    expect(rest?.target).toBe(0);
    // The final day is the 50-rep peak.
    expect(PUSHUP_LADDER.days.at(-1)).toMatchObject({ index: 20, week: 4, target: 50 });
  });

  it('squat ladder exists and targets squats', () => {
    expect(getProgramme('squat-ladder')).toBe(SQUAT_LADDER);
    expect(SQUAT_LADDER.days.every((d) => d.exercise === 'squat')).toBe(true);
  });

  it('unknown programme id resolves to null', () => {
    expect(getProgramme('nope')).toBeNull();
  });
});

describe('programmeState', () => {
  const progress: ProgrammeProgress = { programmeId: 'pushup-ladder', completedDays: 0 };

  it('starts on day 1 at 0%', () => {
    const s = programmeState(progress)!;
    expect(s.currentDay?.index).toBe(1);
    expect(s.completedDays).toBe(0);
    expect(s.percent).toBe(0);
    expect(s.finished).toBe(false);
  });

  it('points at the next unfinished day', () => {
    const s = programmeState({ programmeId: 'pushup-ladder', completedDays: 5 })!;
    expect(s.currentDay?.index).toBe(6);
    expect(s.percent).toBeCloseTo(5 / 20);
  });

  it('is finished with no current day once every day is done', () => {
    const s = programmeState({ programmeId: 'pushup-ladder', completedDays: 20 })!;
    expect(s.finished).toBe(true);
    expect(s.currentDay).toBeNull();
    expect(s.percent).toBe(1);
  });

  it('clamps a completedDays value beyond the programme length', () => {
    const s = programmeState({ programmeId: 'pushup-ladder', completedDays: 99 })!;
    expect(s.completedDays).toBe(20);
    expect(s.finished).toBe(true);
  });
});

describe('advanceProgramme', () => {
  const start: ProgrammeProgress = { programmeId: 'pushup-ladder', completedDays: 0 };

  it('advances when the day-1 target (10) is met', () => {
    const next = advanceProgramme(start, 'push', 12);
    expect(next.completedDays).toBe(1);
  });

  it('does NOT advance when reps fall short of the target', () => {
    const next = advanceProgramme(start, 'push', 8);
    expect(next.completedDays).toBe(0);
  });

  it('does NOT advance for the wrong exercise', () => {
    const next = advanceProgramme(start, 'squat', 50);
    expect(next.completedDays).toBe(0);
  });

  it('a rest day advances on any session', () => {
    // Day 3 (index 3) is the rest day → after 2 completed days.
    const atRest: ProgrammeProgress = { programmeId: 'pushup-ladder', completedDays: 2 };
    expect(programmeState(atRest)!.currentDay?.rest).toBe(true);
    const next = advanceProgramme(atRest, 'push', 0);
    expect(next.completedDays).toBe(3);
  });

  it('does nothing once the programme is finished', () => {
    const done: ProgrammeProgress = { programmeId: 'pushup-ladder', completedDays: 20 };
    expect(advanceProgramme(done, 'push', 100)).toEqual(done);
  });

  it('never mutates the input progress', () => {
    const frozen = Object.freeze({ programmeId: 'pushup-ladder', completedDays: 0 });
    expect(() => advanceProgramme(frozen, 'push', 20)).not.toThrow();
  });
});

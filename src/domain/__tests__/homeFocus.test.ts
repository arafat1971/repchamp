import { selectHomeFocus, type HomeFocusInput } from '../homeFocus';

/** A "nothing pressing, paired, trained today" baseline; tests override fields. */
function input(overrides: Partial<HomeFocusInput> = {}): HomeFocusInput {
  const { couple: coupleOverride, ...rest } = overrides;
  return {
    hasTrained: true,
    trainedToday: true,
    daysThisWeek: 1,
    weeklyGoal: 4,
    dailyChallenge: null,
    ...rest,
    couple: {
      paired: true,
      partnerName: 'Ayesha',
      streak: 3,
      atRisk: false,
      partnerTrainedToday: false,
      ...coupleOverride,
    },
  };
}

describe('selectHomeFocus — priority order', () => {
  it('1. first-session beats everything for a brand-new athlete', () => {
    const focus = selectHomeFocus(
      input({
        hasTrained: false,
        // Even with a streak at risk and partner trained, the first rep wins.
        couple: {
          paired: true,
          partnerName: 'Ayesha',
          streak: 5,
          atRisk: true,
          partnerTrainedToday: true,
        },
      }),
    );
    expect(focus.kind).toBe('first-session');
  });

  it('2. streak-at-risk beats partner-trained and everything below', () => {
    const focus = selectHomeFocus(
      input({
        trainedToday: false,
        couple: {
          paired: true,
          partnerName: 'Ayesha',
          streak: 7,
          atRisk: true,
          partnerTrainedToday: true, // would otherwise be partner-trained
        },
      }),
    );
    expect(focus).toEqual({ kind: 'streak-at-risk', partnerName: 'Ayesha', streak: 7 });
  });

  it('3. partner-trained fires when partner went and I have not (today)', () => {
    const focus = selectHomeFocus(
      input({
        trainedToday: false,
        couple: {
          paired: true,
          partnerName: 'Ayesha',
          streak: 2,
          atRisk: false,
          partnerTrainedToday: true,
        },
      }),
    );
    expect(focus).toEqual({ kind: 'partner-trained', partnerName: 'Ayesha' });
  });

  it('3b. partner-trained does NOT fire once I have also trained today', () => {
    const focus = selectHomeFocus(
      input({
        trainedToday: true,
        daysThisWeek: 1,
        couple: {
          paired: true,
          partnerName: 'Ayesha',
          streak: 2,
          atRisk: false,
          partnerTrainedToday: true,
        },
      }),
    );
    expect(focus.kind).not.toBe('partner-trained');
  });

  it('6. invite-partner is the fallback when there is no partner bonded', () => {
    const focus = selectHomeFocus(
      input({
        trainedToday: false,
        couple: {
          paired: false,
          partnerName: null,
          streak: 0,
          atRisk: false,
          partnerTrainedToday: false,
        },
      }),
    );
    expect(focus.kind).toBe('invite-partner');
  });

  it('4. daily-challenge when offered, unfinished, and nothing above applies', () => {
    const focus = selectHomeFocus(
      input({
        trainedToday: false,
        dailyChallenge: { exercise: 'push', target: 25, done: false },
      }),
    );
    expect(focus).toEqual({ kind: 'daily-challenge', exercise: 'push', target: 25 });
  });

  it('4b. a finished daily challenge is skipped', () => {
    const focus = selectHomeFocus(
      input({
        daysThisWeek: 1,
        dailyChallenge: { exercise: 'push', target: 25, done: true },
      }),
    );
    expect(focus.kind).not.toBe('daily-challenge');
  });

  it('5. goal-met when the weekly target is reached', () => {
    const focus = selectHomeFocus(input({ daysThisWeek: 4, weeklyGoal: 4 }));
    expect(focus).toEqual({ kind: 'goal-met', days: 4, goal: 4 });
  });

  it('7. recovery is the fallback when nothing is pressing', () => {
    const focus = selectHomeFocus(input({ daysThisWeek: 1, weeklyGoal: 4 }));
    expect(focus.kind).toBe('recovery');
  });
});

describe('selectHomeFocus — solo (no couple) paths', () => {
  const solo = {
    paired: false,
    partnerName: null,
    streak: 0,
    atRisk: false,
    partnerTrainedToday: false,
  } as const;

  /* The regression test for the whole reorder. `!paired` used to sit above the
     daily challenge with no other condition, which made it terminal: a solo
     athlete saw the invite and never anything else, so the adaptive hero was a
     constant for most of the userbase. */
  it('an open daily challenge beats the invite for a solo athlete', () => {
    const focus = selectHomeFocus(
      input({
        trainedToday: false,
        couple: { ...solo },
        dailyChallenge: { exercise: 'squat', target: 30, done: false },
      }),
    );
    expect(focus).toEqual({ kind: 'daily-challenge', exercise: 'squat', target: 30 });
  });

  it('a solo athlete who met their weekly goal is celebrated, not asked to invite', () => {
    const focus = selectHomeFocus(
      input({ couple: { ...solo }, daysThisWeek: 4, weeklyGoal: 4 }),
    );
    expect(focus).toEqual({ kind: 'goal-met', days: 4, goal: 4 });
  });

  it('a solo athlete still gets the invite when nothing else is pending', () => {
    const focus = selectHomeFocus(
      input({
        couple: { ...solo },
        dailyChallenge: null,
        daysThisWeek: 1,
        weeklyGoal: 4,
      }),
    );
    expect(focus.kind).toBe('invite-partner');
  });

  /* Paired, so rule 6 cannot fire — proves `recovery` is reachable at all and
     is not shadowed now that the invite sits directly above it. */
  it('recovery is still reachable once a partner is bonded', () => {
    const focus = selectHomeFocus(
      input({
        dailyChallenge: { exercise: 'push', target: 25, done: true },
        daysThisWeek: 1,
        weeklyGoal: 4,
      }),
    );
    expect(focus.kind).toBe('recovery');
  });
});

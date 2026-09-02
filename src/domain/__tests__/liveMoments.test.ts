import { momentFor, shouldShow, type MomentKind } from '../liveMoments';

const at = (o: Partial<Parameters<typeof momentFor>[0]> = {}) =>
  momentFor({ reps: 0, timeLeft: 60, personalBest: 0, target: null, ...o });

describe('momentFor — personal best', () => {
  /* The strongest hook in the app, and the session screen was not even
     loading `personalBests`. */
  it('warns one rep before the record', () => {
    expect(at({ reps: 19, personalBest: 20 })?.kind).toBe('pb-close');
  });

  it('celebrates the rep that beats it', () => {
    const m = at({ reps: 21, personalBest: 20 });
    expect(m?.kind).toBe('pb-beaten');
    expect(m?.triumphant).toBe(true);
  });

  /* Equalling is not beating — firing here would call a tie a record. */
  it('says nothing on the rep that merely equals it', () => {
    expect(at({ reps: 20, personalBest: 20 })).toBeNull();
  });

  /* A first-ever set has no record to chase, and "beat your best of 0" is
     nonsense. */
  it('is silent when there is no record yet', () => {
    expect(at({ reps: 1, personalBest: 0 })).toBeNull();
  });
});

describe('momentFor — target', () => {
  it('counts down the last rep', () => {
    expect(at({ reps: 24, target: 25 })?.kind).toBe('target-close');
  });

  it('marks the target met', () => {
    const m = at({ reps: 25, target: 25 });
    expect(m?.kind).toBe('target-hit');
    expect(m?.triumphant).toBe(true);
  });
});

describe('momentFor — round numbers', () => {
  it('fires one rep before a round number', () => {
    expect(at({ reps: 9 })?.kind).toBe('round-close');
  });

  /* Announcing a number already reached is a scoreboard, not a reason to do
     another rep. */
  it('does not fire on the round number itself', () => {
    expect(at({ reps: 10 })).toBeNull();
  });

  it('ignores numbers that are not round', () => {
    expect(at({ reps: 13 })).toBeNull();
  });
});

describe('momentFor — final push', () => {
  it('fires in the closing seconds', () => {
    expect(at({ reps: 12, timeLeft: 8 })?.kind).toBe('final-push');
  });

  /* "Everything you have" on zero reps is a taunt, not encouragement. */
  it('does not taunt someone who has not started', () => {
    expect(at({ reps: 0, timeLeft: 5 })).toBeNull();
  });

  it('does not fire on an untimed set', () => {
    expect(at({ reps: 12, timeLeft: null })).toBeNull();
  });

  it('does not fire once the clock is done', () => {
    expect(at({ reps: 12, timeLeft: 0 })).toBeNull();
  });
});

describe('momentFor — precedence', () => {
  /* Several can be true on one rep. The record is what actually changes
     whether someone does another, so it must win. */
  it('shows the record over the target and the clock', () => {
    const m = at({ reps: 21, personalBest: 20, target: 21, timeLeft: 5 });
    expect(m?.kind).toBe('pb-beaten');
  });

  it('shows the target over a round number', () => {
    const m = at({ reps: 24, target: 25 });
    expect(m?.kind).toBe('target-close');
  });

  it('is silent on an ordinary rep', () => {
    expect(at({ reps: 7, personalBest: 30, target: 40, timeLeft: 40 })).toBeNull();
  });
});

describe('shouldShow', () => {
  const shown = (...k: MomentKind[]) => new Set<MomentKind>(k);

  /* A cue that reappears every time the count wobbles teaches the athlete to
     ignore it. */
  it('lets each kind fire once per set', () => {
    expect(shouldShow('pb-close', shown())).toBe(true);
    expect(shouldShow('pb-close', shown('pb-close'))).toBe(false);
  });

  /* The exception: it counts the clock down, so it has to update. */
  it('always allows the final push, which tracks the clock', () => {
    expect(shouldShow('final-push', shown('final-push'))).toBe(true);
  });

  it('does not let one kind suppress another', () => {
    expect(shouldShow('pb-beaten', shown('pb-close'))).toBe(true);
  });
});

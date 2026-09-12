import type { Couple, CoupleMember } from '@/domain/couple';
import {
  contributionSplit,
  daysBothTrained,
  trackerHistory,
  trackerSummary,
  weeklyPace,
} from '@/domain/coupleTracker';

const TODAY = '2026-09-12';

function member(uid: string, trainedDays: string[], totalReps = 0): CoupleMember {
  return { uid, displayName: uid === 'me' ? 'Me' : 'Partner', avatarUrl: null, trainedDays, totalReps };
}

function couple(mine: string[], theirs: string[], myReps = 0, theirReps = 0): Couple {
  return {
    id: 'ABC234',
    memberUids: ['me', 'you'],
    members: [member('me', mine, myReps), member('you', theirs, theirReps)],
    pending: false,
  };
}

/** The `n` days ending today, oldest first. */
function recentDays(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(`${TODAY}T12:00:00`);
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

describe('trackerHistory', () => {
  it('labels each day by who trained', () => {
    const [d1, d2, d3] = recentDays(3);
    const history = trackerHistory(couple([d1!, d2!], [d1!, d3!]), 'me', TODAY, 3);

    expect(history.map((d) => d.status)).toEqual(['both', 'mine', 'theirs']);
  });

  it('marks today and returns oldest first', () => {
    const history = trackerHistory(couple([], []), 'me', TODAY, 5);
    expect(history).toHaveLength(5);
    expect(history[4]!.day).toBe(TODAY);
    expect(history[4]!.isToday).toBe(true);
    expect(history[0]!.isToday).toBe(false);
  });

  it('is empty-safe for an unpaired or missing couple', () => {
    expect(trackerHistory(null, 'me', TODAY, 7)).toHaveLength(7);
    expect(trackerHistory(null, 'me', TODAY, 7).every((d) => d.status === 'neither')).toBe(true);
  });

  it('reads the viewer from the couple rather than assuming a seat order', () => {
    const [only] = recentDays(1);
    // 'you' is the viewer here, so their day is "mine".
    const history = trackerHistory(couple([], [only!]), 'you', TODAY, 1);
    expect(history[0]!.status).toBe('mine');
  });
});

describe('daysBothTrained', () => {
  it('counts only days both partners trained', () => {
    const days = recentDays(4);
    const history = trackerHistory(
      couple([days[0]!, days[1]!, days[2]!], [days[0]!, days[2]!]),
      'me',
      TODAY,
      4,
    );
    expect(daysBothTrained(history)).toBe(2);
  });
});

describe('weeklyPace', () => {
  it('counts shared days against the goal', () => {
    const days = recentDays(7);
    const shared = [days[0]!, days[1]!, days[2]!];
    const pace = weeklyPace(couple(shared, shared), 'me', TODAY, 4);

    expect(pace.bothDays).toBe(3);
    expect(pace.goal).toBe(4);
    expect(pace.met).toBe(false);
    expect(pace.progress).toBeCloseTo(0.75);
  });

  it('reports met once the goal is reached, and clamps progress at 1', () => {
    const days = recentDays(7);
    const pace = weeklyPace(couple(days, days), 'me', TODAY, 3);
    expect(pace.met).toBe(true);
    expect(pace.progress).toBe(1);
  });

  it('never divides by zero or accepts a nonsense goal', () => {
    const pace = weeklyPace(couple([], []), 'me', TODAY, 0);
    expect(pace.goal).toBe(1);
    expect(Number.isFinite(pace.progress)).toBe(true);
    expect(pace.progress).toBe(0);
  });

  it('flags out-of-reach only when the goal can no longer be met', () => {
    // Trained together today, nothing else: 1 of 7, no days left in the window.
    const pace = weeklyPace(couple([TODAY], [TODAY]), 'me', TODAY, 7);
    expect(pace.met).toBe(false);
    expect(pace.outOfReach).toBe(true);
    expect(pace.mustTrainDaily).toBe(false);
  });

  it('does not call a met goal out of reach', () => {
    const days = recentDays(7);
    const pace = weeklyPace(couple(days, days), 'me', TODAY, 7);
    expect(pace.met).toBe(true);
    expect(pace.outOfReach).toBe(false);
  });
});

describe('contributionSplit', () => {
  it('splits reps and reports each partner by share', () => {
    const split = contributionSplit(couple([], [], 300, 100), 'me', TODAY);
    expect(split).not.toBeNull();
    expect(split!.combined).toBe(400);
    expect(split!.mine.share).toBeCloseTo(0.75);
    expect(split!.theirs.share).toBeCloseTo(0.25);
    expect(split!.balanced).toBe(false);
  });

  it('calls a near-even split balanced', () => {
    const split = contributionSplit(couple([], [], 105, 95), 'me', TODAY);
    expect(split!.balanced).toBe(true);
  });

  it('treats a zero total as even rather than dividing by zero', () => {
    const split = contributionSplit(couple([], [], 0, 0), 'me', TODAY);
    expect(split!.mine.share).toBe(0.5);
    expect(split!.theirs.share).toBe(0.5);
    expect(split!.balanced).toBe(true);
  });

  it('counts active days per partner within the window', () => {
    const days = recentDays(5);
    const split = contributionSplit(
      couple([days[0]!, days[1]!], [days[0]!], 10, 10),
      'me',
      TODAY,
      5,
    );
    expect(split!.mine.activeDays).toBe(2);
    expect(split!.theirs.activeDays).toBe(1);
  });

  it('returns null when there is no partner yet', () => {
    const solo: Couple = {
      id: 'ABC234',
      memberUids: ['me'],
      members: [member('me', [], 0)],
      pending: true,
    };
    expect(contributionSplit(solo, 'me', TODAY)).toBeNull();
    expect(contributionSplit(null, 'me', TODAY)).toBeNull();
  });
});

describe('trackerSummary', () => {
  it('measures the best run strictly, with no rest-day tolerance', () => {
    const days = recentDays(10);
    // Two runs of 2, separated by a gap — the forgiving streak rule would
    // bridge it, the record must not.
    const shared = [days[0]!, days[1]!, days[4]!, days[5]!];
    const summary = trackerSummary(couple(shared, shared), 'me', TODAY, 10);

    expect(summary.bestRun).toBe(2);
    expect(summary.bothDays).toBe(4);
  });

  it('reports consistency as a fraction of the window', () => {
    const days = recentDays(4);
    const shared = [days[0]!, days[1]!];
    const summary = trackerSummary(couple(shared, shared), 'me', TODAY, 4);
    expect(summary.consistency).toBeCloseTo(0.5);
  });

  it('is safe with no couple at all', () => {
    const summary = trackerSummary(null, 'me', TODAY, 7);
    expect(summary).toEqual({ streak: 0, bothDays: 0, bestRun: 0, consistency: 0 });
  });
});

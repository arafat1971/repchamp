import {
  BEHIND_PACE_THRESHOLD,
  HYDRATION_SLOTS,
  buildHydrationReminder,
  expectedByHour,
  shouldRemind,
} from '../hydrationReminder';
import type { DrinkEntry } from '../hydration';

const TODAY = '2026-09-23';

function drinks(...amounts: number[]): DrinkEntry[] {
  return amounts.map((ml, i) => ({
    id: `d${i}`,
    ml,
    at: `${TODAY}T09:00:00.000Z`,
    day: TODAY,
  }));
}

const ask = (ml: number[], hour: number, goalMl = 2000) =>
  buildHydrationReminder({ drinks: drinks(...ml), goalMl, day: TODAY, hour });

describe('pace across the day', () => {
  it('expects nothing before the day starts', () => {
    expect(expectedByHour(2000, 6)).toBe(0);
    expect(expectedByHour(2000, 8)).toBe(0);
  });

  it('expects the whole goal by the evening', () => {
    expect(expectedByHour(2000, 19)).toBe(2000);
    expect(expectedByHour(2000, 22)).toBe(2000);
  });

  it('rises across the waking window', () => {
    const morning = expectedByHour(2000, 11);
    const afternoon = expectedByHour(2000, 15);
    expect(morning).toBeGreaterThan(0);
    expect(afternoon).toBeGreaterThan(morning);
    expect(afternoon).toBeLessThan(2000);
  });
});

describe('when a reminder is worth sending', () => {
  it('asks someone who has logged nothing to start', () => {
    const copy = ask([], 11);
    expect(copy).not.toBeNull();
    expect(copy!.body).toMatch(/Nothing logged yet/);
  });

  /* Telling a person on zero that they have "2 L to go" is true and reads as
     a scold; the ask and the shortfall are different sentences. */
  it('does not tell someone on zero how far behind they are', () => {
    expect(ask([], 11)!.body).not.toMatch(/to go/);
  });

  it('tells someone part-way what is left', () => {
    const copy = ask([250], 15);
    expect(copy).not.toBeNull();
    expect(copy!.body).toMatch(/250 ml so far/);
    expect(copy!.body).toMatch(/to go today/);
  });

  it('says nothing once the goal is met', () => {
    expect(ask([2000], 11)).toBeNull();
    expect(ask([2500], 15)).toBeNull();
  });

  /* The rule that keeps this from becoming noise: someone tracking roughly on
     target hears nothing at all. */
  it('says nothing to someone on pace', () => {
    const expected = expectedByHour(2000, 15);
    expect(ask([expected], 15)).toBeNull();
  });

  it('speaks only once the shortfall is real', () => {
    const expected = expectedByHour(2000, 15);
    const justOnPace = Math.ceil(expected * BEHIND_PACE_THRESHOLD);
    expect(ask([justOnPace], 15)).toBeNull();
    expect(ask([justOnPace - 100], 15)).not.toBeNull();
  });

  it('says nothing before the day has started', () => {
    expect(ask([], 6)).toBeNull();
    expect(ask([], 8)).toBeNull();
  });

  it('respects a goal the athlete lowered', () => {
    // 500 ml by 15:00 is behind against 2 L, but met against a 500 ml goal.
    expect(ask([500], 15, 500)).toBeNull();
    expect(ask([500], 15, 2000)).not.toBeNull();
  });
});

describe('the copy itself', () => {
  it('names water so the notification is identifiable at a glance', () => {
    expect(ask([], 11)!.title).toBe('Water');
  });

  /* Same discipline as the training reminders: state the fact, never
     manufacture urgency or guilt. */
  it('never manufactures urgency', () => {
    for (const hour of HYDRATION_SLOTS) {
      for (const logged of [[], [250], [1000]]) {
        const copy = buildHydrationReminder({
          drinks: drinks(...logged),
          goalMl: 2000,
          day: TODAY,
          hour,
        });
        if (!copy) continue;
        expect(copy.body).not.toMatch(/hurry|now!|don't forget|failing|behind schedule|!$/i);
      }
    }
  });

  it('uses the same units the card does', () => {
    expect(ask([1500], 15, 4000)!.body).toMatch(/1\.5 L/);
  });
});

describe('the slots', () => {
  /* Both must leave enough day to act on, and both must clear the 19:00
     training slot so the athlete never gets two pings in one hour. */
  it('sit inside the waking window and before the evening reminder', () => {
    for (const hour of HYDRATION_SLOTS) {
      expect(hour).toBeGreaterThan(8);
      expect(hour).toBeLessThan(19);
    }
  });

  it('are spaced apart rather than clustered', () => {
    const [first, second] = HYDRATION_SLOTS;
    expect(second - first).toBeGreaterThanOrEqual(3);
  });

  /* Two is the cap. A third ping is how a helpful reminder becomes the reason
     someone turns notifications off. */
  it('are capped at two a day', () => {
    expect(HYDRATION_SLOTS.length).toBe(2);
  });
});

describe('shouldRemind', () => {
  it('agrees with whether copy was built', () => {
    const cases = [
      { ml: [] as number[], hour: 11 },
      { ml: [2000], hour: 11 },
      { ml: [250], hour: 15 },
      { ml: [], hour: 6 },
    ];
    for (const c of cases) {
      const copy = ask(c.ml, c.hour);
      expect(shouldRemind({ drinks: drinks(...c.ml), goalMl: 2000, day: TODAY, hour: c.hour }))
        .toBe(copy !== null);
    }
  });
});

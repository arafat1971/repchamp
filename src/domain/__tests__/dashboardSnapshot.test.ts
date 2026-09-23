import {
  DASHBOARD_STALE_AFTER_MS,
  buildDashboardSnapshot,
  isDashboardStale,
} from '../dashboardSnapshot';
import type { DrinkEntry } from '../hydration';
import type { StepsState } from '../steps';

const TODAY = '2026-09-23';

function drink(ml: number, id = `d${ml}`, day = TODAY): DrinkEntry {
  return { id, ml, at: `${day}T09:00:00.000Z`, day };
}

const READY = (steps: number, goal = 8000): StepsState => ({ status: 'ready', steps, goal });
const UNAVAILABLE: StepsState = { status: 'unavailable', reason: 'unsupported' };

describe('what the dashboard shows', () => {
  it('formats water as the athlete reads it elsewhere', () => {
    const s = buildDashboardSnapshot([drink(1500)], 2000, UNAVAILABLE, null, TODAY);
    expect(s.waterLabel).toBe('1.5 L');
    expect(s.waterPercent).toBe(75);
    expect(s.waterMet).toBe(false);
  });

  it('groups a step count so five digits stay readable', () => {
    const s = buildDashboardSnapshot([], 2000, READY(12045), null, TODAY);
    expect(s.stepsLabel).toBe('12,045');
    expect(s.stepsKnown).toBe(true);
  });

  /* The Android case. A zero would read as "you have not moved today"; the
     absent flag lets the widget draw an empty ring and say why instead. */
  it('marks steps unknown rather than reporting zero', () => {
    const s = buildDashboardSnapshot([], 2000, UNAVAILABLE, null, TODAY);
    expect(s.stepsKnown).toBe(false);
    expect(s.stepsLabel).toBe('');
    expect(s.stepsPercent).toBe(0);
  });

  it('names the partner only when there is something to report', () => {
    const withPartner = buildDashboardSnapshot(
      [], 2000, UNAVAILABLE, { name: 'Sam', ml: 1500 }, TODAY,
    );
    expect(withPartner.partnerLine).toBe('Sam had 1.5 L today');

    const without = buildDashboardSnapshot([], 2000, UNAVAILABLE, null, TODAY);
    expect(without.partnerLine).toBe('');
  });
});

describe('the headline', () => {
  /* Ordered by what a glance can still change: an unmet water goal outranks
     an unmet step goal, and both outrank congratulations. */
  it('leads with the water still to drink', () => {
    const s = buildDashboardSnapshot([drink(500)], 2000, READY(2000), null, TODAY);
    expect(s.headline).toBe('1.5 L of water to go');
  });

  it('falls to steps once water is done', () => {
    const s = buildDashboardSnapshot([drink(2000)], 2000, READY(5000), null, TODAY);
    expect(s.headline).toBe('3,000 steps to go');
  });

  it('celebrates only when both are actually closed', () => {
    const s = buildDashboardSnapshot([drink(2000)], 2000, READY(8000), null, TODAY);
    expect(s.headline).toBe('Both goals closed today');
  });

  /* On a phone that cannot count steps, a closed water goal is the whole
     story — claiming "both" would be claiming something unmeasured. */
  it('does not claim both goals when steps are unknown', () => {
    const s = buildDashboardSnapshot([drink(2000)], 2000, UNAVAILABLE, null, TODAY);
    expect(s.headline).toBe('Water goal closed');
  });

  it('says nothing rather than filler on a fresh day', () => {
    const s = buildDashboardSnapshot([], 2000, UNAVAILABLE, null, TODAY);
    expect(s.headline).toBe('2 L of water to go');
  });

  it('never manufactures urgency', () => {
    const cases: StepsState[] = [READY(0), READY(8000), UNAVAILABLE];
    for (const steps of cases) {
      const s = buildDashboardSnapshot([drink(500)], 2000, steps, null, TODAY);
      expect(s.headline).not.toMatch(/now|hurry|don't|last chance|!|\?/i);
    }
  });
});

describe('the payload itself', () => {
  /* Same contract as the partner widget: native code can only read
     primitives out of a flat JSON blob. */
  it('carries only primitives', () => {
    const s = buildDashboardSnapshot(
      [drink(500)], 2000, READY(4000), { name: 'Sam', ml: 1000 }, TODAY,
    );
    for (const value of Object.values(s)) {
      expect(['string', 'number', 'boolean']).toContain(typeof value);
    }
  });

  it('survives a JSON round trip unchanged', () => {
    const s = buildDashboardSnapshot([drink(500)], 2000, READY(4000), null, TODAY);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });

  it('stamps when it was built', () => {
    const s = buildDashboardSnapshot([], 2000, UNAVAILABLE, null, TODAY, 1_000_000);
    expect(s.updatedAt).toBe(1_000_000);
  });
});

describe('staleness', () => {
  it('is fresh inside the window', () => {
    expect(isDashboardStale({ updatedAt: 1000 }, 1000 + DASHBOARD_STALE_AFTER_MS - 1)).toBe(false);
  });

  it('is stale past it', () => {
    expect(isDashboardStale({ updatedAt: 1000 }, 1000 + DASHBOARD_STALE_AFTER_MS + 1)).toBe(true);
  });

  /* One rule for both widgets — an athlete seeing two cards age differently
     would reasonably assume one of them was broken. */
  it('uses the same window as the partner widget', () => {
    expect(DASHBOARD_STALE_AFTER_MS).toBe(12 * 60 * 60 * 1000);
  });
});

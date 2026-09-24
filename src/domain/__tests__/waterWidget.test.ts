import { readFileSync } from 'fs';
import { join } from 'path';

import { buildWaterWidgetSnapshot, repsOnDay } from '@/domain/waterWidget';
import { WIDGET_SNAPSHOT_KEYS } from '@/domain/widgetSnapshot';

const base = { name: 'Nkll', day: '2026-09-24', ml: 0 };

describe('buildWaterWidgetSnapshot', () => {
  it('reads an empty day as an empty bear, not a broken one', () => {
    const s = buildWaterWidgetSnapshot(base, 1);
    expect(s).toMatchObject({
      amount: '0 ml',
      goal: 'of 2 L',
      status: 'No drinks yet',
      last: '',
      lastAt: 0,
      pct: 0,
      met: false,
      layers: [],
      updatedAt: 1,
    });
  });

  it('fills against the partner’s own goal, and says what is left', () => {
    const s = buildWaterWidgetSnapshot({ ...base, ml: 1250, goalMl: 2500 });
    expect(s.amount).toBe('1.25 L');
    expect(s.goal).toBe('of 2.5 L');
    expect(s.pct).toBe(0.5);
    expect(s.status).toBe('1.25 L to go');
  });

  it('falls back to the default goal when the synced one is missing or absurd', () => {
    expect(buildWaterWidgetSnapshot({ ...base, ml: 500, goalMl: null }).goal).toBe('of 2 L');
    expect(buildWaterWidgetSnapshot({ ...base, ml: 500, goalMl: 90 }).goal).toBe('of 2 L');
  });

  it('caps the fill at full and celebrates the goal', () => {
    const s = buildWaterWidgetSnapshot({ ...base, ml: 3100, goalMl: 2000 });
    expect(s.pct).toBe(1);
    expect(s.met).toBe(true);
    expect(s.status).toBe('Goal met 🎉');
  });

  it('stacks the drinks in their colours, with the top band on the fill line', () => {
    const s = buildWaterWidgetSnapshot({
      ...base,
      ml: 1000,
      goalMl: 2000,
      layers: [
        { k: 'water', ml: 750 },
        { k: 'coffee', ml: 250 },
      ],
    });
    expect(s.layers).toEqual([
      { c: '#38bdf8', t: 0.375 },
      { c: '#8b5a2b', t: 0.5 },
    ]);
  });

  it('reads a total with no layers (an older app) as all water', () => {
    const s = buildWaterWidgetSnapshot({ ...base, ml: 400 });
    expect(s.layers).toEqual([{ c: '#38bdf8', t: 0.2 }]);
  });

  it('names the latest drink, and reads an unknown kind as water', () => {
    const at = Date.UTC(2026, 8, 24, 14, 0);
    const coffee = buildWaterWidgetSnapshot({ ...base, ml: 250, last: { k: 'coffee', ml: 250, at } });
    expect(coffee.last).toBe('☕ Coffee · 250 ml');
    expect(coffee.lastAt).toBe(at);
    const odd = buildWaterWidgetSnapshot({ ...base, ml: 250, last: { k: 'kombucha', ml: 250, at } });
    expect(odd.last).toBe('💧 Water · 250 ml');
  });

  it('drops a latest drink when nothing is left on the total', () => {
    const s = buildWaterWidgetSnapshot({ ...base, ml: 0, last: { k: 'tea', ml: 250, at: 5 } });
    expect(s.last).toBe('');
    expect(s.lastAt).toBe(0);
  });

  it('titles the card with their name, or a fallback', () => {
    expect(buildWaterWidgetSnapshot(base).title).toBe('Nkll · Today');
    expect(buildWaterWidgetSnapshot({ ...base, name: '  ' }).title).toBe('Your partner · Today');
  });
});

describe('steps and reps rings', () => {
  it('reads a missing step count as not shared, never zero steps', () => {
    const s = buildWaterWidgetSnapshot({ ...base, steps: null });
    expect(s).toMatchObject({ steps: '—', stepsGoal: 'steps · not shared', stepsPct: 0 });
    const known = buildWaterWidgetSnapshot({ ...base, steps: 6000 });
    expect(known).toMatchObject({ steps: '6,000', stepsGoal: 'of 8,000 steps', stepsPct: 0.75 });
  });

  it('fills the reps ring toward a hundred and names their main movement', () => {
    const s = buildWaterWidgetSnapshot({ ...base, reps: 45, topExercise: 'Squat' });
    expect(s).toMatchObject({ reps: '45', repsDetail: 'reps · Squat', repsPct: 0.45 });
    expect(buildWaterWidgetSnapshot({ ...base, reps: 0, topExercise: 'Squat' }).repsDetail).toBe('reps');
    expect(buildWaterWidgetSnapshot({ ...base, reps: 250 }).repsPct).toBe(1);
  });

  it('celebrates only when every ring is closed', () => {
    const all = buildWaterWidgetSnapshot({ ...base, ml: 2000, steps: 9000, reps: 120 });
    expect(all.allMet).toBe(true);
    expect(all.footer).toBe('Closed every ring today 🎉');
    expect(all.footerAt).toBe(0);
    expect(buildWaterWidgetSnapshot({ ...base, ml: 2000, steps: null, reps: 120 }).allMet).toBe(false);
  });

  it('footers the last drink with its time, else water’s status', () => {
    const at = 1_790_000_000_000;
    const s = buildWaterWidgetSnapshot({ ...base, ml: 250, last: { k: 'tea', ml: 250, at } });
    expect(s.footer).toBe('🍵 Tea · 250 ml');
    expect(s.footerAt).toBe(at);
    expect(buildWaterWidgetSnapshot({ ...base, ml: 500 }).footer).toBe('1.5 L to go');
  });

  it('marks activity by the latest drink or set', () => {
    const s = buildWaterWidgetSnapshot({ ...base, ml: 250, last: { k: 'water', ml: 250, at: 100 }, trainedAt: 900 });
    expect(s.activeAt).toBe(900);
  });

  it('carries my numbers only when built on my phone', () => {
    expect(buildWaterWidgetSnapshot(base)).toMatchObject({ meWater: '', meSteps: '', meReps: '' });
    const mine = buildWaterWidgetSnapshot({ ...base, me: { ml: 1000, steps: null, reps: 30 } });
    expect(mine).toMatchObject({ meWater: '1 L', meSteps: '—', meReps: '30' });
  });
});

describe('repsOnDay', () => {
  const s = (day: string, exercise: string, reps: number, completedAt?: string) => ({ day, exercise, reps, completedAt });

  it('sums today, picks the main movement, and finds the last set', () => {
    const out = repsOnDay(
      [
        s('2026-09-24', 'squat', 20, '2026-09-24T08:00:00Z'),
        s('2026-09-24', 'push', 15, '2026-09-24T09:00:00Z'),
        s('2026-09-24', 'squat', 10, '2026-09-24T07:00:00Z'),
        s('2026-09-23', 'push', 99, '2026-09-23T09:00:00Z'),
        s('2026-09-24', 'push', 0, '2026-09-24T10:00:00Z'),
      ],
      '2026-09-24',
    );
    expect(out).toEqual({ reps: 45, top: 'squat', trainedAt: Date.parse('2026-09-24T09:00:00Z') });
  });

  it('is empty on a day with nothing', () => {
    expect(repsOnDay([], '2026-09-24')).toEqual({ reps: 0, top: null, trainedAt: 0 });
  });
});

describe('the water payload matches what the native side reads', () => {
  const templates = readFileSync(
    join(__dirname, '..', '..', '..', 'plugins', 'waterWidgetTemplates.js'),
    'utf8',
  );

  it('writes every key the Kotlin provider asks for', () => {
    const read = [
      ...templates.matchAll(/opt(?:String|Int|Long|Double|Boolean|JSONArray)\("([a-zA-Z]+)"/g),
    ].map((m) => m[1] as string);
    expect(read.length).toBeGreaterThan(0);

    const written = new Set([
      ...Object.keys(buildWaterWidgetSnapshot(base)),
      // Inside each layer, and the push envelope the messaging service reads.
      'c',
      't',
      'type',
    ]);
    for (const key of new Set(read)) expect(written).toContain(key);
  });

  it('agrees with the provider and the messaging service on the storage key', () => {
    expect(templates).toContain(WIDGET_SNAPSHOT_KEYS.water);
  });

  it('matches the silent push type the sender uses', () => {
    const sender = readFileSync(
      join(__dirname, '..', '..', 'services', 'coupleService.ts'),
      'utf8',
    );
    expect(sender).toContain("type: 'partner-water'");
    expect(templates).toContain('"partner-water"');
  });
});

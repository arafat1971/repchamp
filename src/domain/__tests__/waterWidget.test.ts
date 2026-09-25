import { readFileSync } from 'fs';
import { join } from 'path';

import {
  DEFAULT_WIDGET_STYLE,
  buildWaterWidgetSnapshot,
  duelLine,
  nextOutfit,
  repsOnDay,
  sippedTogether,
} from '@/domain/waterWidget';
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

describe('widget style', () => {
  it('marks a copy without a style as unstyled, so the native side keeps the old look', () => {
    const s = buildWaterWidgetSnapshot(base);
    expect(s).toMatchObject({ styled: false, ...DEFAULT_WIDGET_STYLE });
  });

  it('carries the look chosen on this phone', () => {
    const style = { layout: 'rings' as const, theme: 'ocean' as const, weather: false, showSteps: false, showReps: true, showMine: false, motion: false };
    expect(buildWaterWidgetSnapshot({ ...base, style })).toMatchObject({ styled: true, ...style });
  });
});

describe('the duo', () => {
  const now = 1_790_000_000_000;

  it('carries both sides as raw numbers for the tug-of-war', () => {
    const s = buildWaterWidgetSnapshot(
      {
        ...base,
        ml: 1400,
        steps: 6000,
        reps: 30,
        me: { ml: 1000, steps: null, reps: 45, goalMl: 2000, layers: [{ k: 'coffee', ml: 1000 }] },
      },
      now,
    );
    expect(s).toMatchObject({
      vs: 'Nkll vs you',
      waterMl: 1400,
      stepsN: 6000,
      repsN: 30,
      hasMe: true,
      meWaterMl: 1000,
      meStepsN: -1,
      meRepsN: 45,
      mePct: 0.5,
      meMet: false,
      meLayers: [{ c: '#8b5a2b', t: 0.5 }],
    });
  });

  it('marks a copy built without my numbers, so the native side keeps mine', () => {
    expect(buildWaterWidgetSnapshot(base)).toMatchObject({ hasMe: false, meLayers: [], meStepsN: -1 });
  });
});

describe('duelLine', () => {
  const me = (ml: number, reps = 0, met = false) => ({ ml, reps, met });
  const line = (over: Partial<Parameters<typeof duelLine>[0]>) =>
    duelLine({ name: 'Bea', ml: 0, met: false, reps: 0, fresh: null, me: me(0), ...over });

  it('celebrates when both bears are full', () => {
    expect(line({ ml: 2000, met: true, me: me(2100, 0, true) })).toBe('Both bears full — dream team 🎉');
  });

  it('puts a splash from them first, after a shared win', () => {
    expect(line({ ml: 500, cheered: true, fresh: 'juice 🧃' })).toBe('Bea splashed you 💦 — drink up!');
    expect(line({ ml: 2000, met: true, cheered: true, me: me(2100, 0, true) })).toBe('Both bears full — dream team 🎉');
  });

  it('shows a reaction, the Sunday wrap and a hot-day hint in their turn', () => {
    expect(line({ ml: 500, reacted: '❤️' })).toBe('Bea sent you ❤️');
    expect(line({ ml: 500, me: me(500), wrap: 'Week wrap: you 2 · Bea 1 · 🌈 1' })).toBe('Week wrap: you 2 · Bea 1 · 🌈 1');
    expect(line({ ml: 500, me: me(520), hot: 31 })).toBe('It’s 31° — both bears need extra 💧');
    expect(line({ ml: 1400, me: me(1000), hot: 31 })).toBe('Bea is 400 ml ahead 💧 catch up!');
  });

  it('turns a fresh drink into a nudge', () => {
    expect(line({ ml: 500, fresh: 'juice 🧃' })).toBe('Bea just had juice 🧃 — your move!');
  });

  it('names the water gap either way', () => {
    expect(line({ ml: 1400, me: me(1000) })).toBe('Bea is 400 ml ahead 💧 catch up!');
    expect(line({ ml: 500, me: me(1500) })).toBe('You’re 1 L ahead — keep it flowing 💪');
  });

  it('falls back to reps when water is level', () => {
    expect(line({ ml: 500, reps: 40, me: me(500, 20) })).toBe('Bea out-repped you by 20 💪 your turn');
    expect(line({ ml: 500, reps: 5, me: me(500, 30) })).toBe('You lead reps by 25 — Bea owes you a set');
  });

  it('opens the day, and calls a draw a draw', () => {
    expect(line({})).toBe('First sip wins the day ☀️');
    expect(line({ ml: 500, reps: 10, me: me(520, 12) })).toBe('Neck and neck today 🤝');
  });

  it('speaks about them alone without my numbers', () => {
    expect(line({ me: null, ml: 750 })).toBe('Bea is at 750 ml today 💧');
    expect(line({ me: null, ml: 2000, met: true })).toBe('Bea filled their bear 🎉 — can you?');
    expect(line({ me: null })).toBe('Bea hasn’t had a sip yet ☀️');
  });
});

describe('sipping together', () => {
  const now = 1_790_000_000_000;
  it('counts two drinks within ten minutes, while the later one is fresh', () => {
    expect(sippedTogether(now - 5 * 60_000, now - 60_000, now)).toBe(true);
    expect(sippedTogether(now - 20 * 60_000, now - 60_000, now)).toBe(false);
    expect(sippedTogether(now - 40 * 60_000, now - 35 * 60_000, now)).toBe(false);
    expect(sippedTogether(0, now, now)).toBe(false);
  });

  it('leads the rivalry line after a splash', () => {
    const s = buildWaterWidgetSnapshot(
      { ...base, ml: 250, last: { k: 'water', ml: 250, at: now - 120_000 }, me: { ml: 250, steps: null, reps: 0, lastAt: now - 60_000 } },
      now,
    );
    expect(s.duel).toBe('You sipped together 🥂 — cheers!');
    expect(s.meLastAt).toBe(now - 60_000);
  });
});

describe('weather and reactions in the payload', () => {
  const now = 1_790_000_000_000;
  it('paints fresh weather and drops stale', () => {
    const fresh = buildWaterWidgetSnapshot({ ...base, weather: { kind: 'rain', tempC: 24.4, at: now - 60_000 } }, now);
    expect(fresh).toMatchObject({ sky: 'rain', temp: '🌧️ 24°' });
    const stale = buildWaterWidgetSnapshot({ ...base, weather: { kind: 'rain', tempC: 24, at: now - 5 * 3600_000 } }, now);
    expect(stale).toMatchObject({ sky: '', temp: '' });
  });

  it('carries a reaction and the meadow', () => {
    const s = buildWaterWidgetSnapshot({ ...base, react: { at: now - 1000, emoji: '🔥' }, week: { meadow: [2, 0, 0, 0, 0, 0, 0], wrap: null } }, now);
    expect(s).toMatchObject({ reactAt: now - 1000, reactEmoji: '🔥', meadow: [2, 0, 0, 0, 0, 0, 0], duel: 'Nkll sent you 🔥' });
  });
});

describe('wardrobe', () => {
  it('names the next outfit to earn', () => {
    expect(nextOutfit(0)?.id).toBe('sunglasses');
    expect(nextOutfit(3)?.id).toBe('crown');
    expect(nextOutfit(13)?.id).toBe('party-hat');
    expect(nextOutfit(29)?.id).toBe('wings');
    expect(nextOutfit(30)).toBeNull();
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

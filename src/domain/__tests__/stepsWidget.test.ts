import { readFileSync } from 'fs';
import { join } from 'path';

import { buildStepsWidgetSnapshot } from '@/domain/stepsWidget';
import { WIDGET_SNAPSHOT_KEYS } from '@/domain/widgetSnapshot';

const NOON = new Date(2026, 9, 15, 12, 0);

describe('buildStepsWidgetSnapshot', () => {
  it('solo: no partner fields, the pace line, a percent badge', () => {
    const s = buildStepsWidgetSnapshot({ day: '2026-10-15', mine: 4000, myGoal: 8000, partner: null, theirGoal: 8000, now: NOON });
    expect(s.name).toBe('');
    expect(s.theirs).toBe(-1);
    expect(s.badge).toBe('50%');
    expect(s.line.length).toBeGreaterThan(0);
  });

  it('solo with no count reads -1, not 0', () => {
    const s = buildStepsWidgetSnapshot({ day: '2026-10-15', mine: null, myGoal: 8000, partner: null, theirGoal: 8000, now: NOON });
    expect(s.mine).toBe(-1);
    expect(s.badge).toBe('');
  });

  it('paired: who leads, and what is left as a team', () => {
    const s = buildStepsWidgetSnapshot({
      day: '2026-10-15',
      mine: 3000,
      myGoal: 8000,
      partner: { name: 'Sam', steps: 6000 },
      theirGoal: 8000,
      now: NOON,
    });
    expect(s.badge).toBe('Sam leads');
    expect(s.theirs).toBe(6000);
    expect(s.line).toContain('7,000 left as a team');
  });

  it('paired, partner not sharing yet', () => {
    const s = buildStepsWidgetSnapshot({
      day: '2026-10-15',
      mine: 3000,
      myGoal: 8000,
      partner: { name: 'Sam', steps: null },
      theirGoal: 8000,
      now: NOON,
    });
    expect(s.theirs).toBe(-1);
    expect(s.badge).toBe('');
  });

  it('both done: the team line', () => {
    const s = buildStepsWidgetSnapshot({
      day: '2026-10-15',
      mine: 9000,
      myGoal: 8000,
      partner: { name: 'Sam', steps: 8500 },
      theirGoal: 8000,
      now: NOON,
    });
    expect(s.line).toBe('Team goal smashed — together 🎉');
  });
});

describe('the steps payload matches what the provider reads', () => {
  const kt = readFileSync(join(__dirname, '..', '..', '..', 'plugins', 'stepsWidgetTemplates.js'), 'utf8');

  it('writes every key the Kotlin asks for', () => {
    const read = [...kt.matchAll(/opt(?:String|Int|Long)\("([a-zA-Z]+)"/g)].map((m) => m[1] as string);
    expect(read.length).toBeGreaterThan(0);
    const written = Object.keys(
      buildStepsWidgetSnapshot({ day: 'x', mine: 1, myGoal: 8000, partner: { name: 'A', steps: 1 }, theirGoal: 8000, now: NOON }),
    );
    /* `stepsN` and `day` on the partner push come from the water payload. */
    for (const key of new Set(read)) {
      if (key === 'stepsN') continue;
      expect(written).toContain(key);
    }
  });

  it('agrees on the storage key', () => {
    expect(kt).toContain(WIDGET_SNAPSHOT_KEYS.steps);
  });
});

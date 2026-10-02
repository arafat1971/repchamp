import {
  MEDITATIONS,
  YOGA_FLOWS,
  breathPhaseAt,
  breathResumeAt,
  cleanLog,
  cycleSeconds,
  doneOn,
  earnsTick,
  flowMinutes,
  flowSeconds,
  meditation,
  minutesOn,
  patternLabel,
  poseAt,
  poseCount,
  stepLabel,
  stepStart,
  withMindfulEntry,
  yogaFlow,
  type MindfulEntry,
} from '@/domain/mindful';

const flow = { steps: [{ pose: 'mountain' as const, seconds: 30 }, { pose: 'cobra' as const, seconds: 20 }] };

describe('poseAt', () => {
  it('holds the first pose from the start', () => {
    expect(poseAt(flow, 0)).toEqual({ index: 0, left: 30, done: false });
    expect(poseAt(flow, 29.5)).toEqual({ index: 0, left: 1, done: false });
  });

  it('moves on exactly at the boundary', () => {
    expect(poseAt(flow, 30)).toEqual({ index: 1, left: 20, done: false });
  });

  /* A late clock tick past the end must not index off the array. */
  it('pins to the last step once the flow is over', () => {
    expect(poseAt(flow, 50)).toEqual({ index: 1, left: 0, done: true });
    expect(poseAt(flow, 500)).toEqual({ index: 1, left: 0, done: true });
  });

  it('finds where each step starts, for skip and back', () => {
    expect(stepStart(flow, 0)).toBe(0);
    expect(stepStart(flow, 1)).toBe(30);
    expect(stepStart(flow, -1)).toBe(0);
  });
});

describe('earnsTick', () => {
  /* Skipping to the end must not tick the habit. */
  it('needs most of the flow actually held', () => {
    expect(earnsTick(10, 470)).toBe(false);
    expect(earnsTick(376, 470)).toBe(true);
    expect(earnsTick(375, 470)).toBe(false);
    expect(earnsTick(0, 0)).toBe(false);
  });
});

describe('flow summaries', () => {
  it('rounds minutes rather than truncating them', () => {
    expect(flowSeconds(flow)).toBe(50);
    expect(flowMinutes(flow)).toBe(1);
    expect(flowMinutes({ steps: [{ pose: 'child', seconds: 470 }] })).toBe(8);
  });

  it('counts a both-sides pose once', () => {
    expect(
      poseCount({
        steps: [
          { pose: 'tree', seconds: 30, side: 'right' },
          { pose: 'tree', seconds: 30, side: 'left' },
        ],
      }),
    ).toBe(1);
  });

  it('names the side when there is one', () => {
    expect(stepLabel({ pose: 'low-lunge', seconds: 40, side: 'right' })).toBe('Low lunge, right side');
    expect(stepLabel({ pose: 'cobra', seconds: 30 })).toBe('Cobra');
  });

  /* Every one-sided pose should be done on both sides, or the flow is lopsided. */
  it('balances every sided pose in the shipped flows', () => {
    for (const f of YOGA_FLOWS) {
      const right = f.steps.filter((s) => s.side === 'right').map((s) => s.pose).sort();
      const left = f.steps.filter((s) => s.side === 'left').map((s) => s.pose).sort();
      expect(left).toEqual(right);
    }
  });

  it('falls back to the first flow for an unknown id', () => {
    expect(yogaFlow('nope').id).toBe(YOGA_FLOWS[0]!.id);
    expect(yogaFlow('evening').id).toBe('evening');
  });
});

describe('breathPhaseAt', () => {
  const box = { in: 4, hold: 4, out: 4, rest: 4 };
  const calm = { in: 4, hold: 0, out: 6, rest: 0 };

  it('walks the four phases of box breathing', () => {
    expect(breathPhaseAt(box, 0)).toEqual({ phase: 'in', left: 4 });
    expect(breathPhaseAt(box, 4000)).toEqual({ phase: 'hold', left: 4 });
    expect(breathPhaseAt(box, 8500)).toEqual({ phase: 'out', left: 4 });
    expect(breathPhaseAt(box, 15_000)).toEqual({ phase: 'rest', left: 1 });
    expect(breathPhaseAt(box, 16_000)).toEqual({ phase: 'in', left: 4 });
  });

  it('never reports a zero-length hold', () => {
    for (let ms = 0; ms < 20_000; ms += 250) {
      expect(breathPhaseAt(calm, ms).phase).not.toBe('hold');
      expect(breathPhaseAt(calm, ms).phase).not.toBe('rest');
    }
    expect(breathPhaseAt(calm, 4000).phase).toBe('out');
  });

  it('labels patterns without their zero phases', () => {
    expect(patternLabel(calm)).toBe('4 · 6');
    expect(patternLabel({ in: 4, hold: 7, out: 8, rest: 0 })).toBe('4 · 7 · 8');
    expect(cycleSeconds(box)).toBe(16);
  });
});

describe('meditations', () => {
  it('only ticks Breathe for sessions of at least the five minutes it promises', () => {
    for (const m of MEDITATIONS) {
      if (m.habit === 'breathe') expect(m.minutes).toBeGreaterThanOrEqual(5);
    }
    expect(meditation('reset')!.habit).toBeNull();
  });

  it('returns null for an unknown id', () => {
    expect(meditation(undefined)).toBeNull();
    expect(meditation('x')).toBeNull();
  });
});

describe('breathResumeAt', () => {
  /* Coming back mid-exhale restarts that breath from its in-breath. */
  it('rewinds to the start of the current breath', () => {
    const calm = { in: 4, hold: 0, out: 6, rest: 0 };
    expect(breathResumeAt(calm, 0)).toBe(0);
    expect(breathResumeAt(calm, 7_500)).toBe(0);
    expect(breathResumeAt(calm, 23_000)).toBe(20_000);
    expect(breathPhaseAt(calm, breathResumeAt(calm, 23_000)).phase).toBe('in');
  });
});

describe('the mindful log', () => {
  const yoga = (day: string, id = 'morning', seconds = 480): MindfulEntry => ({ day, kind: 'yoga', id, seconds });

  it('keeps four weeks and drops anything older', () => {
    const log = withMindfulEntry([yoga('2026-08-01'), yoga('2026-09-02')], yoga('2026-09-29'), '2026-09-29');
    expect(log.map((e) => e.day)).toEqual(['2026-09-02', '2026-09-29']);
  });

  it('knows what was done on a day, by kind and id', () => {
    const log = [yoga('2026-09-29'), { day: '2026-09-29', kind: 'meditation' as const, id: 'box', seconds: 300 }];
    expect(doneOn(log, 'yoga', 'morning', '2026-09-29')).toBe(true);
    expect(doneOn(log, 'yoga', 'evening', '2026-09-29')).toBe(false);
    expect(doneOn(log, 'yoga', 'morning', '2026-09-28')).toBe(false);
    expect(doneOn(log, 'meditation', 'morning', '2026-09-29')).toBe(false);
  });

  it('sums minutes of one kind over the given days', () => {
    const log = [yoga('2026-09-27', 'morning', 470), yoga('2026-09-29', 'desk', 295), yoga('2026-09-01')];
    expect(minutesOn(log, 'yoga', ['2026-09-27', '2026-09-28', '2026-09-29'])).toBe(13);
    expect(minutesOn(log, 'meditation', ['2026-09-29'])).toBe(0);
  });

  it('drops malformed stored entries', () => {
    expect(cleanLog(null)).toEqual([]);
    expect(cleanLog([yoga('2026-09-29'), { day: 1 }, null, { ...yoga('2026-09-29'), kind: 'run' }])).toEqual([
      yoga('2026-09-29'),
    ]);
  });
});

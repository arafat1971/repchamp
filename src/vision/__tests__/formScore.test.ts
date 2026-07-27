import { pushUp, squat } from '../exercises';
import { buildFormReport, meanRangeOfMotion, tempoConsistency } from '../formScore';
import type { RepRecord } from '../repCounter';

function rep(overrides: Partial<RepRecord> = {}): RepRecord {
  return {
    index: 1,
    peakDepth: 0.9,
    fullDepth: true,
    durationMs: 1200,
    alignment: 0.9,
    completedAt: 0,
    ...overrides,
  };
}

describe('tempoConsistency', () => {
  it('is perfect for a single rep, which has no variance to measure', () => {
    expect(tempoConsistency([rep()])).toBe(1);
  });

  it('is perfect for a metronomic set', () => {
    const reps = [1200, 1200, 1200, 1200].map((durationMs) => rep({ durationMs }));
    expect(tempoConsistency(reps)).toBeCloseTo(1, 5);
  });

  it('drops as pacing becomes uneven', () => {
    const steady = tempoConsistency([1200, 1250, 1180, 1220].map((d) => rep({ durationMs: d })));
    const ragged = tempoConsistency([600, 2400, 900, 3000].map((d) => rep({ durationMs: d })));
    expect(steady).toBeGreaterThan(0.85);
    expect(ragged).toBeLessThan(0.4);
  });

  it('never goes negative for wildly uneven pacing', () => {
    const reps = [100, 5000, 200, 8000].map((d) => rep({ durationMs: d }));
    expect(tempoConsistency(reps)).toBeGreaterThanOrEqual(0);
  });
});

describe('meanRangeOfMotion', () => {
  it('averages peak depth across reps', () => {
    expect(meanRangeOfMotion([rep({ peakDepth: 0.8 }), rep({ peakDepth: 1.0 })])).toBeCloseTo(0.9);
  });

  it('is zero with no reps', () => {
    expect(meanRangeOfMotion([])).toBe(0);
  });
});

describe('buildFormReport', () => {
  it('handles a session where nothing was detected', () => {
    const report = buildFormReport(pushUp, []);
    expect(report.score).toBe(0);
    expect(report.bars).toHaveLength(0);
    expect(report.grade).toBe('No reps tracked');
    expect(report.tip).toContain('whole body is in frame');
  });

  it('scores a clean set highly', () => {
    const reps = Array.from({ length: 8 }, (_, i) =>
      rep({ index: i + 1, peakDepth: 0.95, alignment: 0.95, durationMs: 1200 }),
    );
    const report = buildFormReport(pushUp, reps);
    expect(report.score).toBeGreaterThanOrEqual(92);
    expect(report.grade).toBe('Excellent form');
  });

  it('scores a shallow, sloppy set lower than a clean one', () => {
    const clean = buildFormReport(
      pushUp,
      Array.from({ length: 5 }, () => rep({ peakDepth: 0.95, alignment: 0.95 })),
    );
    const sloppy = buildFormReport(
      pushUp,
      Array.from({ length: 5 }, () => rep({ peakDepth: 0.72, alignment: 0.55, fullDepth: false })),
    );
    expect(sloppy.score).toBeLessThan(clean.score);
  });

  it('counts full-depth and partial reps separately', () => {
    const report = buildFormReport(pushUp, [
      rep({ fullDepth: true }),
      rep({ fullDepth: true }),
      rep({ fullDepth: false, peakDepth: 0.72 }),
    ]);
    expect(report.fullDepthReps).toBe(2);
    expect(report.partialReps).toBe(1);
  });

  it('emits one bar per rep, coloured by depth', () => {
    const report = buildFormReport(pushUp, [
      rep({ fullDepth: true, peakDepth: 0.95 }),
      rep({ fullDepth: false, peakDepth: 0.72 }),
    ]);
    expect(report.bars).toHaveLength(2);
    expect(report.bars[0]?.fullDepth).toBe(true);
    expect(report.bars[1]?.fullDepth).toBe(false);
    // Deeper rep must render taller.
    expect(report.bars[0]!.height).toBeGreaterThan(report.bars[1]!.height);
  });

  it('keeps every bar visible even for a very shallow rep', () => {
    const report = buildFormReport(pushUp, [rep({ peakDepth: 0.01, fullDepth: false })]);
    expect(report.bars[0]!.height).toBeGreaterThanOrEqual(10);
  });

  it('uses the exercise-specific metric labels and tip', () => {
    const pushReport = buildFormReport(pushUp, [rep()]);
    const squatReport = buildFormReport(squat, [rep()]);

    expect(pushReport.metrics[0]?.label).toBe('Range of motion');
    expect(squatReport.metrics[0]?.label).toBe('Squat depth');
    expect(squatReport.tip).toContain('bottom');
  });

  it('never reports a score outside 0..100', () => {
    const report = buildFormReport(pushUp, [rep({ peakDepth: 1, alignment: 1, durationMs: 1000 })]);
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
  });
});

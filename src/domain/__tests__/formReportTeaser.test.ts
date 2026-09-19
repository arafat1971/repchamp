import { formReportTeaser, teaserLockLine } from '@/domain/formReportTeaser';
import type { FormReport } from '@/vision/formScore';

function report(over: Partial<FormReport> = {}): FormReport {
  return {
    score: 72,
    grade: 'Solid',
    summary: 'Good depth, uneven tempo.',
    metrics: [
      { label: 'Depth', pct: 81 },
      { label: 'Alignment', pct: 74 },
      { label: 'Tempo', pct: 60 },
    ],
    bars: Array.from({ length: 18 }, () => ({ height: 0.8, fullDepth: true })),
    tip: 'Slow the way down.',
    fullDepthReps: 15,
    partialReps: 3,
    ...over,
  } as FormReport;
}

describe('formReportTeaser', () => {
  /* The headline is the athlete's real score. A teaser built on a rounded or
     invented number would be the fabrication `progressProof` refuses, and it
     would differ from what they see after paying — a lie told at the moment of
     payment. */
  it('shows the true score and grade, not an approximation', () => {
    const t = formReportTeaser(report({ score: 63, grade: 'Fair' }));
    expect(t?.score).toBe(63);
    expect(t?.grade).toBe('Fair');
  });

  /* Names sell the report; values are the report. */
  it('names what is measured without revealing any measurement', () => {
    const t = formReportTeaser(report());
    expect(t?.lockedMetrics).toEqual(['Depth', 'Alignment', 'Tempo']);
    const serialised = JSON.stringify(t);
    for (const pct of ['81', '74', '60']) {
      expect(serialised).not.toContain(pct);
    }
  });

  /* The per-rep chart is Pro. Its size is not — the athlete already knows how
     many reps they did. */
  it('counts the locked bars without exposing them', () => {
    const t = formReportTeaser(report());
    expect(t?.repCount).toBe(18);
    expect(JSON.stringify(t)).not.toContain('fullDepth');
  });

  it('withholds the coaching tip and the summary entirely', () => {
    const serialised = JSON.stringify(formReportTeaser(report()));
    expect(serialised).not.toContain('Slow the way down');
    expect(serialised).not.toContain('uneven tempo');
  });

  /* Nothing to tease means no tease. A lock in front of an empty measurement
     is the fabricated value this module exists to avoid. */
  it('stays silent when there is no report', () => {
    expect(formReportTeaser(null)).toBeNull();
    expect(formReportTeaser(undefined)).toBeNull();
  });

  it('stays silent for a set with no counted reps', () => {
    expect(formReportTeaser(report({ bars: [] }))).toBeNull();
  });
});

describe('teaserLockLine', () => {
  /* Concrete beats abstract: a fact about the set they just finished, not a
     brochure phrase that could describe any app. */
  it('names the athlete’s own set, not a generic feature', () => {
    const t = formReportTeaser(report());
    expect(t).not.toBeNull();
    const line = teaserLockLine(t!);
    expect(line).toBe('18 reps analysed — depth, alignment, tempo and your coaching tip');
  });

  it('tracks the real rep count', () => {
    const t = formReportTeaser(report({ bars: [{ height: 1, fullDepth: true }] }));
    expect(teaserLockLine(t!)).toContain('1 rep analysed');
  });

  /* The singular. This test previously asserted "1 reps analysed" — it pinned
     the bug rather than catching it, which is how the wording shipped. */
  it('says "1 rep", not "1 reps"', () => {
    const one = formReportTeaser(report({ bars: [{ height: 1, fullDepth: true }] }));
    expect(teaserLockLine(one!)).not.toContain('1 reps');
    const two = formReportTeaser(
      report({ bars: [{ height: 1, fullDepth: true }, { height: 1, fullDepth: true }] }),
    );
    expect(teaserLockLine(two!)).toContain('2 reps analysed');
  });

  /* The line advertises the locked detail; it must never leak a value. */
  it('carries no measurement', () => {
    const line = teaserLockLine(formReportTeaser(report())!);
    for (const pct of ['81', '74', '60', '%']) {
      expect(line).not.toContain(pct);
    }
  });
});

/*
 * The over-promise. `buildFormReport` marks a metric it could not judge with
 * `pct: -1` — alignment goes unmeasured whenever the joints were never visible
 * enough — and the paid report renders those as "not measured". The teaser
 * listed every metric name unconditionally, so it sold "Back alignment" on a
 * set where buying reveals no alignment reading at all.
 *
 * That is the bait-and-switch the module was written to avoid, committed inside
 * the very change that argued against it.
 */
describe('never advertises a metric this set could not measure', () => {
  const unmeasurable = () =>
    report({
      metrics: [
        { label: 'Range of motion', pct: 80 },
        { label: 'Back alignment', pct: -1 },
        { label: 'Tempo consistency', pct: 73 },
      ],
    });

  it('drops the metric the report will show as "not measured"', () => {
    const t = formReportTeaser(unmeasurable());
    expect(t?.lockedMetrics).toEqual(['Range of motion', 'Tempo consistency']);
    expect(t?.lockedMetrics).not.toContain('Back alignment');
  });

  it('keeps it out of the lock line too', () => {
    const line = teaserLockLine(formReportTeaser(unmeasurable())!);
    expect(line.toLowerCase()).not.toContain('alignment');
    expect(line).toBe('18 reps analysed — range of motion, tempo consistency and your coaching tip');
  });

  /* A set with no readable metric has no quality verdict to sell, whatever the
     headline score says — so there is nothing honest to tease. */
  it('stays silent when nothing at all could be measured', () => {
    const none = report({
      metrics: [
        { label: 'Range of motion', pct: -1 },
        { label: 'Back alignment', pct: -1 },
        { label: 'Tempo consistency', pct: -1 },
      ],
    });
    expect(formReportTeaser(none)).toBeNull();
  });

  it('still lists all three when all three were measured', () => {
    expect(formReportTeaser(report())?.lockedMetrics).toHaveLength(3);
  });
});

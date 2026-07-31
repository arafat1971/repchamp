import { OneEuroFilter, angleAt, normalize, tiltFromHorizontal } from '../geometry';

describe('angleAt', () => {
  it('measures a right angle', () => {
    expect(angleAt({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90, 5);
  });

  it('measures a straight line as 180 degrees', () => {
    expect(angleAt({ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(180, 5);
  });

  it('measures a fully folded joint as 0 degrees', () => {
    expect(angleAt({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 2, y: 0 })).toBeCloseTo(0, 5);
  });

  it('returns null for a zero-length segment rather than NaN', () => {
    expect(angleAt({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull();
  });

  it('never returns NaN for near-collinear points that overflow the cosine', () => {
    const angle = angleAt({ x: 1e-9, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 });
    expect(angle).not.toBeNaN();
    expect(angle).toBeCloseTo(0, 3);
  });
});

describe('normalize', () => {
  it('maps an ascending range onto 0..1', () => {
    expect(normalize(75, 50, 100)).toBeCloseTo(0.5, 5);
  });

  it('inverts when the range descends, as joint angles do', () => {
    // Elbow: 165° extended → 0 depth, 75° folded → 1 depth.
    expect(normalize(165, 165, 75)).toBeCloseTo(0, 5);
    expect(normalize(75, 165, 75)).toBeCloseTo(1, 5);
    expect(normalize(120, 165, 75)).toBeCloseTo(0.5, 5);
  });

  it('clamps beyond both ends so hyperextension is not negative depth', () => {
    expect(normalize(180, 165, 75)).toBe(0);
    expect(normalize(40, 165, 75)).toBe(1);
  });
});

describe('tiltFromHorizontal', () => {
  it('reads a vertical segment as 90 degrees', () => {
    expect(tiltFromHorizontal({ x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90, 5);
  });

  it('reads a horizontal segment as 0 degrees', () => {
    expect(tiltFromHorizontal({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(0, 5);
  });
});

describe('OneEuroFilter', () => {
  it('passes the first sample through untouched', () => {
    expect(new OneEuroFilter().filter(0.42, 0)).toBe(0.42);
  });

  it('attenuates jitter around a resting value', () => {
    const filter = new OneEuroFilter();
    const noisy = [0.5, 0.62, 0.39, 0.58, 0.44, 0.55, 0.46];
    let last = 0;
    noisy.forEach((value, i) => {
      last = filter.filter(value, i * 33);
    });
    // Raw signal swings ±0.12; the filtered value should sit far closer to 0.5.
    expect(Math.abs(last - 0.5)).toBeLessThan(0.06);
  });

  it('still tracks a fast ramp without excessive lag', () => {
    const filter = new OneEuroFilter();
    let value = 0;
    for (let i = 0; i <= 20; i++) {
      value = filter.filter(i / 20, i * 33);
    }
    // A fixed low-pass would lag badly here; One Euro should land close to 1.
    expect(value).toBeGreaterThan(0.85);
  });

  it('resets back to pass-through', () => {
    const filter = new OneEuroFilter();
    filter.filter(0.9, 0);
    filter.filter(0.9, 33);
    filter.reset();
    expect(filter.filter(0.1, 66)).toBe(0.1);
  });

  /**
   * Simulate one rep as a half-sine from 0 up to `peak` and back, sampled at
   * `hz`, and report the deepest value the filter reported.
   */
  function peakOfRep(peak: number, repMs: number, hz: number): number {
    const filter = new OneEuroFilter();
    const step = 1000 / hz;
    let deepest = 0;
    for (let t = 0; t <= repMs; t += step) {
      deepest = Math.max(deepest, filter.filter(peak * Math.sin((t / repMs) * Math.PI), t));
    }
    return deepest;
  }

  it('preserves the depth of a genuine rep even at a throttled sample rate', () => {
    // Regression: reps were going missing rather than being graded shallow. A
    // push-up whose true depth is 0.75 has to smooth to at least the 0.70
    // `downThreshold` or the counter never even starts the rep. With the old
    // beta of 1.0 this came out at 0.68 once the thermal throttle dropped
    // inference to ~10Hz, so the rep was invisible.
    const PUSH_DOWN_THRESHOLD = 0.7;

    for (const hz of [30, 15, 10]) {
      for (const repMs of [600, 800, 1200]) {
        expect(peakOfRep(0.75, repMs, hz)).toBeGreaterThanOrEqual(PUSH_DOWN_THRESHOLD);
      }
    }
  });

  it('does not overshoot the true depth of a rep', () => {
    // The counter grades depth off this signal, so tracking harder must not
    // start inventing range the athlete did not actually produce.
    expect(peakOfRep(0.75, 800, 30)).toBeLessThanOrEqual(0.75);
    expect(peakOfRep(1.0, 800, 30)).toBeLessThanOrEqual(1.0);
  });
});

describe('rep sampling budget', () => {
  /**
   * Mirrors the frame-skip ceiling in `usePoseSession`: the thermal throttle
   * may drop frames, but never so far that a rep loses the samples the filter
   * needs to resolve its peak.
   */
  function maxFrameSkip(minRepDurationMs: number, targetFps = 30): number {
    const MIN_SAMPLES_PER_REP = 8;
    const frameMs = 1000 / targetFps;
    return Math.max(1, Math.min(3, Math.floor(minRepDurationMs / (frameMs * MIN_SAMPLES_PER_REP))));
  }

  it('never throttles a fast exercise below a resolvable sample count', () => {
    // High knees are the extreme: a 280ms rep at every-3rd-frame leaves three
    // samples, which cannot describe a peak — reps went missing entirely.
    for (const [minMs, expected] of [
      [280, 1], // high-knees
      [350, 1], // jumping-jack
      [400, 1], // push
      [600, 2], // shoulder rolls
      [800, 3], // full-body stretch
    ] as const) {
      expect(maxFrameSkip(minMs)).toBe(expected);
    }
  });

  it('leaves every exercise at least eight samples across its fastest rep', () => {
    for (const minMs of [280, 350, 400, 450, 500, 600, 800]) {
      const effectiveHz = 30 / maxFrameSkip(minMs);
      const samples = Math.floor(minMs / (1000 / effectiveHz));
      expect(samples).toBeGreaterThanOrEqual(8);
    }
  });
});

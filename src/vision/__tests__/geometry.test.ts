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
});

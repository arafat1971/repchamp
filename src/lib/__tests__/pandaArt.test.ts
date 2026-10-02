import * as Art from '../../../plugins/pandaArt';

const surfaceY = (level: number, pose = Art.REST) => {
  const d = Art.waterPath(level, pose, 0, 0);
  const ys = [...d.matchAll(/[ML]([\d.]+),([\d.]+)/g)].map((m) => Number(m[2]));
  return Math.min(...ys);
};

describe('pandaArt', () => {
  it('draws no water in an empty bottle and some once there is any', () => {
    expect(Art.waterPath(0)).toBe('');
    expect(Art.waterPath(0.05)).toMatch(/^M/);
  });

  it('raises the surface as the bottle fills', () => {
    expect(surfaceY(0.8)).toBeLessThan(surfaceY(0.2));
  });

  it('keeps the water level with the ground when the bottle tips to sip', () => {
    const d = Art.waterPath(0.5, Art.SIP, 0, 0);
    const pts = [...d.matchAll(/[ML]([\d.]+),([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])] as const);
    const top = Math.min(...pts.map((p) => p[1]));
    // At least two points share the surface height: the surface is flat.
    expect(pts.filter((p) => Math.abs(p[1] - top) < 0.05).length).toBeGreaterThanOrEqual(2);
  });

  it('draws every outfit, eye and mouth with finite numbers', () => {
    const parts = (['classic', 'hoodie'] as const).flatMap((o) => [
      ...Art.backParts(o),
      ...Art.headParts(o),
      ...Art.armParts(o, Art.REST),
      ...Art.armParts(o, Art.SIP),
      ...Art.doodleParts(o),
      ...Art.bottleBackParts(Art.SIP),
      ...Art.bottleFrontParts(Art.SIP),
      ...(['smile', 'sip', 'gulp', 'thirsty', 'o', 'sleepy'] as const).flatMap((m) => Art.mouthParts(m)),
      ...Art.EYES.flatMap((e) => [
        ...(['open', 'love', 'sparkle'] as const).flatMap((l) => Art.eyeParts(e, l)),
        ...(['shut', 'happy', 'thirsty', 'sleepy'] as const).flatMap((k) => Art.lidParts(e, k)),
      ]),
    ]);
    for (const part of parts) {
      const nums = part.d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
      expect(nums.length).toBeGreaterThan(0);
      expect(nums.every((n: number) => Number.isFinite(n))).toBe(true);
    }
  });

  it('runs the bubbles up the water column', () => {
    expect(Art.bottleAxis(1)[1]).toBeLessThan(Art.bottleAxis(0)[1]);
  });
});

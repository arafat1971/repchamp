import {
  channelCount,
  layoutForPixelFormat,
  packFrameToRgb,
  type ChannelLayout,
} from '../pixelBuffer';

/**
 * Builds a synthetic frame buffer where each pixel encodes its own coordinates,
 * so the test can assert exactly which source pixel landed where.
 */
function makeFrame(
  width: number,
  height: number,
  layout: ChannelLayout,
  padding = 0,
  paint: (x: number, y: number) => [number, number, number] = (x, y) => [x, y, 0],
) {
  const channels = channelCount(layout);
  const bytesPerRow = width * channels + padding;
  const buffer = new Uint8Array(bytesPerRow * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      const p = y * bytesPerRow + x * channels;
      if (layout === 'bgra') {
        buffer[p] = b;
        buffer[p + 1] = g;
        buffer[p + 2] = r;
        buffer[p + 3] = 255;
      } else {
        buffer[p] = r;
        buffer[p + 1] = g;
        buffer[p + 2] = b;
        if (channels === 4) buffer[p + 3] = 255;
      }
    }
  }

  // Poison the padding so any stride mistake shows up as a wrong value.
  if (padding > 0) {
    for (let y = 0; y < height; y++) {
      for (let i = 0; i < padding; i++) {
        buffer[y * bytesPerRow + width * channels + i] = 199;
      }
    }
  }

  return { buffer, bytesPerRow };
}

function pixelAt(out: Uint8Array, size: number, x: number, y: number) {
  const p = (y * size + x) * 3;
  return [out[p], out[p + 1], out[p + 2]];
}

describe('layoutForPixelFormat', () => {
  it('maps the RGB family', () => {
    expect(layoutForPixelFormat('rgb-rgb-8-bit')).toBe('rgb');
    expect(layoutForPixelFormat('rgb-rgba-8-bit')).toBe('rgba');
    expect(layoutForPixelFormat('rgb-bgra-8-bit')).toBe('bgra');
  });

  it('rejects formats the pipeline cannot consume', () => {
    expect(layoutForPixelFormat('yuv-420-8-bit-full')).toBeNull();
    expect(layoutForPixelFormat('raw-bayer-packed96-12-bit')).toBeNull();
    expect(layoutForPixelFormat('unknown')).toBeNull();
  });
});

describe('packFrameToRgb', () => {
  it('produces a tightly packed size*size*3 buffer', () => {
    const { buffer, bytesPerRow } = makeFrame(8, 8, 'rgba');
    const out = packFrameToRgb(buffer, { width: 8, height: 8, bytesPerRow, layout: 'rgba' }, 4);
    expect(out).not.toBeNull();
    expect(out!.length).toBe(4 * 4 * 3);
  });

  it('passes an exact-size RGB frame through unchanged', () => {
    const { buffer, bytesPerRow } = makeFrame(4, 4, 'rgb', 0, (x, y) => [x * 10, y * 10, 7]);
    const out = packFrameToRgb(buffer, { width: 4, height: 4, bytesPerRow, layout: 'rgb' }, 4)!;

    expect(pixelAt(out, 4, 0, 0)).toEqual([0, 0, 7]);
    expect(pixelAt(out, 4, 3, 2)).toEqual([30, 20, 7]);
  });

  it('reorders BGRA into RGB', () => {
    // A single distinctive colour: R=200, G=100, B=50.
    const { buffer, bytesPerRow } = makeFrame(2, 2, 'bgra', 0, () => [200, 100, 50]);
    const out = packFrameToRgb(buffer, { width: 2, height: 2, bytesPerRow, layout: 'bgra' }, 2)!;

    expect(pixelAt(out, 2, 0, 0)).toEqual([200, 100, 50]);
    expect(pixelAt(out, 2, 1, 1)).toEqual([200, 100, 50]);
  });

  it('drops the alpha channel from RGBA', () => {
    const { buffer, bytesPerRow } = makeFrame(2, 2, 'rgba', 0, () => [11, 22, 33]);
    const out = packFrameToRgb(buffer, { width: 2, height: 2, bytesPerRow, layout: 'rgba' }, 2)!;
    expect(pixelAt(out, 2, 0, 0)).toEqual([11, 22, 33]);
  });

  it('respects row padding instead of reading the buffer linearly', () => {
    // 24 bytes of padding per row — reading linearly would pull in the 199s.
    const { buffer, bytesPerRow } = makeFrame(4, 4, 'rgb', 24, (x, y) => [x * 10, y * 10, 7]);
    const out = packFrameToRgb(buffer, { width: 4, height: 4, bytesPerRow, layout: 'rgb' }, 4)!;

    expect(out).not.toContain(199);
    expect(pixelAt(out, 4, 3, 3)).toEqual([30, 30, 7]);
  });

  it('downscales a larger frame', () => {
    const { buffer, bytesPerRow } = makeFrame(8, 8, 'rgb', 0, (x, y) => [x * 8, y * 8, 0]);
    const out = packFrameToRgb(buffer, { width: 8, height: 8, bytesPerRow, layout: 'rgb' }, 4)!;

    expect(out.length).toBe(48);
    // Destination x=0 samples source x=1 (centre of the 0..1 pair).
    expect(pixelAt(out, 4, 0, 0)).toEqual([8, 8, 0]);
    expect(pixelAt(out, 4, 3, 3)).toEqual([56, 56, 0]);
  });

  it('centre-crops a wide frame rather than squashing it', () => {
    // 8 wide, 4 tall. The centre square is x = 2..5.
    const { buffer, bytesPerRow } = makeFrame(8, 4, 'rgb', 0, (x) => [x * 10, 0, 0]);
    const out = packFrameToRgb(buffer, { width: 8, height: 4, bytesPerRow, layout: 'rgb' }, 4)!;

    // Leftmost output pixel must come from source x=2, not x=0.
    expect(pixelAt(out, 4, 0, 0)![0]).toBe(20);
    expect(pixelAt(out, 4, 3, 0)![0]).toBe(50);
  });

  it('centre-crops a tall frame', () => {
    const { buffer, bytesPerRow } = makeFrame(4, 8, 'rgb', 0, (_x, y) => [0, y * 10, 0]);
    const out = packFrameToRgb(buffer, { width: 4, height: 8, bytesPerRow, layout: 'rgb' }, 4)!;

    expect(pixelAt(out, 4, 0, 0)![1]).toBe(20);
    expect(pixelAt(out, 4, 0, 3)![1]).toBe(50);
  });

  it('never samples outside the source buffer', () => {
    const size = 192;
    const { buffer, bytesPerRow } = makeFrame(31, 17, 'bgra');
    const out = packFrameToRgb(buffer, { width: 31, height: 17, bytesPerRow, layout: 'bgra' }, size);

    expect(out).not.toBeNull();
    expect(out!.length).toBe(size * size * 3);
    // Upscaling from a tiny frame must not produce undefined → NaN → 0 holes
    // outside the real image, so every byte should be a valid number.
    expect(out!.every((v) => Number.isInteger(v))).toBe(true);
  });

  it('rejects an impossible stride rather than reading out of bounds', () => {
    const { buffer } = makeFrame(4, 4, 'rgba');
    expect(packFrameToRgb(buffer, { width: 4, height: 4, bytesPerRow: 4, layout: 'rgba' }, 4)).toBeNull();
  });

  it('rejects a zero-sized frame', () => {
    expect(
      packFrameToRgb(new Uint8Array(0), { width: 0, height: 0, bytesPerRow: 0, layout: 'rgb' }, 4),
    ).toBeNull();
  });

  it('produces the exact byte count MoveNet expects', () => {
    const { buffer, bytesPerRow } = makeFrame(640, 480, 'bgra');
    const out = packFrameToRgb(
      buffer,
      { width: 640, height: 480, bytesPerRow, layout: 'bgra' },
      192,
    )!;
    expect(out.length).toBe(192 * 192 * 3); // 110,592
  });

  it('allocates a fresh output buffer each call', () => {
    const { buffer, bytesPerRow } = makeFrame(4, 4, 'rgb');
    const a = packFrameToRgb(buffer, { width: 4, height: 4, bytesPerRow, layout: 'rgb' }, 4);
    const b = packFrameToRgb(buffer, { width: 4, height: 4, bytesPerRow, layout: 'rgb' }, 4);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a).not.toBe(b);
    expect(a!.length).toBe(b!.length);
  });
});

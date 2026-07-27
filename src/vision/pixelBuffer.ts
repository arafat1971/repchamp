/**
 * Camera frame → model input conversion.
 *
 * Three things stand between a camera frame and MoveNet's `[1, S, S, 3]` uint8
 * input tensor, and getting any of them wrong yields plausible-looking but
 * meaningless keypoints rather than a loud error:
 *
 * 1. **Channel layout.** Vision Camera's `pixelFormat: 'rgb'` resolves to a
 *    *concrete* format that is frequently BGRA on Android and iOS — 4 bytes per
 *    pixel, blue first. MoveNet wants 3 bytes per pixel, red first.
 * 2. **Row stride.** `bytesPerRow` is often larger than `width * channels`
 *    because rows are padded for alignment. Reading the buffer linearly skews
 *    the image progressively down the frame.
 * 3. **Resolution.** `targetResolution` is a request, not a guarantee — the
 *    camera picks the nearest supported size, so frames must be resampled.
 *
 * All three are handled in a single pass here. Kept as a pure function so it can
 * be unit-tested against synthetic buffers without a camera (`pixelBuffer.test.ts`).
 */

/** Byte layout of the source buffer, derived from `Frame.pixelFormat`. */
export type ChannelLayout = 'rgb' | 'rgba' | 'bgra';

export function channelCount(layout: ChannelLayout): number {
  'worklet';
  return layout === 'rgb' ? 3 : 4;
}

/**
 * Maps a Vision Camera `VideoPixelFormat` onto a byte layout.
 * Returns null for formats this pipeline cannot consume (YUV, RAW).
 */
export function layoutForPixelFormat(format: string): ChannelLayout | null {
  // Every helper reachable from the frame processor must be a worklet: anything
  // captured by `onFrame` is serialised into the camera's worklet runtime, and a
  // plain function fails there with "Compiling JS failed" in valueUnpacker.
  'worklet';
  switch (format) {
    case 'rgb-rgb-8-bit':
      return 'rgb';
    case 'rgb-rgba-8-bit':
      return 'rgba';
    case 'rgb-bgra-8-bit':
      return 'bgra';
    default:
      return null;
  }
}

export interface FrameBufferInfo {
  width: number;
  height: number;
  /** Bytes per row in the source buffer, including any padding. */
  bytesPerRow: number;
  layout: ChannelLayout;
}

/**
 * Resamples an arbitrary camera frame into a tightly packed, square RGB buffer.
 *
 * Uses nearest-neighbour sampling and a centre crop: the model is trained on
 * roughly square inputs, so squashing a 16:9 frame would distort every joint
 * angle the rep counter depends on. Cropping to the centre square keeps the
 * athlete's proportions intact.
 *
 * @returns a `size * size * 3` uint8 buffer, or null if the frame is unusable.
 */
export function packFrameToRgb(
  source: Uint8Array,
  info: FrameBufferInfo,
  size: number,
): Uint8Array | null {
  'worklet';

  const { width, height, bytesPerRow, layout } = info;
  if (width <= 0 || height <= 0 || size <= 0) return null;

  const channels = channelCount(layout);
  if (bytesPerRow < width * channels) return null;

  // Centre-crop to a square before scaling, preserving aspect ratio.
  const crop = Math.min(width, height);
  const offsetX = (width - crop) >> 1;
  const offsetY = (height - crop) >> 1;

  // Channel offsets within a source pixel.
  const rOffset = layout === 'bgra' ? 2 : 0;
  const bOffset = layout === 'bgra' ? 0 : 2;

  /**
   * Column offsets are precomputed once per frame rather than per pixel.
   *
   * The inner loop runs `size²` times — 36,864 at 192 — and the source column
   * only takes `size` distinct values. Computing it inline cost a floor, a
   * multiply and a divide per pixel; on Hermes, which does not JIT worklet code,
   * that measured ~70ms per frame and capped the pipeline at a few fps.
   */
  const columnOffset = new Int32Array(size);
  for (let tx = 0; tx < size; tx++) {
    // Sample the centre of each destination texel rather than its corner.
    const sx = offsetX + Math.min(crop - 1, Math.floor(((tx + 0.5) * crop) / size));
    columnOffset[tx] = sx * channels;
  }

  const out = new Uint8Array(size * size * 3);
  let o = 0;

  for (let ty = 0; ty < size; ty++) {
    const sy = offsetY + Math.min(crop - 1, Math.floor(((ty + 0.5) * crop) / size));
    const rowStart = sy * bytesPerRow;

    for (let tx = 0; tx < size; tx++) {
      const p = rowStart + (columnOffset[tx] as number);

      out[o++] = source[p + rOffset] as number;
      out[o++] = source[p + 1] as number;
      out[o++] = source[p + bOffset] as number;
    }
  }

  return out;
}

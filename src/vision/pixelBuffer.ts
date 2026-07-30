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
 * Pure helpers (no `'worklet'` directive). The camera frame processor inlines
 * this logic inside `onFrame` so Hermes never separately `eval`s this module —
 * nested worklets that closed over module `let` scratch buffers previously
 * crashed with "invalid assignment left-hand side".
 */

/** Byte layout of the source buffer, derived from `Frame.pixelFormat`. */
export type ChannelLayout = 'rgb' | 'rgba' | 'bgra';

export function channelCount(layout: ChannelLayout): number {
  return layout === 'rgb' ? 3 : 4;
}

/**
 * Maps a Vision Camera `VideoPixelFormat` onto a byte layout.
 * Returns null for formats this pipeline cannot consume (YUV, RAW).
 */
export function layoutForPixelFormat(format: string): ChannelLayout | null {
  if (format === 'rgb-rgb-8-bit') return 'rgb';
  if (format === 'rgb-rgba-8-bit') return 'rgba';
  if (format === 'rgb-bgra-8-bit') return 'bgra';
  return null;
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
 * Allocates a fresh buffer each call (worklet-safe — no closed-over mutation).
 *
 * @returns a `size * size * 3` uint8 buffer, or null if the frame is unusable.
 */
export function packFrameToRgb(
  source: Uint8Array,
  info: FrameBufferInfo,
  size: number,
): Uint8Array | null {
  const frameWidth = info.width;
  const frameHeight = info.height;
  const rowStride = info.bytesPerRow;
  const channelLayout = info.layout;
  if (frameWidth <= 0 || frameHeight <= 0 || size <= 0) return null;

  const channels = channelLayout === 'rgb' ? 3 : 4;
  if (rowStride < frameWidth * channels) return null;

  const crop = frameWidth < frameHeight ? frameWidth : frameHeight;
  const originX = Math.floor((frameWidth - crop) / 2);
  const originY = Math.floor((frameHeight - crop) / 2);

  const redAt = channelLayout === 'bgra' ? 2 : 0;
  const blueAt = channelLayout === 'bgra' ? 0 : 2;

  const out = new Uint8Array(size * size * 3);

  for (let ty = 0; ty < size; ty++) {
    const sy = originY + Math.min(crop - 1, Math.floor(((ty + 0.5) * crop) / size));
    const rowStart = sy * rowStride;

    for (let tx = 0; tx < size; tx++) {
      const sx = originX + Math.min(crop - 1, Math.floor(((tx + 0.5) * crop) / size));
      const pixel = rowStart + sx * channels;
      const dest = (ty * size + tx) * 3;
      out[dest] = source[pixel + redAt] as number;
      out[dest + 1] = source[pixel + 1] as number;
      out[dest + 2] = source[pixel + blueAt] as number;
    }
  }

  return out;
}

import {
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { ImageFormat, Skia, type SkImage, type SkTypeface } from '@shopify/react-native-skia';
import { Image } from 'react-native';

import { CLIP, CLIP_FRAME_COUNT } from '@/domain/raceClip';
import { drawFrame, type ClipAssets, type ClipScene } from '@/lib/raceClip/drawFrame';

import { RaceClipEncoder } from '../../../modules/race-clip-encoder/src';

/** About 4 Mbit/s: crisp text at 720p without a huge file to upload. */
const BITRATE = 4_000_000;

/** False on a binary built before the encoder module: show the image card instead. */
export function raceClipSupported(): boolean {
  return RaceClipEncoder != null;
}

export class RaceClipCancelled extends Error {
  constructor() {
    super('Race clip cancelled');
    this.name = 'RaceClipCancelled';
  }
}

async function loadData(source: number) {
  return Skia.Data.fromURI(Image.resolveAssetSource(source).uri);
}

async function loadTypeface(source: number): Promise<SkTypeface> {
  const typeface = Skia.Typeface.MakeFreeTypeFaceFromData(await loadData(source));
  if (!typeface) throw new Error('Race clip font failed to load');
  return typeface;
}

async function loadImage(source: number): Promise<SkImage | null> {
  try {
    return Skia.Image.MakeImageFromEncoded(await loadData(source));
  } catch {
    return null; // The clip still works without the logo or trophy.
  }
}

let assets: Promise<ClipAssets> | null = null;
function loadAssets(): Promise<ClipAssets> {
  assets ??= Promise.all([
    loadTypeface(PlusJakartaSans_800ExtraBold),
    loadTypeface(PlusJakartaSans_700Bold),
    loadImage(require('../../../assets/icon.png')),
    loadImage(require('../../../assets/trophy-gold.png')),
  ]).then(([heavy, bold, logo, trophy]) => ({ heavy, bold, logo, trophy }));
  // A failed load is retried next time rather than cached.
  assets.catch(() => {
    assets = null;
  });
  return assets;
}

/** Lets the UI repaint the progress bar between frames. */
const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Draws every frame offscreen and encodes it into an MP4 in the cache
 * directory. Returns its `file://` uri. Takes a few seconds; report progress
 * with `onProgress` (0..1) and stop early with `signal.cancelled`.
 */
export async function renderRaceClip(
  scene: ClipScene,
  options: { onProgress?: (fraction: number) => void; signal?: { cancelled: boolean } } = {},
): Promise<string> {
  const encoder = RaceClipEncoder;
  if (!encoder) throw new Error('Race clip encoder is not in this build');

  const loaded = await loadAssets();
  const surface = Skia.Surface.Make(CLIP.width, CLIP.height);
  if (!surface) throw new Error('Race clip surface could not be created');

  await encoder.start(CLIP.width, CLIP.height, CLIP.fps, BITRATE);
  try {
    for (let i = 0; i < CLIP_FRAME_COUNT; i++) {
      if (options.signal?.cancelled) throw new RaceClipCancelled();
      const canvas = surface.getCanvas();
      drawFrame(canvas, scene, loaded, i);
      surface.flush();
      const frame = surface.makeImageSnapshot();
      const jpeg = frame.encodeToBase64(ImageFormat.JPEG, 90);
      frame.dispose();
      await encoder.appendFrame(jpeg);
      options.onProgress?.((i + 1) / CLIP_FRAME_COUNT);
      if (i % 6 === 5) await yieldToUi();
    }
    return await encoder.finish();
  } catch (error) {
    await encoder.cancel().catch(() => undefined);
    throw error;
  } finally {
    surface.dispose();
  }
}

import { Platform } from 'react-native';
import { loadTensorflowModel } from 'react-native-fast-tflite';
import type { ModelSource, TensorflowModelDelegate, TfliteModel } from 'react-native-fast-tflite';

/**
 * Shared MoveNet load — preload from the root layout so the session screen
 * does not wait on TFLite before mounting the camera.
 */

const PREFERRED_DELEGATES: TensorflowModelDelegate[] = Platform.select({
  ios: ['core-ml'],
  android: ['android-gpu'],
  default: [],
});

export type AcceleratedModel =
  | { state: 'loading' }
  | { state: 'loaded'; model: TfliteModel; delegate: string }
  | { state: 'error'; error: Error };

// eslint-disable-next-line @typescript-eslint/no-require-imports
export const POSE_MODEL_SOURCE: ModelSource = require('../../assets/models/movenet.tflite');

let cached: AcceleratedModel | null = null;
let inflight: Promise<AcceleratedModel> | null = null;

export function getCachedPoseModel(): AcceleratedModel | null {
  return cached;
}

async function loadWithFallback(source: ModelSource): Promise<AcceleratedModel> {
  const attempts: TensorflowModelDelegate[][] =
    PREFERRED_DELEGATES.length > 0 ? [PREFERRED_DELEGATES, []] : [[]];
  let lastError: Error | undefined;

  for (const delegates of attempts) {
    try {
      const model = await loadTensorflowModel(source, delegates);
      return { state: 'loaded', model, delegate: delegates[0] ?? 'cpu' };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (__DEV__ && delegates.length > 0) {
        console.warn(
          `[RepChamp] "${delegates[0]}" delegate unavailable, retrying on CPU:`,
          lastError.message,
        );
      }
    }
  }

  return { state: 'error', error: lastError ?? new Error('Model failed to load') };
}

/**
 * Warm the pose model in the background (home / tabs). Safe to call repeatedly;
 * concurrent callers share one in-flight load.
 */
export function preloadPoseModel(source: ModelSource = POSE_MODEL_SOURCE): Promise<AcceleratedModel> {
  if (cached?.state === 'loaded') return Promise.resolve(cached);
  if (inflight) return inflight;

  inflight = loadWithFallback(source).then((result) => {
    cached = result;
    inflight = null;
    return result;
  });
  return inflight;
}

/** Used by `useAcceleratedModel` — joins preload if already running. */
export async function ensurePoseModel(source: ModelSource): Promise<AcceleratedModel> {
  if (cached?.state === 'loaded') return cached;
  return preloadPoseModel(source);
}

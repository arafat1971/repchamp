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

/**
 * Drop the module-level cache. Tests only — the cache is deliberately global
 * so every screen shares one load, which also means one test's result would
 * otherwise leak into the next.
 */
export function resetPoseModelForTests(): void {
  cached = null;
  inflight = null;
}

/**
 * How long a single delegate gets before it is treated as unavailable.
 *
 * The hardware delegate either binds quickly or is not going to. Generous
 * enough for a cold start on a slow device, short enough that an athlete who
 * tapped "start" is not left staring at a spinner.
 */
const DELEGATE_TIMEOUT_MS = 6000;

/**
 * `loadTensorflowModel`, but it always settles.
 *
 * A delegate that *rejects* is easy — the caller catches and moves on. One
 * that hangs is worse, and it is what a Pixel 7a does with `android-gpu`:
 * the load starts, never resolves, never throws, so a plain `await` waits
 * forever. On device that surfaced as "Rep counting couldn't start" with a
 * spinner behind it and nothing at all in logcat — the model logged
 * "Loading Tensorflow Lite Model" and simply never logged anything again.
 *
 * The hung promise is abandoned rather than cancelled, because TFLite gives us
 * no way to cancel it. If it does eventually resolve, its model is dropped
 * unused; that costs some memory once, against rep counting not working.
 */
function loadWithTimeout(
  source: ModelSource,
  delegates: TensorflowModelDelegate[],
  ms: number,
): Promise<TfliteModel> {
  return new Promise<TfliteModel>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`"${delegates[0] ?? 'cpu'}" delegate timed out after ${ms}ms`));
    }, ms);

    loadTensorflowModel(source, delegates).then(
      (model) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(model);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

async function loadWithFallback(source: ModelSource): Promise<AcceleratedModel> {
  const attempts: TensorflowModelDelegate[][] =
    PREFERRED_DELEGATES.length > 0 ? [PREFERRED_DELEGATES, []] : [[]];
  let lastError: Error | undefined;

  for (const delegates of attempts) {
    try {
      // CPU is the last attempt and has nothing to fall back to, so it gets
      // longer: timing it out would fail the session outright, where waiting
      // only makes a slow device feel slow.
      const isLastAttempt = delegates === attempts[attempts.length - 1];
      const model = await loadWithTimeout(
        source,
        delegates,
        isLastAttempt ? DELEGATE_TIMEOUT_MS * 4 : DELEGATE_TIMEOUT_MS,
      );
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

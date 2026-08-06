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

/**
 * The MoveNet model, bundled as an app asset.
 *
 * This `require` depends on a build setting that is easy to turn back on
 * without realising what it breaks: `enableShrinkResourcesInReleaseBuilds` is
 * **false** in app.json, deliberately.
 *
 * With shrinking on, Android renames and relocates the file — it shipped as
 * `res/LC.tflite` while the JS still resolved it to `assets_models_movenet`.
 * `loadAsset` then received a name that resolved to nothing and never
 * returned: no error, no rejection, just a promise that never settled. On
 * device that read as "Rep counting couldn't start on this device", and it
 * only happened in release, because Metro serves the model over HTTP in dev.
 *
 * If rep counting ever breaks in release but works in dev, check that setting
 * before anything else.
 */
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

    // Marks the moment the native call is handed off. Paired with the warn in
    // `loadWithFallback`, this is what separates "never reached the native
    // module" from "reached it and it never answered" — the two failures look
    // identical from the session screen and need opposite fixes.
    console.warn(`[RepChamp] loading pose model via "${delegates[0] ?? 'cpu'}" (${ms}ms budget)`);

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
      /*
       * Logged in release too, not just __DEV__.
       *
       * This used to be dev-only, which made the failure undiagnosable on the
       * device where it actually happens: on a Pixel 7a the session screen
       * said "rep counting couldn't start" and logcat showed the model
       * beginning to load and then nothing at all — no delegate error, no
       * timeout, no completion. There was nothing wrong with the logging
       * logic; it simply was not running in the build under test.
       *
       * A console.warn costs nothing per session — this runs at most twice per
       * app launch — and it is the only way to tell "the GPU delegate is
       * unavailable" apart from "the native module never answered", which
       * need completely different fixes.
       */
      console.warn(
        `[RepChamp] "${delegates[0] ?? 'cpu'}" load failed: ${lastError.message}`,
      );
    }
  }

  const failure = lastError ?? new Error('Model failed to load');
  console.warn(`[RepChamp] pose model unavailable — every delegate failed: ${failure.message}`);
  return { state: 'error', error: failure };
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

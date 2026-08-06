import { Asset } from 'expo-asset';
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
 * Never passed to `loadTensorflowModel` directly — `resolveModelSource` turns
 * it into a `file://` URL first. The library resolves a `require`d asset to a
 * bare Android resource name in release builds, which the native side then
 * fails to parse as a URL. See the note there.
 *
 * The file ships as `res/LC.tflite` inside the APK. That renaming is normal
 * Android resource packaging and is *not* the bug — an earlier reading of this
 * blamed `shrinkResources` for it, wrongly.
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

/**
 * Turn the bundled `require` into something the native loader can open.
 *
 * `loadTensorflowModel` hands a `require`d asset to `Image.resolveAssetSource`
 * and passes the result to the native side, which calls `new URL(...)` on it.
 * In dev that is a Metro URL and works. In a release build it is a bare
 * Android resource name — `assets_models_movenet` — and the native side threw
 *
 *     java.net.MalformedURLException: no protocol: assets_models_movenet
 *
 * which surfaced as "Rep counting couldn't start on this device" on every
 * release build, while dev was fine. `Asset.downloadAsync()` resolves the
 * bundled resource to a real `file://` path, which is the other source shape
 * the library documents.
 *
 * Falls back to the raw source if resolution fails, so a future library
 * version that handles this itself is not broken by this workaround.
 */
async function resolveModelSource(source: ModelSource): Promise<ModelSource> {
  if (typeof source !== 'number') return source;
  try {
    const asset = Asset.fromModule(source);
    await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri;
    return uri ? { url: uri } : source;
  } catch {
    return source;
  }
}

async function loadWithFallback(rawSource: ModelSource): Promise<AcceleratedModel> {
  const source = await resolveModelSource(rawSource);
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

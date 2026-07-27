import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { loadTensorflowModel } from 'react-native-fast-tflite';
import type { ModelSource, TensorflowModelDelegate, TfliteModel } from 'react-native-fast-tflite';

/**
 * Hardware acceleration to try first, per platform.
 *
 * Core ML needs `enableCoreMLDelegate` in the fast-tflite config plugin, and the
 * Android GPU delegate needs OpenCL on the device. Neither degrades silently —
 * `loadTensorflowModel` throws — which is why this hook retries on CPU.
 */
const PREFERRED_DELEGATES: TensorflowModelDelegate[] = Platform.select({
  ios: ['core-ml'],
  /**
   * TFLite delegates only 100 of MoveNet's 157 ops to the GPU, across 3
   * partitions, so each inference pays several CPU<->GPU transfers — which
   * suggests plain CPU might win. Measured on a Pixel 7a it does not:
   * GPU ~28ms/frame vs CPU ~90ms. Keep the GPU delegate.
   */
  android: ['android-gpu'],
  default: [],
});

export type AcceleratedModel =
  | { state: 'loading' }
  | { state: 'loaded'; model: TfliteModel; delegate: string }
  | { state: 'error'; error: Error };

/**
 * Loads a TFLite model with hardware acceleration, falling back to CPU.
 *
 * `useTensorflowModel` from fast-tflite takes a fixed delegate list and surfaces
 * a hard error if that delegate is unavailable — which on iOS means a build
 * without `$EnableCoreMLDelegate` cannot count a single rep. Since a slower
 * model is vastly better than no rep counting, this tries the accelerated path
 * first and quietly drops to CPU when it is refused.
 */
export function useAcceleratedModel(source: ModelSource): AcceleratedModel {
  const [result, setResult] = useState<AcceleratedModel>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Try the accelerated delegate first, then plain CPU.
      const attempts: TensorflowModelDelegate[][] =
        PREFERRED_DELEGATES.length > 0 ? [PREFERRED_DELEGATES, []] : [[]];
      let lastError: Error | undefined;

      for (const delegates of attempts) {
        try {
          const model = await loadTensorflowModel(source, delegates);
          if (cancelled) return;
          setResult({ state: 'loaded', model, delegate: delegates[0] ?? 'cpu' });
          return;
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

      if (!cancelled) {
        setResult({ state: 'error', error: lastError ?? new Error('Model failed to load') });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [source]);

  return result;
}

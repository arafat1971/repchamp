import { useEffect, useState } from 'react';
import type { ModelSource } from 'react-native-fast-tflite';

import {
  ensurePoseModel,
  getCachedPoseModel,
  type AcceleratedModel,
} from './modelCache';

export type { AcceleratedModel };

/**
 * Loads a TFLite model with hardware acceleration, falling back to CPU.
 *
 * Shares a process-wide cache with `preloadPoseModel` so opening a session after
 * the home screen has warmed the model skips the multi-hundred-ms cold load —
 * the camera can mount as soon as permission is ready.
 */
export function useAcceleratedModel(source: ModelSource): AcceleratedModel {
  const [result, setResult] = useState<AcceleratedModel>(() => {
    const hit = getCachedPoseModel();
    return hit?.state === 'loaded' ? hit : { state: 'loading' };
  });

  useEffect(() => {
    let cancelled = false;
    const hit = getCachedPoseModel();
    if (hit?.state === 'loaded') {
      setResult(hit);
      return;
    }

    void ensurePoseModel(source).then((next) => {
      if (!cancelled) setResult(next);
    });

    return () => {
      cancelled = true;
    };
  }, [source]);

  return result;
}

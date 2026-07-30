/**
 * Long-session thermal / battery helpers.
 *
 * When inference slows (device heating), we ask the camera for fewer frames and
 * skip alternate analyses so a 20–30 minute workout stays responsive without
 * pegging the SoC.
 */

const EMA_ALPHA = 0.2;

let rollingInferMs = 28;
let frameIndex = 0;

/** Record one inference duration (ms) from the frame worklet / JS bridge. */
export function noteInferenceMs(ms: number): void {
  if (!Number.isFinite(ms) || ms <= 0) return;
  rollingInferMs = rollingInferMs * (1 - EMA_ALPHA) + ms * EMA_ALPHA;
}

export function rollingInferenceMs(): number {
  return rollingInferMs;
}

/**
 * Suggested camera FPS given the platform base target.
 * Hot path: step down so UI + inference share the budget.
 */
export function suggestedCameraFps(baseFps: number): number {
  if (rollingInferMs > 55) return Math.min(baseFps, 18);
  if (rollingInferMs > 42) return Math.min(baseFps, 22);
  if (rollingInferMs > 35) return Math.min(baseFps, Math.max(24, Math.floor(baseFps * 0.75)));
  return baseFps;
}

/**
 * When inference is expensive, skip alternate frames (still dispose them).
 * Returns true when this frame should run the model.
 */
export function shouldRunInference(): boolean {
  frameIndex += 1;
  if (rollingInferMs > 48) return frameIndex % 3 !== 0; // ~2/3 of frames
  if (rollingInferMs > 38) return frameIndex % 2 === 0; // every other
  return true;
}

/** Test / session-start reset. */
export function resetThermalTelemetry(): void {
  rollingInferMs = 28;
  frameIndex = 0;
}

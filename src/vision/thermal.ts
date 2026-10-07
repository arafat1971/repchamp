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

/**
 * "The phone needs a rest" detection.
 *
 * Slow inference is the only thermal signal React Native gives us, and a single
 * slow frame (a GC pause, a notification) says nothing about the device. So
 * strain is declared only once the smoothed time has stayed high for
 * `STRAIN_HOLD_MS`, and cleared only after it has stayed clearly low for as
 * long — the gap between the two thresholds stops the notice flickering on and
 * off around the boundary.
 */
const STRAIN_ENTER_MS = 48;
const STRAIN_EXIT_MS = 38;
const STRAIN_HOLD_MS = 20_000;

let strained = false;
/** When the opposite condition started holding; 0 when it is not. */
let flipSince = 0;
/** Survives `resetThermalTelemetry` — it is how the *next* session knows. */
let lastStrainedAt = 0;

/** Record one inference duration (ms) from the frame worklet / JS bridge. */
export function noteInferenceMs(ms: number, now: number = Date.now()): void {
  if (!Number.isFinite(ms) || ms <= 0) return;
  rollingInferMs = rollingInferMs * (1 - EMA_ALPHA) + ms * EMA_ALPHA;

  const wantsFlip = strained ? rollingInferMs < STRAIN_EXIT_MS : rollingInferMs > STRAIN_ENTER_MS;
  if (!wantsFlip) {
    flipSince = 0;
  } else if (flipSince === 0) {
    flipSince = now;
  } else if (now - flipSince >= STRAIN_HOLD_MS) {
    strained = !strained;
    flipSince = 0;
  }
  if (strained) lastStrainedAt = now;
}

/** True once the device has been working too hard for long enough to say so. */
export function isDeviceStrained(): boolean {
  return strained;
}

/**
 * Whether the device was strained recently enough that the next set should
 * start with a gentle heads-up. Used at session start, so a quick restart
 * doesn't walk straight back into the same heat.
 */
export function recentlyStrained(withinMs: number, now: number = Date.now()): boolean {
  return lastStrainedAt > 0 && now - lastStrainedAt <= withinMs;
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

/**
 * Test / session-start reset.
 *
 * Deliberately leaves `lastStrainedAt` alone: this runs when a session starts,
 * which is exactly when "was the last set a hot one?" has to still be known.
 */
export function resetThermalTelemetry(): void {
  rollingInferMs = 28;
  frameIndex = 0;
  strained = false;
  flipSince = 0;
}

/** Tests only — forget that the device was ever strained. */
export function resetThermalHistoryForTests(): void {
  resetThermalTelemetry();
  lastStrainedAt = 0;
}

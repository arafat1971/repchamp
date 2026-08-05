import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCameraDevice, useFrameOutput } from 'react-native-vision-camera';
import type { Frame } from 'react-native-vision-camera';
import { useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { getExercise, type ExerciseId } from './exercises';
import { POSE_MODEL_SOURCE } from './modelCache';
import { useAcceleratedModel } from './useAcceleratedModel';
import { useSessionRecorder } from './useSessionRecorder';
import { MODEL_INPUT_SIZE, decodePoseTensor, framingConfidence } from './poseDetector';
import { RepCounter } from './repCounter';
import { noteInferenceMs, suggestedCameraFps } from './thermal';
import type { Pose } from './keypoints';
import { TARGET_FPS } from '@/components/session/CameraStage';

/**
 * Diagnostics reported from the JS thread.
 *
 * These must not live in the worklet: a worklet receives a frozen copy of the
 * values it captures, so assigning to a module-level `reported` flag from inside
 * `onFrame` fails to compile with "invalid assignment left-hand side". The frame
 * metadata therefore rides along with the pose data that already crosses to JS
 * each frame, and all bookkeeping happens here.
 */
let diagnosticsReported = false;

/** Status of one frame's conversion, decided in the worklet. */
export type FrameStatus = 'ok' | 'unsupported-format' | 'unexpected-output';

function reportFrameOnce(
  status: FrameStatus,
  format: string,
  width: number,
  height: number,
  bytesPerRow: number,
  outputBytes: number,
): void {
  if (!__DEV__ || diagnosticsReported) return;
  diagnosticsReported = true;

  if (status === 'ok') {
    console.log(
      `[RepChamp] camera frame: ${format} ${width}x${height} stride=${bytesPerRow} ` +
        `-> ${MODEL_INPUT_SIZE}x${MODEL_INPUT_SIZE} RGB, model out ${outputBytes}B`,
    );
  } else if (status === 'unsupported-format') {
    console.warn(
      `[RepChamp] unsupported camera pixel format "${format}" — reps cannot be counted. ` +
        'Expected an rgb-* format.',
    );
  } else {
    console.warn(
      `[RepChamp] pose model returned ${outputBytes} bytes, expected ${EXPECTED_OUTPUT_BYTES}. ` +
        'The model variant does not match the decoder — reps cannot be counted.',
    );
  }
}

/**
 * Dev-only trace of the rep signal.
 *
 * Verifying rep counting needs more than watching the number go up: this prints
 * the smoothed depth, phase and tracking state so the descent/ascent swing can
 * be checked against the athlete's actual movement, and thresholds tuned. Logs
 * every 10th frame (~3/sec) to stay readable, plus every completed rep.
 */
/**
 * Rolling averages of the two costs in the pipeline, so a slow frame rate can
 * be attributed rather than guessed at.
 */
let convertTotal = 0;
let inferTotal = 0;
let timingSamples = 0;
function recordTimings(convertMs: number, inferMs: number): void {
  convertTotal += convertMs;
  inferTotal += inferMs;
  timingSamples += 1;
}

let traceFrame = 0;
let fpsWindowStart = 0;
let fpsWindowFrames = 0;
let measuredFps = 0;

function traceRep(update: ReturnType<RepCounter['push']>, pose: Pose): void {
  if (!__DEV__ || !POSE_TRACE) return;

  // Rolling frame-rate measurement over a 2s window. The camera negotiates the
  // closest rate it supports to what we asked for, so the only way to know what
  // we actually got is to count frames as they arrive.
  const now = Date.now();
  fpsWindowFrames += 1;
  if (fpsWindowStart === 0) fpsWindowStart = now;
  else if (now - fpsWindowStart >= 2000) {
    measuredFps = Math.round((fpsWindowFrames * 1000) / (now - fpsWindowStart));
    fpsWindowStart = now;
    fpsWindowFrames = 0;
  }

  if (update.completedRep) {
    const rep = update.completedRep;
    console.log(
      `[pose] REP ${rep.index} peak=${rep.peakDepth.toFixed(2)} ` +
        `${rep.fullDepth ? 'full' : 'partial'} ${rep.durationMs}ms align=${rep.alignment.toFixed(2)}`,
    );
    return;
  }

  if (traceFrame++ % 10 !== 0) return;
  const allJoints =
    pose.keypoints.reduce((acc, k) => acc + k.score, 0) / pose.keypoints.length;
  console.log(
    `[pose] depth=${update.depth.toFixed(2)} ${update.phase} reps=${update.reps} ` +
      `tracking=${update.tracking ? 'y' : 'n'} vis=${update.visibility.toFixed(2)} ` +
      `all=${allJoints.toFixed(2)} ${measuredFps}fps ` +
      `convert=${(convertTotal / Math.max(1, timingSamples)).toFixed(1)}ms ` +
      `infer=${(inferTotal / Math.max(1, timingSamples)).toFixed(1)}ms`,
  );
}

/**
 * Streams the rep signal to the console while testing on a device
 * (`npm run trace-reps`).
 *
 * Off by default: each log crosses to the console bridge, and at 25fps that
 * measurably competes with inference for the JS thread. Turn on only while
 * diagnosing detection, never for a build a user will hold.
 */
export const POSE_TRACE = false;

/** 17 keypoints x (y, x, score) x 4 bytes. */
const EXPECTED_OUTPUT_BYTES = 17 * 3 * 4;

export interface PoseSessionCallbacks {
  /** Fired for every frame with a decoded pose, on the JS thread. */
  onPose: (result: {
    depth: number;
    tracking: boolean;
    reps: number;
    completedRep: ReturnType<RepCounter['push']>['completedRep'];
    formCue: 'deeper' | null;
  }) => void;
  /** Fired during calibration with 0..1 framing confidence. */
  onFraming?: (confidence: number) => void;
}

export interface UsePoseSessionOptions extends PoseSessionCallbacks {
  exercise: ExerciseId;
  /** Camera runs only while true, so we release it between screens. */
  isActive: boolean;
  /** When false, poses still stream (for framing) but reps are not counted. */
  counting: boolean;
  /**
   * Versus / challenges — only full-depth reps increment the score.
   * Practice keeps counting partials with a “go deeper” cue.
   */
  competitive?: boolean;
  /**
   * Binds a third camera output so the session can be filmed. Off by default:
   * preview + analysis + video is more than some devices will bind, and losing
   * rep counting to gain a clip is the wrong trade.
   */
  record?: boolean;
  /**
   * DIAGNOSTIC: bind the video output WITHOUT the frame-analysis output, to test
   * whether the two can share the camera stream on this device. Remove once the
   * recording pipeline is understood.
   */
  recordOnly?: boolean;
}

/**
 * Streams the camera → pose model → rep counter pipeline.
 *
 * The model runs in a Vision Camera frame processor on its own worklet thread;
 * only the decoded 17×3 pose crosses to JS, where the rep state machine lives.
 * Keeping the state machine on the JS thread means it stays plain, testable
 * TypeScript (see `repCounter.test.ts`) rather than worklet code.
 *
 * Overlay keypoints stay on the UI thread via shared values every inference
 * frame. JS (`scheduleOnRN`) runs every frame while counting; during calibration
 * it is throttled so framing updates do not starve the UI thread.
 */

/** Min gap between JS framing updates when not counting (~10 Hz). */
const FRAMING_JS_INTERVAL_MS = 100;

export function usePoseSession({
  exercise,
  isActive,
  counting,
  competitive = false,
  record = false,
  recordOnly = false,
  onPose,
  onFraming,
}: UsePoseSessionOptions) {
  const model = useAcceleratedModel(POSE_MODEL_SOURCE);
  const definition = useMemo(() => getExercise(exercise), [exercise]);

  /**
   * Live keypoints for the skeleton overlay, as `[x, y, score] * 17`.
   *
   * Written from the frame processor and read by Skia on the UI thread, so the
   * overlay never touches React. Routing it through state instead would cap the
   * overlay at whatever the JS thread manages while also running inference, and
   * would re-render the session screen on every frame.
   */
  const posePoints = useSharedValue<number[]>([]);
  const poseVisible = useSharedValue(false);
  /** Frame dimensions, so the overlay can undo the preview's cover-scaling. */
  const poseFrame = useSharedValue<{ width: number; height: number }>({ width: 0, height: 0 });
  /** Worklet-visible counting flag — drives JS-bridge throttle. */
  const countingSv = useSharedValue(counting ? 1 : 0);
  const lastJsPushSv = useSharedValue(0);
  /** Run inference every Nth frame when the device is hot (1 = every frame). */
  const inferEveryN = useSharedValue(1);
  const frameTick = useSharedValue(0);
  const cameraFpsRef = useRef(TARGET_FPS);
  const [cameraFps, setCameraFps] = useState(TARGET_FPS);

  /**
   * Per-frame scratch buffers, pooled instead of allocated fresh every frame.
   *
   * `onFrame` used to `new` five buffers per call (crop, widened model input,
   * output view, two keypoint arrays) on VisionCamera's dedicated frame thread.
   * At ~30fps that is continuous GC pressure landing on the one thread ART must
   * be able to suspend for a stop-the-world pause — on a Pixel 7a this produced
   * a `SuspendAll timeout` SIGABRT during a live session. Reusing fixed-size
   * buffers (sizes never change: `MODEL_INPUT_SIZE` and the 17-keypoint output
   * are constants) removes that allocation without touching the maths.
   *
   * `cropSv`/`modelInputSv` are safe as a single reused shared value — they are
   * read-then-discarded within the same synchronous `onFrame` call, nothing
   * outside it retains a reference. `values`/`points` are different: `points`
   * is handed to `posePoints.value` for the UI thread to read asynchronously,
   * and `values` is handed to `scheduleOnRN`, which *queues* the JS-thread call
   * rather than running it inline. A single shared buffer for those two could
   * be overwritten by the next frame before a still-pending reader consumes the
   * current one, so — same double-buffer trick as `PoseOverlay.tsx`'s
   * `smoothA`/`smoothB` — each gets two alternating buffers and a flip flag.
   */
  const cropSv = useSharedValue<Uint8Array>(new Uint8Array(MODEL_INPUT_SIZE * MODEL_INPUT_SIZE * 3));
  const modelInputSv = useSharedValue<Int32Array | Float32Array | null>(null);
  const valuesA = useSharedValue<number[]>(new Array(51).fill(0));
  const valuesB = useSharedValue<number[]>(new Array(51).fill(0));
  const pointsA = useSharedValue<number[]>(new Array(51).fill(0));
  const pointsB = useSharedValue<number[]>(new Array(51).fill(0));
  const bridgeFlip = useSharedValue(0);

  const counterRef = useRef<RepCounter>(
    new RepCounter(definition, { requireFullDepth: competitive }),
  );
  const countingRef = useRef(counting);
  // eslint-disable-next-line react-hooks/refs
  countingRef.current = counting;

  /**
   * Ceiling on the thermal frame-skip, set by how fast this exercise's reps
   * are.
   *
   * The throttle used to drop to every 3rd frame for every exercise alike. At
   * 30fps that leaves 10 samples a second, which is ample for an 800ms
   * full-body stretch but not for 280ms high knees — three samples cannot
   * resolve a peak, so the depth signal never reaches `downThreshold` and the
   * rep is never even started. Reps vanished rather than counting shallow.
   *
   * Keeping at least ~8 samples across the fastest legal rep is enough for the
   * filter to track its peak, so the skip is capped at whatever still clears
   * that. Slow exercises are unaffected and still throttle fully when hot.
   */
  const maxFrameSkip = useMemo(() => {
    const MIN_SAMPLES_PER_REP = 8;
    const frameMs = 1000 / TARGET_FPS;
    const affordable = Math.floor(
      definition.minRepDurationMs / (frameMs * MIN_SAMPLES_PER_REP),
    );
    // Never below 1 (no skipping) and never above the thermal ceiling of 3.
    return Math.max(1, Math.min(3, affordable));
  }, [definition]);

  useEffect(() => {
    countingSv.value = counting ? 1 : 0;
  }, [counting, countingSv]);

  // Rebuild the counter whenever the exercise or competitive gate changes.
  useEffect(() => {
    counterRef.current = new RepCounter(definition, { requireFullDepth: competitive });
  }, [definition, competitive]);

  /**
   * Runs on the JS thread. Receives a plain array (worklet boundaries cannot
   * carry class instances or typed arrays) and rebuilds the pose.
   */
  const handleTensor = useCallback(
    (
      values: number[],
      timestamp: number,
      status: FrameStatus,
      format: string,
      width: number,
      height: number,
      bytesPerRow: number,
      outputBytes: number,
      convertMs = 0,
      inferMs = 0,
    ) => {
      reportFrameOnce(status, format, width, height, bytesPerRow, outputBytes);
      recordTimings(convertMs, inferMs);
      noteInferenceMs(inferMs);
      const thermalEvery = inferMs > 48 ? 3 : inferMs > 38 ? 2 : 1;
      /* Writing `.value` is how a Reanimated shared value is set — the whole
         point of one is that both the JS thread and the frame processor can
         update it without a re-render. The immutability rule reads this as
         mutating a prop; there is no non-mutating way to move a shared value,
         and using state here would re-render on every frame. */
      // eslint-disable-next-line react-hooks/immutability
      inferEveryN.value = Math.min(thermalEvery, maxFrameSkip);
      const nextFps = suggestedCameraFps(TARGET_FPS);
      if (nextFps !== cameraFpsRef.current) {
        cameraFpsRef.current = nextFps;
        setCameraFps(nextFps);
      }

      if (status !== 'ok') return;

      const pose = decodePoseTensor(values, timestamp);
      if (!pose) return;

      onFraming?.(framingConfidence(pose));

      if (!countingRef.current) return;

      const update = counterRef.current.push(pose);
      traceRep(update, pose);
      onPose({
        depth: update.depth,
        tracking: update.tracking,
        reps: update.reps,
        completedRep: update.completedRep,
        formCue: update.formCue,
      });
    },
    [onPose, onFraming, inferEveryN, maxFrameSkip],
  );

  /**
   * The loaded interpreter, or undefined while the model is still warming up.
   *
   * Depending on this rather than the whole `model` object matters: the hook
   * returns a fresh wrapper on every render, which would rebuild `onFrame` —
   * and therefore tear down and re-create the frame processor — continuously.
   * The interpreter itself is stable once loaded.
   */
  const interpreter = model.state === 'loaded' ? model.model : undefined;

  /**
   * The model's declared input element type. MoveNet MultiPose wants int32 pixel
   * values, unlike the old SinglePose int8 build that took bytes — so the packed
   * uint8 buffer is widened to match (see inlined widen below). Read once from the
   * loaded model rather than hard-coded, so a re-quantised model still works.
   */
  const inputDataType = interpreter?.inputs[0]?.dataType ?? 'uint8';

  const onFrame = useCallback(
    (frame: Frame) => {
      'worklet';
      try {
        if (!interpreter) return;

        // Thermal throttle: skip analysis on alternate frames when infer is slow.
        frameTick.value = frameTick.value + 1;
        const every = inferEveryN.value;
        if (every > 1 && frameTick.value % every !== 0) {
          return;
        }

        // Pixel / tensor helpers are defined *inside* this worklet (not imported
        // worklets). Nested worklets that closed over module scratch state used
        // to crash Hermes with "invalid assignment left-hand side" in
        // valueUnpacker when evaluating `pixelBuffer.ts`.
        const format = frame.pixelFormat;
        const layout =
          format === 'rgb-rgb-8-bit'
            ? 'rgb'
            : format === 'rgb-rgba-8-bit'
              ? 'rgba'
              : format === 'rgb-bgra-8-bit'
                ? 'bgra'
                : null;
        if (layout === null) {
          scheduleOnRN(handleTensor, [], 0, 'unsupported-format', frame.pixelFormat, frame.width, frame.height, 0, 0);
          return;
        }

        const planes = frame.getPlanes();
        const plane = planes[0];
        if (!plane) return;

        const tConvertStart = performance.now();
        const source = new Uint8Array(plane.getPixelBuffer());
        const frameWidth = frame.width;
        const frameHeight = frame.height;
        const rowStride = plane.bytesPerRow;
        const size = MODEL_INPUT_SIZE;
        const channels = layout === 'rgb' ? 3 : 4;
        if (frameWidth <= 0 || frameHeight <= 0 || rowStride < frameWidth * channels) {
          return;
        }

        const crop = frameWidth < frameHeight ? frameWidth : frameHeight;
        const originX = Math.floor((frameWidth - crop) / 2);
        const originY = Math.floor((frameHeight - crop) / 2);
        const redAt = layout === 'bgra' ? 2 : 0;
        const blueAt = layout === 'bgra' ? 0 : 2;
        // Pooled crop buffer — same fixed size (size*size*3) every call, so it
        // is written in place instead of allocated fresh (see cropSv comment
        // above for why this matters on the frame-processor thread).
        const input = cropSv.value;
        for (let ty = 0; ty < size; ty++) {
          const sy = originY + Math.min(crop - 1, Math.floor(((ty + 0.5) * crop) / size));
          const rowStart = sy * rowStride;
          for (let tx = 0; tx < size; tx++) {
            const sx = originX + Math.min(crop - 1, Math.floor(((tx + 0.5) * crop) / size));
            const pixel = rowStart + sx * channels;
            const dest = (ty * size + tx) * 3;
            input[dest] = source[pixel + redAt] as number;
            input[dest + 1] = source[pixel + 1] as number;
            input[dest + 2] = source[pixel + blueAt] as number;
          }
        }

        const tInferStart = performance.now();
        let modelBuffer: ArrayBuffer = input.buffer as ArrayBuffer;
        if (inputDataType === 'int32' || inputDataType === 'float32') {
          // Pooled widened buffer, lazily created once then reused — the model's
          // declared input dtype never changes after the interpreter loads.
          let widened = modelInputSv.value;
          const needsInt32 = inputDataType === 'int32';
          if (
            !widened ||
            widened.length !== input.length ||
            (needsInt32 && !(widened instanceof Int32Array)) ||
            (!needsInt32 && !(widened instanceof Float32Array))
          ) {
            widened = needsInt32 ? new Int32Array(input.length) : new Float32Array(input.length);
            modelInputSv.value = widened;
          }
          for (let i = 0; i < input.length; i++) widened[i] = input[i]!;
          modelBuffer = widened.buffer as ArrayBuffer;
        }

        const outputs = interpreter.runSync([modelBuffer]);
        const tInferEnd = performance.now();
        const output = outputs[0];
        if (!output) return;

        // MoveNet emits 17 float32 (y, x, score) triples — 204 bytes — even in
        // the int8-quantised build, because only the weights are quantised. If a
        // model variant ever returns a different width, reading it as float32
        // would yield plausible-looking nonsense, so check rather than assume.
        if (output.byteLength !== EXPECTED_OUTPUT_BYTES) {
          scheduleOnRN(
            handleTensor,
            [],
            0,
            'unexpected-output',
            frame.pixelFormat,
            frame.width,
            frame.height,
            plane.bytesPerRow,
            output.byteLength,
          );
          return;
        }
        // `output` already IS a Float32Array-backed ArrayBuffer from Nitro —
        // wrap without copying (a `new Float32Array(buffer)` view, not a fresh
        // allocation of its contents).
        const tensor = new Float32Array(output);

        // Copy out of the model's buffer before it is reused by the next
        // inference, and simultaneously build the overlay buffer. MoveNet emits
        // (y, x, score); the overlay wants (x, y, score) in draw order, and the
        // preview is mirrored for the front lens so x is flipped to match.
        //
        // `values` crosses to JS via `scheduleOnRN`, which *queues* the call
        // rather than running it inline, and `points` is read asynchronously
        // off `posePoints.value` by the UI thread — so a single reused buffer
        // for either risks the next frame overwriting one still being read.
        // Double-buffer both and flip which half is written each frame, same
        // as `PoseOverlay.tsx`'s `smoothA`/`smoothB` pattern.
        const flip = bridgeFlip.value;
        const values = flip === 0 ? valuesA.value : valuesB.value;
        const points = flip === 0 ? pointsA.value : pointsB.value;
        bridgeFlip.value = 1 - flip;

        /**
         * Keypoints come back in the square centre-crop's coordinate space,
         * because that is what was fed to the model. Undo the crop here so the
         * overlay receives full-frame normalised coordinates — the geometry is
         * only known on this side.
         */
        const fw = frame.width;
        const fh = frame.height;
        const cropSize = fw < fh ? fw : fh;
        const cropX = (fw - cropSize) / 2;
        const cropY = (fh - cropSize) / 2;

        let vi = 0;
        let pi = 0;
        for (let i = 0; i < tensor.length; i += 3) {
          const y = tensor[i] as number;
          const x = tensor[i + 1] as number;
          const score = tensor[i + 2] as number;

          // Rep maths uses crop space — it only measures angles, which the crop
          // preserves — so `values` stays untouched.
          // Worklets reject `arr[i++] = …` as an assignment LHS.
          values[vi] = y;
          values[vi + 1] = x;
          values[vi + 2] = score;
          vi += 3;

          // The preview is mirrored for the front lens, so flip x to match.
          points[pi] = 1 - (cropX + x * cropSize) / fw;
          points[pi + 1] = (cropY + y * cropSize) / fh;
          points[pi + 2] = score;
          pi += 3;
        }

        posePoints.value = points;
        poseFrame.value = { width: fw, height: fh };
        poseVisible.value = true;

        // Always push to JS while counting (rep timing). While calibrating,
        // throttle framing updates so the bridge does not compete with UI.
        const now = Date.now();
        const countingNow = countingSv.value === 1;
        if (
          countingNow ||
          now - lastJsPushSv.value >= FRAMING_JS_INTERVAL_MS
        ) {
          lastJsPushSv.value = now;
          // `scheduleOnRN` serializes its arguments synchronously before
          // returning (`__serializer(args)` in react-native-worklets), so
          // `values`'s current contents are captured here — safe to pass the
          // pooled array directly without an extra copy.
          scheduleOnRN(
            handleTensor,
            values,
            now,
            'ok',
            frame.pixelFormat,
            frame.width,
            frame.height,
            plane.bytesPerRow,
            output.byteLength,
            tInferStart - tConvertStart,
            tInferEnd - tInferStart,
          );
        }
      } finally {
        // Always dispose, even if inference threw — a leaked frame stalls the
        // whole camera pipeline after a handful of drops.
        frame.dispose();
      }
    },
    [
      interpreter,
      inputDataType,
      handleTensor,
      posePoints,
      poseVisible,
      poseFrame,
      countingSv,
      lastJsPushSv,
      inferEveryN,
      frameTick,
      cropSv,
      modelInputSv,
      valuesA,
      valuesB,
      pointsA,
      pointsB,
      bridgeFlip,
    ],
  );

  const frameOutput = useFrameOutput({
    onFrame,
    pixelFormat: 'rgb',
    /**
     * Deliberately much larger than the model's input. Asking for 192x192
     * makes the camera pick its nearest supported size — on a Pixel 7a that is
     * 144x176, which then has to be *upscaled* to 192 and costs keypoint
     * confidence. Requesting a standard 640x480 and downsampling gives the
     * model a far sharper 192x192.
     *
     * This costs nothing extra to convert: the frame worklet samples exactly
     * MODEL_INPUT_SIZE^2 source pixels regardless of how large the frame is.
     */
    targetResolution: { width: 640, height: 480 },
    // Drop rather than queue: a stale frame is worse than no frame for rep timing.
    dropFramesWhileBusy: true,
    /**
     * Without this, frames arrive in the sensor's native orientation — on most
     * Android phones held in portrait that is rotated 90°, presenting a sideways
     * athlete to a model trained on upright people. Physical rotation costs some
     * throughput but is the difference between detection working and not.
     */
    enablePhysicalBufferRotation: true,
  });

  const resetCounter = useCallback(() => {
    counterRef.current.reset();
  }, []);

  /**
   * Only the frame output is passed explicitly. `<Camera>` creates and binds its
   * own preview output for the view it renders, so also passing one from
   * `usePreviewOutput()` binds two previews and CameraX rejects the whole
   * session with "No supported surface combination is found".
   *
   * Memoised so the prop identity is stable across renders, which would
   * otherwise churn the camera session configuration.
   */
  const recorder = useSessionRecorder({ enabled: record });

  const outputs = useMemo(() => {
    if (recordOnly) return [recorder.videoOutput];
    return record ? [frameOutput, recorder.videoOutput] : [frameOutput];
  }, [frameOutput, record, recordOnly, recorder.videoOutput]);

  /**
   * Resolve the front camera explicitly rather than passing the `'front'`
   * shorthand to `<Camera>`. On hardware without one — every iOS Simulator, and
   * some Android emulators — the shorthand throws during render, which takes the
   * whole session screen down. Resolving it here lets the caller fall back to
   * the timed calibration path instead.
   */
  const device = useCameraDevice('front');

  return {
    /** Recording controls; inert unless `record` was requested. */
    recorder,
    /** Live keypoints for the skeleton overlay. */
    posePoints,
    /** Drives overlay visibility without re-rendering the session screen. */
    poseVisible,
    /** Source frame size, for mapping keypoints onto the preview. */
    poseFrame,
    device,
    /** True only when a real camera exists and the model is ready. */
    canUseCamera: device != null && model.state === 'loaded',
    /** Pass straight to `<Camera outputs={…} />`. */
    outputs,
    isActive,
    modelState: model.state,
    /**
     * Why the model failed, when it did.
     *
     * Without this the screen can only say "unavailable", which is the same
     * message whether the file is missing, the delegate is unsupported, or the
     * device is out of memory — and a release build has no Metro log to check.
     */
    modelError: model.state === 'error' ? model.error : undefined,
    /** Adaptive camera FPS for long sessions (thermal / battery). */
    cameraFps,
    /** Rep records accumulated so far, for the end-of-session form report. */
    getRepHistory: () => counterRef.current.history,
    resetCounter,
  };
}

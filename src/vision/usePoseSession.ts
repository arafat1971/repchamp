import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useCameraDevice, useFrameOutput } from 'react-native-vision-camera';
import type { Frame } from 'react-native-vision-camera';
import { useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { getExercise, type ExerciseId } from './exercises';
import { useAcceleratedModel } from './useAcceleratedModel';
import { useSessionRecorder } from './useSessionRecorder';
import { layoutForPixelFormat, packFrameToRgb } from './pixelBuffer';
import { toModelInput } from './modelInput';
import { MODEL_INPUT_SIZE, decodePoseTensor, framingConfidence } from './poseDetector';
import { RepCounter } from './repCounter';
import type { Pose } from './keypoints';

/**
 * The MoveNet model file. Run `npm run fetch-model` once after cloning — it is
 * ~3MB and deliberately untracked, so this require fails loudly if it's missing.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const MODEL = require('../../assets/models/movenet.tflite');

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
 * Wires the camera → pose model → rep counter pipeline.
 *
 * The model runs in a Vision Camera frame processor on its own worklet thread;
 * only the decoded 17×3 pose crosses to JS, where the rep state machine lives.
 * Keeping the state machine on the JS thread means it stays plain, testable
 * TypeScript (see `repCounter.test.ts`) rather than worklet code.
 */
export function usePoseSession({
  exercise,
  isActive,
  counting,
  record = false,
  recordOnly = false,
  onPose,
  onFraming,
}: UsePoseSessionOptions) {
  const model = useAcceleratedModel(MODEL);
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

  const counterRef = useRef<RepCounter>(new RepCounter(definition));
  const countingRef = useRef(counting);
  countingRef.current = counting;

  // Rebuild the counter whenever the exercise changes so thresholds and rep
  // history never carry over from a previous movement.
  useEffect(() => {
    counterRef.current = new RepCounter(definition);
  }, [definition]);

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
      });
    },
    [onPose, onFraming],
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
   * uint8 buffer is widened to match (see `toModelInput`). Read once from the
   * loaded model rather than hard-coded, so a re-quantised model still works.
   */
  const inputDataType = interpreter?.inputs[0]?.dataType ?? 'uint8';

  const onFrame = useCallback(
    (frame: Frame) => {
      'worklet';
      try {
        if (!interpreter) return;

        // `pixelFormat: 'rgb'` resolves to a concrete layout — commonly BGRA,
        // 4 bytes per pixel — and `targetResolution` is only a hint, so the
        // frame must be repacked into MoveNet's tightly packed RGB input rather
        // than fed straight through.
        const layout = layoutForPixelFormat(frame.pixelFormat);
        if (layout === null) {
          scheduleOnRN(handleTensor, [], 0, 'unsupported-format', frame.pixelFormat, frame.width, frame.height, 0, 0);
          return;
        }

        const planes = frame.getPlanes();
        const plane = planes[0];
        if (!plane) return;

        const tConvertStart = performance.now();
        const input = packFrameToRgb(
          new Uint8Array(plane.getPixelBuffer()),
          {
            width: frame.width,
            height: frame.height,
            bytesPerRow: plane.bytesPerRow,
            layout,
          },
          MODEL_INPUT_SIZE,
        );
        if (input === null) return;
        const tInferStart = performance.now();

        const outputs = interpreter.runSync([toModelInput(input, inputDataType)]);
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
        const tensor = new Float32Array(output);

        // Copy out of the model's buffer before it is reused by the next
        // inference, and simultaneously build the overlay buffer. MoveNet emits
        // (y, x, score); the overlay wants (x, y, score) in draw order, and the
        // preview is mirrored for the front lens so x is flipped to match.
        const values: number[] = [];
        const points: number[] = [];

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

        for (let i = 0; i < tensor.length; i += 3) {
          const y = tensor[i] as number;
          const x = tensor[i + 1] as number;
          const score = tensor[i + 2] as number;

          // Rep maths uses crop space — it only measures angles, which the crop
          // preserves — so `values` stays untouched.
          values.push(y, x, score);

          // The preview is mirrored for the front lens, so flip x to match.
          points.push(1 - (cropX + x * cropSize) / fw, (cropY + y * cropSize) / fh, score);
        }

        posePoints.value = points;
        poseFrame.value = { width: fw, height: fh };
        poseVisible.value = true;

        // `scheduleOnRN` marshals the decoded pose back to the React thread.
        // Only plain values may cross, which is why `handleTensor` takes a
        // number[] rather than the typed array.
        scheduleOnRN(
          handleTensor,
          values,
          Date.now(),
          'ok',
          frame.pixelFormat,
          frame.width,
          frame.height,
          plane.bytesPerRow,
          output.byteLength,
          tInferStart - tConvertStart,
          tInferEnd - tInferStart,
        );
      } finally {
        // Always dispose, even if inference threw — a leaked frame stalls the
        // whole camera pipeline after a handful of drops.
        frame.dispose();
      }
    },
    [interpreter, handleTensor, posePoints, poseVisible, poseFrame],
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
     * This costs nothing extra to convert: `packFrameToRgb` samples exactly
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
    /** Rep records accumulated so far, for the end-of-session form report. */
    getRepHistory: () => counterRef.current.history,
    resetCounter,
  };
}

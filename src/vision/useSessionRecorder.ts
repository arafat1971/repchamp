import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVideoOutput } from 'react-native-vision-camera';
import type { Recorder } from 'react-native-vision-camera';

export type RecordingState = 'idle' | 'starting' | 'recording' | 'saving' | 'saved' | 'error';

export interface SessionRecording {
  /** Local file path of the finished clip. */
  filePath: string;
  /** Duration in seconds, as reported by the recorder. */
  durationSec: number;
}

/**
 * Records the camera feed for the duration of a session.
 *
 * The video output is bound alongside the preview and the frame-analysis output
 * the pose model reads. That is three concurrent camera outputs, which some
 * devices refuse — CameraX rejects the whole session with "No supported surface
 * combination is found" rather than degrading. `enabled` therefore gates the
 * output entirely, so a session can still run (and count reps) on a device that
 * cannot also record.
 *
 * Recording is deliberately silent by default: a duel is filmed in a gym or
 * living room, and capturing audio raises a consent question the app has no way
 * to answer for bystanders.
 */
export function useSessionRecorder({
  enabled,
  maxDurationSec,
}: {
  enabled: boolean;
  maxDurationSec?: number;
}) {
  const [state, setState] = useState<RecordingState>('idle');
  const [recording, setRecording] = useState<SessionRecording | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const recorderRef = useRef<Recorder | null>(null);
  const startedAtRef = useRef(0);
  /**
   * The recorder's callbacks fire whenever the encoder finishes, which can be
   * after the session screen has already navigated away. Writing state then
   * warns and leaks, so every setter is gated on the component still existing.
   */
  const mountedRef = useRef(true);
  /**
   * Set synchronously before any await in `start()`.
   *
   * `recorderRef` is only assigned *after* `createRecorder()` resolves, so two
   * calls arriving in the same tick both saw a null ref and both started a
   * recording — CameraX then threw "A recording is already in progress" and the
   * clip was left empty. React's concurrent rendering can invoke the effect
   * twice, so this must be a synchronous latch, not a state flag.
   */
  const startingRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /**
   * Set while a stop is in flight. Finishing a session calls `stop()` and then
   * navigates immediately, so the screen unmounts while the encoder is still
   * finalising. Without this the unmount cleanup cancelled the recording and
   * left a 0-byte file — the clip must be allowed to finish writing.
   */
  const stoppingRef = useRef(false);
  /** Resolves once the encoder reports the file is written. */
  const finishedRef = useRef<((r: SessionRecording | null) => void) | null>(null);

  const videoOutput = useVideoOutput({
    // 720p is plenty for a share card and keeps the encoder off the CPU budget
    // the pose model is competing for.
    targetResolution: { width: 1280, height: 720 },
    enableAudio: false,
    fileType: 'mp4',
  });

  const start = useCallback(async () => {
    if (!enabled || recorderRef.current || startingRef.current) return;
    startingRef.current = true;

    try {
      setState('starting');
      setError(null);

      if (__DEV__) console.log('[rec] createRecorder…');
      const recorder = await videoOutput.createRecorder(
        maxDurationSec ? { maxDuration: maxDurationSec } : {},
      );
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      if (__DEV__) console.log('[rec] recorder created, starting…');

      // Poll the encoder's own counters so we can see whether frames are
      // actually being written, independent of the final file size.
      if (__DEV__) {
        const poll = setInterval(() => {
          const r = recorderRef.current;
          if (!r) {
            clearInterval(poll);
            return;
          }
          console.log(
            `[rec] isRecording=${r.isRecording} dur=${r.recordedDuration.toFixed(1)}s ` +
              `size=${r.recordedFileSize}B`,
          );
        }, 2000);
        pollRef.current = poll;
      }

      const startTs = Date.now();
      await recorder.startRecording(
        (filePath, reason) => {
          if (__DEV__) {
            console.log(
              `[rec] onRecordingFinished reason=${reason} after ${Date.now() - startTs}ms: ${filePath}`,
            );
          }
          if (pollRef.current) clearInterval(pollRef.current);
          const result: SessionRecording = {
            filePath,
            durationSec: Math.round((Date.now() - startedAtRef.current) / 1000),
          };
          recorderRef.current = null;
          stoppingRef.current = false;
          startingRef.current = false;
          // Release `stop()` first: the caller is holding navigation open
          // waiting for the file, and the encoder has finished with it now.
          finishedRef.current?.(result);
          finishedRef.current = null;
          if (!mountedRef.current) return;
          setRecording(result);
          setState('saved');
        },
        (recordingError) => {
          if (__DEV__) console.log(`[rec] onRecordingError: ${recordingError.message}`);
          if (pollRef.current) clearInterval(pollRef.current);
          recorderRef.current = null;
          stoppingRef.current = false;
          startingRef.current = false;
          finishedRef.current?.(null);
          finishedRef.current = null;
          if (!mountedRef.current) return;
          setError(recordingError);
          setState('error');
        },
      );
      if (mountedRef.current) setState('recording');
    } catch (e) {
      startingRef.current = false;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      // A failed recording must never take the session down — the athlete is
      // mid-set and reps matter more than the clip.
      recorderRef.current = null;
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e : new Error(String(e)));
      setState('error');
    }
  }, [enabled, videoOutput, maxDurationSec]);

  /**
   * Stops recording and resolves only once the file is actually on disk.
   *
   * `stopRecording()` returns as soon as the stop is requested, not when the
   * encoder has flushed. Navigating away at that point unmounts the camera
   * session and kills the encoder mid-finalise, leaving a 0-byte file — so this
   * waits for the `onRecordingFinished` callback instead.
   */
  const stop = useCallback(async (): Promise<SessionRecording | null> => {
    const recorder = recorderRef.current;
    if (!recorder) return null;
    try {
      stoppingRef.current = true;
      if (mountedRef.current) setState('saving');

      const finished = new Promise<SessionRecording | null>((resolve) => {
        finishedRef.current = resolve;
        // Never hang the UI on a stuck encoder.
        setTimeout(() => {
          if (finishedRef.current === resolve) {
            finishedRef.current = null;
            resolve(null);
          }
        }, 4000);
      });

      if (__DEV__) console.log('[rec] stopRecording called by app');
      await recorder.stopRecording();
      return await finished;
    } catch (e) {
      recorderRef.current = null;
      stoppingRef.current = false;
      if (mountedRef.current) {
        setError(e instanceof Error ? e : new Error(String(e)));
        setState('error');
      }
      return null;
    }
  }, []);

  /** Abandons the clip without saving — used when the athlete gives up. */
  const cancel = useCallback(async () => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    startingRef.current = false;
    setState('idle');
    if (recorder) {
      try {
        await recorder.cancelRecording();
      } catch {
        // Nothing useful to do — the file is discarded either way.
      }
    }
  }, []);

  // Never leave the encoder running if the screen goes away mid-set.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // A recording that is already stopping must be left alone to finalise;
      // cancelling here is what produced empty files.
      if (stoppingRef.current) return;
      const recorder = recorderRef.current;
      recorderRef.current = null;
      if (recorder) void recorder.cancelRecording().catch(() => {});
    };
  }, []);

  /**
   * Memoised so the returned object has a stable identity.
   *
   * Callers put this in effect dependency arrays; a fresh object literal every
   * render re-ran the "session started" effect continuously, which called
   * `start()` repeatedly and left a trail of abandoned, empty recordings.
   */
  return useMemo(
    () => ({
      /** Pass to `<Camera outputs={…} />` when recording is enabled. */
      videoOutput,
      state,
      recording,
      error,
      isRecording: state === 'recording',
      start,
      stop,
      cancel,
    }),
    [videoOutput, state, recording, error, start, stop, cancel],
  );
}

import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { useCameraPermission } from 'react-native-vision-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import { CameraDenied } from '@/components/session/CameraDenied';
import { CameraStage, StatusChip } from '@/components/session/CameraStage';
import { CameraTutorial } from '@/components/session/CameraTutorial';
import { PoseDebugHud } from '@/components/session/PoseDebugHud';
import { PoseOverlay } from '@/components/session/PoseOverlay';
import { ProgressRing, RingPercent } from '@/components/session/ProgressRing';
import { DuelHud } from '@/components/session/DuelHud';
import { TogetherHud } from '@/components/session/TogetherHud';
import { PressableScale } from '@/components/ui';
import { OpponentPacer, getOpponent } from '@/domain/opponent';
import { shouldPromptUpgrade } from '@/domain/paywallGate';
import type { SessionMode } from '@/domain/progression';
import { isPurchasesConfigured } from '@/services/purchases';
import { useAuthStore } from '@/state/authStore';
import { useEffectivePro, useProStore } from '@/state/proStore';
import {
  lockHaptic,
  playCountSound,
  playGoSound,
  repFeedback,
  speak,
  stopSpeaking,
  successHaptic,
} from '@/lib/feedback';
import { track } from '@/lib/analytics';
import { touchPresence } from '@/services/userService';
import { defaultDuration, useSessionStore } from '@/state/sessionStore';
import { useCouple } from '@/state/useCouple';
import { useLiveDuel } from '@/state/useLiveDuel';
import { isInSync } from '@/domain/couple';
import { dayKey } from '@/domain/progression';
import { recordCoupleSession } from '@/services/coupleService';
import { useSettingsStore } from '@/state/settingsStore';
import { EXERCISES, getExercise, type ExerciseId } from '@/vision/exercises';
import { buildFormReport } from '@/vision/formScore';
import type { RepRecord } from '@/vision/repCounter';
import { usePoseSession } from '@/vision/usePoseSession';
import { font, text } from '@/theme/typography';
import { palette } from '@/theme/tokens';

/** Framing confidence that counts as "body locked". */
const CALIBRATION_LOCK = 0.55;

export default function SessionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const params = useLocalSearchParams<{
    exercise?: string;
    mode?: string;
    target?: string;
    opponent?: string;
    duel?: string;
  }>();

  // Accept any registered exercise id, falling back to push-ups for a missing or
  // unknown param — validated against the registry so new library movements work
  // without touching this line.
  const exercise: ExerciseId =
    params.exercise && params.exercise in EXERCISES ? (params.exercise as ExerciseId) : 'push';
  const mode: SessionMode =
    params.mode === 'solo'
      ? 'solo'
      : params.mode === 'practice'
        ? 'practice'
        : params.mode === 'together'
          ? 'together'
          : 'versus';
  const target = params.target ? Number(params.target) : mode === 'solo' ? 25 : null;
  const opponentId = params.opponent ?? 'adrian';

  /**
   * A real 1v1 match id, present only when this session was opened from a live
   * duel (createDuel/joinDuel). When set, `useLiveDuel` streams our reps up and
   * drives the opponent from the remote seat; when absent the bot pacer runs.
   */
  const duelId = params.duel ?? null;
  const live = useLiveDuel(duelId);
  const uid = useAuthStore((s) => s.user?.uid);

  useEffect(() => {
    if (uid) void touchPresence(uid);
  }, [uid]);

  const definition = getExercise(exercise);
  const opponent = useMemo(() => getOpponent(opponentId), [opponentId]);

  const { hasPermission, status: permissionStatus, canRequestPermission, requestPermission } =
    useCameraPermission();
  /**
   * The user actively blocked the camera (denied it, or the OS restricted it).
   * A `denied` status can no longer be re-requested from inside the app, so
   * this gates a dedicated "turn it on in Settings" screen instead of silently
   * running a fake, camera-less session.
   */
  const cameraBlocked = permissionStatus === 'denied' || permissionStatus === 'restricted';
  /**
   * Subscribed field by field rather than `useSessionStore()` wholesale. The
   * whole-store subscription re-rendered this screen — and the HUD and overlay
   * beneath it — on every store write, including the per-frame pose updates.
   */
  const isPro = useEffectivePro();
  const proReady = useProStore((s) => s.ready);

  const phase = useSessionStore((s) => s.phase);
  const reps = useSessionStore((s) => s.reps);
  const opponentReps = useSessionStore((s) => s.opponentReps);
  const timeLeft = useSessionStore((s) => s.timeLeft);
  const countdown = useSessionStore((s) => s.countdown);
  const calibration = useSessionStore((s) => s.calibration);
  const tracking = useSessionStore((s) => s.tracking);
  const depth = useSessionStore((s) => s.depth);
  const formCue = useSessionStore((s) => s.formCue);
  const startSession = useSessionStore((s) => s.start);
  const cameraStageRef = useRef<View>(null);
  const cameraRef = useRef<any>(null);
  // One action shot is grabbed mid-set (camera + pose line live) for the share
  // card; this latches so we capture exactly once per session.
  const snapshotCapturedRef = useRef(false);

  // The pre-set camera tutorial shows once, then never again. Seeding local
  // state from the persisted flag means dismissing it hides it instantly this
  // session while `markCameraTutorialSeen` keeps it gone on every future one.
  const cameraTutorialSeen = useSettingsStore((s) => s.cameraTutorialSeen);
  const markCameraTutorialSeen = useSettingsStore((s) => s.markCameraTutorialSeen);
  const [showTutorial, setShowTutorial] = useState(!cameraTutorialSeen);

  const dismissTutorial = useCallback(() => {
    setShowTutorial(false);
    markCameraTutorialSeen();
  }, [markCameraTutorialSeen]);

  // Opponent pace is fixed the moment the duel starts, so re-renders cannot
  // re-roll the rival's score mid-set.
  const pacerRef = useRef<OpponentPacer | null>(null);
  const startedAtRef = useRef<number>(0);
  /** True once the athlete tapped Give Up, so the live duel settles as a forfeit. */
  const forfeitedRef = useRef(false);
  const [framing, setFraming] = useState(0);

  /**
   * Couple bond, only consulted in `together` mode. The partner's reps arrive
   * through the same live-duel seat the bot pacer would otherwise fill, so the
   * transport is shared with versus and only the framing differs.
   */
  const { partner, streak: coupleStreak, couple, me: coupleMe } = useCouple();
  /** Wall-clock of each side's last counted rep, for the in-sync indicator. */
  const myLastRepAt = useRef<number | null>(null);
  const partnerLastRepAt = useRef<number | null>(null);
  const lastPartnerReps = useRef(0);
  const [inSync, setInSync] = useState(false);
  /**
   * Offers a manual start if calibration has not locked after a while.
   *
   * Pose confidence depends on lighting, framing and clothing, so there will
   * always be setups the model cannot lock onto. Without an escape the athlete
   * is stranded on the calibration screen with no way forward.
   */
  const [calibrationStalled, setCalibrationStalled] = useState(false);

  const duration = mode === 'solo' && target ? defaultDuration('solo') : defaultDuration(mode);

  /* ---------------------------------------------------------------- *
   * Session bootstrap
   * ---------------------------------------------------------------- */
  useEffect(() => {
    // Only prompt when the OS will actually show the dialog. Once denied, the
    // request resolves instantly to `false` without a prompt, so re-firing it
    // does nothing — the athlete has to flip it in Settings instead.
    if (!hasPermission && canRequestPermission) void requestPermission();
  }, [hasPermission, canRequestPermission, requestPermission]);

  useEffect(() => {
    startSession({ exercise, mode, duration, target, opponentId: mode === 'versus' ? opponentId : null });
    // Fresh session — allow a new action shot to be captured.
    snapshotCapturedRef.current = false;
    // A live duel (duelId set) drives the opponent from the remote seat — no bot.
    // Key off the route param, NOT live.active: auth can resolve after mount and
    // flip live.active, which must never re-run startSession and wipe mid-set reps.
    pacerRef.current =
      mode === 'versus' && !duelId
        ? new OpponentPacer(opponent, duration, Date.now() % 100000)
        : null;

    // Deliberately does NOT reset the session store. Navigating to the result
    // screen unmounts this one, and the result screen reads the finished
    // session's config, score and form report — clearing it here would blank
    // that screen out. `start()` resets state at the beginning of every
    // session, and the result screen's "Done" resets it on the way out.
    return stopSpeaking;
  }, [exercise, mode, duration, target, opponentId, opponent, startSession, duelId]);

  /* ---------------------------------------------------------------- *
   * Pose pipeline
   * ---------------------------------------------------------------- */
  const handlePose = useCallback(
    ({
      depth,
      tracking,
      completedRep,
    }: {
      depth: number;
      tracking: boolean;
      completedRep: RepRecord | null;
    }) => {
      if (completedRep) {
        repFeedback();
        myLastRepAt.current = Date.now();
        if (completedRep.index === 1) {
          track('first_rep_counted', { exercise });
        }
        // Grab one action shot for the share card while the set is live: the
        // camera preview and the pose-line overlay are both on screen now, but
        // both are gone the instant the set ends and the camera releases. We
        // snapshot the stage view (camera + skeleton) rather than the raw camera
        // still, so the captured image already carries the pose line. Latched to
        // fire once, after a couple of reps so the athlete is well framed.
        if (!snapshotCapturedRef.current && completedRep.index >= 1 && cameraStageRef.current) {
          snapshotCapturedRef.current = true;
          captureRef(cameraStageRef, { format: 'jpg', quality: 0.85 })
            .then((uri) => useSessionStore.getState().setCapturedSnapshotUri(uri))
            .catch(() => {
              // Capture can fail (e.g. the OS denies a view snapshot); allow a
              // later rep to try again rather than giving up on the shot.
              snapshotCapturedRef.current = false;
            });
        }
      }
      useSessionStore.getState().applyPose({ depth, tracking, completedRep });
    },
    [exercise],
  );

  /**
   * Stamp the partner's last rep whenever their remote count climbs, so the
   * in-sync window measures *their* activity rather than merely the arrival of
   * a sync packet.
   */
  useEffect(() => {
    if (mode !== 'together') return;
    if (opponentReps > lastPartnerReps.current) {
      partnerLastRepAt.current = Date.now();
    }
    lastPartnerReps.current = opponentReps;
  }, [mode, opponentReps]);

  /**
   * Re-evaluate "in sync" on a timer rather than only on rep events — the glow
   * has to switch *off* when a partner stops, and a stop produces no event.
   */
  useEffect(() => {
    if (mode !== 'together' || phase !== 'active') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInSync(false);
      return;
    }
    const id = setInterval(() => {
      setInSync(isInSync(Date.now(), myLastRepAt.current, partnerLastRepAt.current));
    }, 400);
    return () => clearInterval(id);
  }, [mode, phase]);

  /**
   * Framing drives the calibration ring only, so it is ignored once the set is
   * under way. Storing it in React state means every accepted value re-renders
   * this screen — at 30fps during a duel that competes with the pose model for
   * the JS thread, for a number nothing on screen is reading.
   *
   * Quantising to 2% steps also stops a jittery confidence score from
   * re-rendering the ring on frames where it would not visibly move.
   */
  const handleFraming = useCallback((confidence: number) => {
    if (useSessionStore.getState().phase !== 'calibrating') return;
    setFraming((previous) =>
      Math.abs(confidence - previous) >= 0.02 ? confidence : previous,
    );
  }, []);

  const {
    outputs,
    isActive,
    modelState,
    device,
    canUseCamera,
    posePoints,
    poseVisible,
    poseFrame,
    recorder,
  } = usePoseSession({
    exercise,
    // Video recording disabled pending a VisionCamera v5 fix: the recorder
    // self-terminates ~1s in with a 0-byte file on Android, even with no other
    // outputs bound (confirmed via an isolated record-only probe). Tracked as a
    // known issue; re-enable once the library records correctly.
    record: false,
    isActive: phase !== 'finished',
    counting: phase === 'active',
    onPose: handlePose,
    onFraming: handleFraming,
  });

  const startRecording = recorder.start;
  const stopRecording = recorder.stop;
  const cancelRecording = recorder.cancel;

  // Needs permission, a loaded model AND real camera hardware. The simulator
  // satisfies the first two but has no camera, so this must check all three.
  const cameraReady = hasPermission && canUseCamera;

  /* ---------------------------------------------------------------- *
   * Calibration — advances on real framing confidence, not a timer.
   * ---------------------------------------------------------------- */
  useEffect(() => {
    if (phase !== 'calibrating') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCalibrationStalled(false);
      return;
    }
    const stallTimer = setTimeout(() => setCalibrationStalled(true), 12_000);
    return () => clearTimeout(stallTimer);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'calibrating') return;
    // Blocked camera: the Settings gate owns the screen — freeze calibration so
    // nothing advances toward a countdown behind it.
    if (cameraBlocked) return;
    // Pose model failed: freeze calibration too. Timed ramp used to let a
    // session complete with 0 tracked reps and still award XP — that is gone.
    if (modelState === 'error') return;
    // Without a camera (simulator, no front-facing hardware) the athlete would
    // be stuck forever, so fall back to a timed ramp. This deliberately does
    // NOT cover a *blocked* camera or a missing model: those show a gate instead
    // of handing out reps for a session no pose tracker ever watched.
    if (!cameraReady && !cameraBlocked) {
      const id = setInterval(() => {
        const next = useSessionStore.getState().calibration + 4;
        useSessionStore.getState().setCalibration(next);
        if (next >= 100) {
          clearInterval(id);
          lockHaptic();
          useSessionStore.getState().beginCountdown();
        }
      }, 45);
      return () => clearInterval(id);
    }

    const percent = Math.min(100, Math.round((framing / CALIBRATION_LOCK) * 100));
    useSessionStore.getState().setCalibration(percent);

    if (percent >= 100) {
      lockHaptic();
      const id = setTimeout(() => useSessionStore.getState().beginCountdown(), 550);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [phase, framing, cameraReady, cameraBlocked, modelState]);

  /* ---------------------------------------------------------------- *
   * Countdown
   * ---------------------------------------------------------------- */
  useEffect(() => {
    if (phase !== 'countdown') return;

    const id = setInterval(() => {
      const current = useSessionStore.getState().countdown;
      if (current > 0) playCountSound();
      else playGoSound();
      useSessionStore.getState().tickCountdown();
    }, 650);
    return () => clearInterval(id);
  }, [phase]);

  /* ---------------------------------------------------------------- *
   * Duel clock + opponent
   * ---------------------------------------------------------------- */
  useEffect(() => {
    if (phase !== 'active') return;

    startedAtRef.current = Date.now();
    track('session_started', { exercise, mode });
    if (mode === 'together') {
      track('couple_together_started', { exercise });
    }
    // Filming starts with the set, not with calibration — nobody wants the
    // shuffling-into-position footage in their share card.
    void startRecording();
    speak(
      mode === 'practice'
        ? 'Practice time. Nice and steady.'
        : mode === 'solo'
          ? 'Go! Beat the target.'
          : 'Go! Let us move.',
    );

    // Wall-clock remaining so backgrounding the app can't freeze the timer and
    // unfairly extend a timed duel (setInterval is throttled off-screen).
    const id = setInterval(() => {
      const elapsed = (Date.now() - startedAtRef.current) / 1000;
      const pacer = pacerRef.current;
      if (pacer) useSessionStore.getState().setOpponentReps(pacer.repsAt(elapsed));
      // Live duel: stream our own reps + rolling form up. The opponent's reps
      // arrive through the duel-doc subscription in useLiveDuel, which writes
      // them to the store.
      if (live.active) {
        const s = useSessionStore.getState();
        const form = buildFormReport(definition, s.repRecords).score;
        live.push(s.reps, form);
      }
      const remaining = Math.max(0, Math.ceil(duration - elapsed));
      const state = useSessionStore.getState();
      if (remaining <= 0) {
        if (state.phase === 'active') useSessionStore.getState().finish();
        return;
      }
      if (remaining !== state.timeLeft) {
        useSessionStore.setState({ timeLeft: remaining });
      }
    }, 250);

    return () => clearInterval(id);
    // `startRecording` is intentionally not a dependency: the set starts once.
  }, [phase, mode, duration, startRecording, live, definition, exercise]);

  /* ---------------------------------------------------------------- *
   * Hand off to the result screen
   * ---------------------------------------------------------------- */
  useEffect(() => {
    if (phase !== 'finished') return;
    successHaptic();

    const s0 = useSessionStore.getState();
    track('session_finished', { exercise, mode, reps: s0.reps, won: s0.won });

    // Settle the live duel (if any): stamp our final reps/form on our seat and,
    // once both players are done, resolve the winner. Idempotent in useLiveDuel.
    if (live.active) {
      const s = useSessionStore.getState();
      const form = buildFormReport(definition, s.repRecords).score;
      live.finish(s.reps, form, forfeitedRef.current);
    }

    // Credit the couple: the reps go on this athlete's side of the bond and
    // today is marked, which is what the shared streak is computed from. Only
    // for a real together set — a solo session must not prop up a couple streak
    // the partner had no part in.
    if (mode === 'together' && couple && coupleMe) {
      const s = useSessionStore.getState();
      void recordCoupleSession(couple.id, coupleMe.uid, s.reps, dayKey());
    }

    // Fallback: if no mid-set shot was grabbed (e.g. a very short set with fewer
    // than two reps), try once more before the camera tears down. The live
    // capture during reps is preferred — by this point the camera may already be
    // releasing — but a best-effort frame beats an empty share stage.
    if (!snapshotCapturedRef.current && cameraStageRef.current) {
      snapshotCapturedRef.current = true;
      void captureRef(cameraStageRef, { format: 'jpg', quality: 0.85 })
        .then((uri) => useSessionStore.getState().setCapturedSnapshotUri(uri))
        .catch(() => {});
    }

    // Navigation waits for the clip: leaving this screen tears down the camera
    // session, and an encoder killed mid-flush writes an empty file.
    let cancelled = false;
    void stopRecording().finally(() => {
      if (!cancelled) router.replace('/session/result');
    });
    return () => {
      cancelled = true;
    };
  }, [phase, router, stopRecording, live, definition, mode, couple, coupleMe]);

  // Guarantee an action shot for the share card even on a zero-rep set: a short
  // delay after the set goes live (athlete framed, camera + pose line on screen)
  // grabs one frame. The rep-completion capture above is preferred and latches
  // first when reps happen; this is the safety net so the share stage is never
  // empty when the camera worked.
  useEffect(() => {
    if (phase !== 'active' || snapshotCapturedRef.current) return;
    const t = setTimeout(() => {
      if (snapshotCapturedRef.current || !cameraStageRef.current) return;
      snapshotCapturedRef.current = true;
      captureRef(cameraStageRef, { format: 'jpg', quality: 0.85 })
        .then((uri) => useSessionStore.getState().setCapturedSnapshotUri(uri))
        .catch(() => {
          snapshotCapturedRef.current = false;
        });
    }, 1600);
    return () => clearTimeout(t);
  }, [phase]);

  const giveUp = useCallback(() => {
    stopSpeaking();
    forfeitedRef.current = true;
    // Discard the clip rather than save a set the athlete abandoned.
    void cancelRecording();
    useSessionStore.getState().finish({ forfeited: true });
  }, [cancelRecording]);

  const accent =
    exercise === 'squat' || exercise === 'stretch' ? palette.purple500 : palette.green500;

  // Freemium gate: the core (push/squat, any mode, couple) is free forever — that
  // builds the habit and powers the invite loop. Only a free user reaching for a
  // Pro-only exercise gets the trial paywall (soft, dismissible), and only once
  // billing is set up and the entitlement read has resolved (never flash a Pro).
  const needsUpgrade =
    proReady &&
    isPurchasesConfigured() &&
    shouldPromptUpgrade({ isPro, exercise, isCoupleMode: mode === 'together' });

  if (needsUpgrade) {
    return (
      <Redirect
        href={{ pathname: '/modal/paywall', params: { source: `exercise-${exercise}` } }}
      />
    );
  }

  return (
    <View ref={cameraStageRef} style={styles.root}>
      <CameraStage
        exercise={exercise}
        outputs={outputs}
        device={device}
        isActive={isActive}
        cameraReady={cameraReady}
        height={height}
        cameraRef={cameraRef}
      >
        {/* Brand mark, pinned to the top-right over the live camera. Per the
            iOS HIG it (1) sits inside the safe area at the standard 16pt margin,
            (2) rides on a translucent material capsule rather than a bare shadow
            so it stays legible over any camera content, and (3) yields the top
            band to the score HUD during the active set — branding must never
            obstruct functional content — so it shows only while calibrating and
            counting down. */}
        {phase === 'calibrating' || phase === 'countdown' ? (
          <View pointerEvents="none" style={[styles.logoWrap, { top: insets.top + 8 }]}>
            <View style={styles.logoBadge}>
              <Image
                source={require('../../assets/brand-camera.png')}
                style={styles.logo}
                contentFit="contain"
                accessibilityLabel="RepChamp"
              />
            </View>
          </View>
        ) : null}

        {/* Live skeleton, drawn on the UI thread straight from the shared
            keypoint buffer so it tracks at the camera's frame rate. */}
        {cameraReady ? (
          <PoseOverlay
            pose={posePoints}
            frame={poseFrame}
            color={accent}
            visible={poseVisible}
          />
        ) : null}

        {/* ---------------- Calibrating ---------------- */}
        {phase === 'calibrating' ? (
          <Animated.View entering={FadeIn} style={StyleSheet.absoluteFill}>
            <View style={[styles.topChip, { top: insets.top + 48 }]}>
              <StatusChip
                label={
                  calibration >= 100
                    ? 'Body locked'
                    : calibration > 55
                      ? 'Tracking 17 keypoints…'
                      : 'Detecting body…'
                }
                accent={accent}
                borderColor={
                  calibration >= 100 ? 'rgba(34,197,94,0.6)' : 'rgba(255,255,255,0.2)'
                }
              />
            </View>

            <FramingBrackets accent={accent} />

            <View style={[styles.calibrateFooter, { bottom: insets.bottom + 70 }]}>
              <ProgressRing percent={calibration} color={accent}>
                <RingPercent percent={calibration} />
              </ProgressRing>
              <Text style={styles.calibrateHint}>
                Stand back so your whole body is in frame
              </Text>

              {calibrationStalled ? (
                <PressableScale
                  onPress={() => useSessionStore.getState().beginCountdown()}
                  accessibilityRole="button"
                  accessibilityLabel="Start anyway without full body detection"
                  style={styles.startAnyway}
                >
                  <Text style={styles.startAnywayLabel}>Start anyway</Text>
                </PressableScale>
              ) : null}
            </View>
          </Animated.View>
        ) : null}

        {/* ---------------- Countdown ---------------- */}
        {phase === 'countdown' ? (
          <View style={[StyleSheet.absoluteFill, styles.center]}>
            <Text style={[styles.countdownLabel, { color: accent }]}>
              {definition.hudLabel} · GET READY
            </Text>
            <Animated.Text
              key={countdown}
              entering={ZoomIn.duration(320)}
              style={styles.countdownDigit}
            >
              {countdown > 0 ? countdown : 'GO!'}
            </Animated.Text>
          </View>
        ) : null}

        {/* ---------------- Active ---------------- */}
        {phase === 'active' && mode === 'together' ? (
          <TogetherHud
            exercise={exercise}
            reps={reps}
            partnerReps={opponentReps}
            partnerName={partner?.displayName ?? 'Partner'}
            partnerConnected={opponentReps > 0 || live.active}
            timeLeft={timeLeft}
            tracking={tracking}
            inSync={inSync}
            streak={coupleStreak}
            formCue={formCue}
            onEnd={giveUp}
          />
        ) : null}

        {phase === 'active' && mode !== 'together' ? (
          <DuelHud
            exercise={exercise}
            mode={mode}
            reps={reps}
            opponentReps={opponentReps}
            opponent={opponent}
            target={target}
            timeLeft={timeLeft}
            tracking={tracking}
            depth={depth}
            formCue={formCue}
            onGiveUp={giveUp}
          />
        ) : null}

        {/* Dev-only pipeline diagnostics — proves the model produces a usable
            depth signal from a real body, which unit tests (synthetic poses)
            cannot. Compiled out for athletes via the __DEV__ guard inside. */}
        {phase === 'active' ? (
          <PoseDebugHud
            depth={depth}
            tracking={tracking}
            reps={reps}
            downThreshold={definition.downThreshold}
            upThreshold={definition.upThreshold}
          />
        ) : null}

        {/* First-run coaching overlay — how to position the phone and stand for
            a clean read. Skippable at any moment; sits above every phase. */}
        {showTutorial && !cameraBlocked ? <CameraTutorial onDismiss={dismissTutorial} /> : null}

        {/* Camera blocked — the athlete denied access or the OS restricted it.
            Owns the screen: calibration is frozen behind it, so a session can
            never start without a camera actually watching. */}
        {cameraBlocked ? (
          <CameraDenied
            restricted={permissionStatus === 'restricted'}
            onBack={() => router.back()}
          />
        ) : null}
      </CameraStage>

      {/* Model still warming up — shown over everything so it can't be missed. */}
      {modelState === 'loading' ? (
        <View style={styles.modelBanner}>
          <Text style={styles.modelBannerText}>Warming up the pose model…</Text>
        </View>
      ) : null}

      {modelState === 'error' ? (
        <PressableScale onPress={() => router.back()} style={styles.modelBanner}>
          <Text style={styles.modelBannerText}>
            Pose model unavailable — run `npm run fetch-model`. Tap to go back.
          </Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

/** Corner brackets that show the athlete where to stand. */
function FramingBrackets({ accent }: { accent: string }) {
  const corner = { borderColor: accent };
  return (
    <View pointerEvents="none" style={styles.brackets}>
      <View style={[styles.bracket, styles.bracketTL, corner]} />
      <View style={[styles.bracket, styles.bracketTR, corner]} />
      <View style={[styles.bracket, styles.bracketBL, corner]} />
      <View style={[styles.bracket, styles.bracketBR, corner]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.camGreenBottom },
  center: { alignItems: 'center', justifyContent: 'center' },
  logoWrap: {
    position: 'absolute',
    // Standard HIG layout margin from the safe-area edge.
    right: 16,
    // Right-aligned over the live feed so it never sits behind the centered
    // status chip or countdown digit.
    alignItems: 'flex-end',
    zIndex: 10,
  },
  // Translucent "material" capsule (HIG vibrancy) so the mark stays legible over
  // any camera content without relying on a bare drop shadow.
  logoBadge: {
    backgroundColor: 'rgba(9,14,11,0.28)',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  logo: {
    // The mark is a 3:2 landscape image, so give it a wider box than tall to
    // scale in without squishing.
    width: 72,
    height: 48,
  },
  topChip: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  brackets: {
    position: 'absolute',
    top: 150,
    left: 44,
    right: 44,
    bottom: 210,
  },
  bracket: { position: 'absolute', width: 40, height: 40 },
  bracketTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 14 },
  bracketTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 14 },
  bracketBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 14,
  },
  bracketBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 14,
  },
  calibrateFooter: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  calibrateHint: {
    ...text.caption,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 14,
  },
  startAnyway: {
    marginTop: 18,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  startAnywayLabel: font('extrabold', 14, { color: palette.white }),
  countdownLabel: {
    ...text.badgeSm,
    letterSpacing: 2.6,
    marginBottom: 8,
  },
  countdownDigit: {
    ...font('extrabold', 150, { color: palette.white }),
    lineHeight: 156,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 40,
  },
  modelBanner: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(9,14,11,0.85)',
    padding: 14,
    borderRadius: 16,
  },
  modelBannerText: {
    ...text.caption,
    color: palette.white,
    textAlign: 'center',
  },
});

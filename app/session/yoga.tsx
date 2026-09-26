import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCameraPermission } from 'react-native-vision-camera';

import { PoseFigure } from '@/components/mind/PoseFigure';
import { CameraDenied } from '@/components/session/CameraDenied';
import { CameraStage } from '@/components/session/CameraStage';
import { PoseOverlay } from '@/components/session/PoseOverlay';
import { PressableScale, ProgressBar } from '@/components/ui';
import { canUse } from '@/domain/pro';
import { dayKey } from '@/domain/progression';
import { track } from '@/lib/analytics';
import { lockHaptic, playChimeSound, selectionHaptic, speakCalm, stopSpeaking, successHaptic } from '@/lib/feedback';
import { bestScore } from '@/domain/mindful';
import { tickRitualHabit } from '@/services/ritualTick';
import { useAuthStore } from '@/state/authStore';
import { useCouple } from '@/state/useCouple';
import { useMindfulStore } from '@/state/mindfulStore';
import { useIsPro } from '@/state/proStore';
import { font } from '@/theme/typography';
import { palette } from '@/theme/tokens';
import { GestureDetector, type Gesture } from '@/vision/gestures';
import type { Pose } from '@/vision/keypoints';
import { usePoseSession } from '@/vision/usePoseSession';
import {
  HoldTracker,
  YOGA_FLOWS,
  YOGA_POSES,
  flowScore,
  getFlow,
  holdMilestone,
  readPose,
  stepFigure,
  type StepResult,
} from '@/vision/yoga';

/** Seconds between poses; the first gap is longer, to walk back into frame. */
const REST_SEC = 7;
const FIRST_REST_SEC = 10;
/** A spoken correction at most this often. */
const CUE_EVERY_MS = 7000;

const IN_POSE = palette.green500;
const SEEKING = 'rgba(255,255,255,0.85)';

type Stage = 'intro' | 'rest' | 'pose' | 'done';

interface Live {
  match: number;
  inPose: boolean;
  heldMs: number;
  cue: string | null;
  gesture: number;
}

const IDLE: Live = { match: 0, inPose: false, heldMs: 0, cue: null, gesture: 0 };

/**
 * A camera-coached yoga flow.
 *
 * The same camera → MoveNet pipeline as a rep session, read differently: each
 * pose is scored against its joint-angle targets (`vision/yoga`), the hold only
 * counts while you're actually in it, and the one correction that matters most
 * is shown and spoken. Hands-free throughout: raise a hand to pause, and while
 * paused, one hand resumes and both hands skip.
 */
export default function YogaSession() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isPro = useIsPro();
  const params = useLocalSearchParams<{ flow?: string }>();
  const flow = getFlow(params.flow ?? '') ?? YOGA_FLOWS[0]!;

  const [stage, setStage] = useState<Stage>('intro');
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [restLeft, setRestLeft] = useState(FIRST_REST_SEC);
  const [live, setLive] = useState<Live>(IDLE);
  const [framing, setFraming] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [results, setResults] = useState<StepResult[]>([]);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  /** Previous best for this flow when the summary shows; null = first time. */
  const [record, setRecord] = useState<{ prev: number | null; beat: boolean } | null>(null);
  const couple = useCouple();
  const uid = useAuthStore((st) => st.user?.uid ?? null);

  const step = flow.steps[Math.min(index, flow.steps.length - 1)]!;
  const pose = YOGA_POSES[step.pose];
  const next = flow.steps[index + 1];

  /* Session machinery the camera callback reads between renders. */
  const tracker = useRef(new HoldTracker(step.holdSec * 1000));
  const gestures = useRef(new GestureDetector());
  const stageRef = useRef<Stage>(stage);
  const pausedRef = useRef(paused);
  /** The side the last asymmetric pose was held on, and the side the current step is pinned to. */
  const lastSide = useRef<'left' | 'right' | null>(null);
  const pinnedSide = useRef<'left' | 'right' | undefined>(undefined);
  const lastCue = useRef({ text: '', at: 0 });
  const activeMs = useRef(0);
  const lastLiveAt = useRef(0);
  const handlerRef = useRef<(p: Pose) => void>(() => {});
  const completeRef = useRef<(skipped: boolean) => void>(() => {});
  const skipRef = useRef<() => void>(() => {});
  const restRef = useRef(FIRST_REST_SEC);
  const startRef = useRef<() => void>(() => {});
  /** Which spoken milestones this hold has had. */
  const said = useRef({ half: false, end: false });

  /* Pro guard for a deep link — the hub gates the tap. */
  useEffect(() => {
    if (!canUse(isPro, 'mind-body')) router.replace({ pathname: '/modal/paywall', params: { source: 'mind-body' } });
  }, [isPro, router]);

  const { hasPermission, status: permissionStatus, canRequestPermission, requestPermission } = useCameraPermission();
  useEffect(() => {
    if (!hasPermission && canRequestPermission) void requestPermission();
  }, [hasPermission, canRequestPermission, requestPermission]);
  const cameraBlocked = permissionStatus === 'denied' || permissionStatus === 'restricted';

  /* Backgrounding pauses: the camera stops, and a hold must not bridge the gap. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      setAppActive(s === 'active');
      if (s !== 'active') setPaused((p) => p || stageRef.current === 'pose' || stageRef.current === 'rest');
    });
    return () => sub.remove();
  }, []);

  /* ---------------- The per-frame handler, behind a stable ref ---------------- */


  const showToast = useCallback((text: string) => {
    setToast(text);
    setTimeout(() => setToast((t) => (t === text ? null : t)), 1600);
  }, []);

  const onGesture = useCallback(
    (g: Gesture) => {
      const s = stageRef.current;
      // Hands-free start: set the phone down, walk back, raise a hand.
      if (s === 'intro' && g === 'one-hand') {
        lockHaptic();
        startRef.current();
        return;
      }
      if (s !== 'pose' && s !== 'rest') return;
      if (!pausedRef.current && g === 'one-hand') {
        lockHaptic();
        setPaused(true);
        showToast('✋ Paused');
        speakCalm('Paused. Raise one hand to carry on, or both hands to skip.');
        track('yoga_gesture', { action: 'pause' });
      } else if (pausedRef.current && g === 'one-hand') {
        lockHaptic();
        tracker.current.resume();
        setPaused(false);
        showToast('▶ Carry on');
        track('yoga_gesture', { action: 'resume' });
      } else if (pausedRef.current && g === 'both-hands') {
        lockHaptic();
        showToast('⏭ Skipped');
        track('yoga_gesture', { action: 'skip' });
        skipRef.current();
      }
    },
    [showToast],
  );

  const handlePose = useCallback(
    (body: Pose) => {
      const t = Date.now();
      const s = stageRef.current;
      let suppressed = false;
      let reading: Live | null = null;

      if (s === 'intro') {
        // Only the start gesture is live here; nothing is being held yet.
      } else if (s === 'pose' && !pausedRef.current) {
        const r = readPose(body, pose, pinnedSide.current);
        const upd = tracker.current.push(r.match, t);
        suppressed = upd.match >= 0.5;
        reading = { match: upd.match, inPose: upd.inPose, heldMs: upd.heldMs, cue: r.cue, gesture: 0 };
        if (r.side && upd.inPose) lastSide.current = r.side;

        // Say the correction that matters, but not over and over.
        if (r.cue && !upd.inPose && t - lastCue.current.at > (r.cue === lastCue.current.text ? CUE_EVERY_MS * 2 : CUE_EVERY_MS)) {
          lastCue.current = { text: r.cue, at: t };
          speakCalm(r.cue);
        }
        const milestone = upd.inPose ? holdMilestone(upd.heldMs, tracker.current.targetMs, said.current) : null;
        if (milestone === 'half') {
          said.current.half = true;
          speakCalm('Halfway. Keep breathing.');
        } else if (milestone === 'end') {
          said.current.end = true;
          speakCalm('Three. Two. One.');
        }
        if (upd.done) completeRef.current(false);
      }

      const g = gestures.current.push(body, t, suppressed);
      if (g) onGesture(g);

      // The screen doesn't need every frame; ~8 Hz keeps it calm and cheap.
      if (t - lastLiveAt.current > 120) {
        lastLiveAt.current = t;
        const gesture = gestures.current.progress(t);
        setLive((prev) => (reading ? { ...reading, gesture } : { ...prev, gesture }));
      }
    },
    [pose, onGesture],
  );
  const onRawPose = useCallback((p: Pose) => handlerRef.current(p), []);
  const onPose = useCallback(() => {}, []);
  const onFraming = useCallback((c: number) => setFraming((f) => (Math.abs(f - c) > 0.05 ? c : f)), []);

  const { posePoints, poseVisible, poseFrame, device, canUseCamera, outputs, modelState, cameraFps } = usePoseSession({
    exercise: 'stretch',
    isActive: appActive && stage !== 'done' && hasPermission,
    counting: false,
    onPose,
    onFraming,
    onRawPose,
  });
  const cameraReady = hasPermission && canUseCamera;

  /* ---------------- Steps ---------------- */

  const finish = useCallback(
    (all: StepResult[], completed: boolean) => {
      stopSpeaking();
      const score = flowScore(all);
      const minutes = Math.round(activeMs.current / 60000);
      track('mind_session_finished', { kind: 'yoga', id: flow.id, minutes, score, completed });
      const prev = bestScore(useMindfulStore.getState().entries, flow.id);
      if (minutes >= 1 || completed) {
        useMindfulStore.getState().add({ day: dayKey(), kind: 'yoga', id: flow.id, minutes: Math.max(1, minutes), score });
      }
      if (completed) {
        setRecord({ prev, beat: prev !== null && score > prev });
        // A finished flow is today's Stretch, done.
        tickRitualHabit('stretch', couple.couple?.id, uid);
      }
    },
    [flow.id, couple.couple?.id, uid],
  );

  const complete = useCallback(
    (skipped: boolean) => {
      if (stageRef.current !== 'pose' && !skipped) return;
      const summary = tracker.current.summary();
      const result: StepResult = { pose: step.pose, heldMs: summary.heldMs, targetMs: step.holdSec * 1000, alignment: summary.alignment, skipped };
      const all = [...results, result];
      setResults(all);
      setPaused(false);
      if (!skipped) {
        playChimeSound();
        successHaptic();
      }
      if (index + 1 >= flow.steps.length) {
        setStage('done');
        stageRef.current = 'done';
        speakCalm('Flow complete. Well done.');
        finish(all, true);
        return;
      }
      const upcoming = flow.steps[index + 1]!;
      const nextPose = YOGA_POSES[upcoming.pose];
      tracker.current = new HoldTracker(upcoming.holdSec * 1000);
      said.current = { half: false, end: false };
      // "Other side" is pinned once, from the side just held, so the reading
      // can't flip back as soon as the new side is found.
      pinnedSide.current = upcoming.switchSide && lastSide.current ? (lastSide.current === 'left' ? 'right' : 'left') : undefined;
      if (!upcoming.switchSide) lastSide.current = null;
      gestures.current.reset();
      setIndex(index + 1);
      setLive(IDLE);
      setRestLeft(REST_SEC);
      restRef.current = REST_SEC;
      setStage('rest');
      stageRef.current = 'rest';
      speakCalm(upcoming.switchSide ? `${nextPose.name}, other side.` : `Next, ${nextPose.name}. ${nextPose.setup}`);
    },
    [results, step, index, flow.steps, finish],
  );

  /* The frame handler runs outside React (~10 Hz from the camera), so it reads
     the latest render through refs, refreshed after every commit. */
  useEffect(() => {
    stageRef.current = stage;
    pausedRef.current = paused;
    handlerRef.current = handlePose;
    completeRef.current = complete;
    skipRef.current = () => complete(true);
    startRef.current = start;
  });

  /* Rest countdown, and the running clock for the log. Frozen while paused. */
  useEffect(() => {
    if (paused || (stage !== 'rest' && stage !== 'pose')) return;
    let last = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      activeMs.current += now - last;
      last = now;
      if (stageRef.current !== 'rest') return;
      const left = restRef.current - 1;
      restRef.current = left;
      setRestLeft(Math.max(0, left));
      if (left <= 0) {
        tracker.current.resume();
        stageRef.current = 'pose';
        setStage('pose');
        selectionHaptic();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [paused, stage]);

  function start() {
    if (stageRef.current !== 'intro') return;
    stageRef.current = 'rest';
    track('mind_session_started', { kind: 'yoga', id: flow.id });
    tracker.current = new HoldTracker(flow.steps[0]!.holdSec * 1000);
    said.current = { half: false, end: false };
    pinnedSide.current = undefined;
    lastSide.current = null;
    setIndex(0);
    setResults([]);
    setRestLeft(FIRST_REST_SEC);
    restRef.current = FIRST_REST_SEC;
    setStage('rest');
    speakCalm(`Step back so your whole body is in view. First, ${YOGA_POSES[flow.steps[0]!.pose].name}. ${YOGA_POSES[flow.steps[0]!.pose].setup}`);
  }

  const leave = () => {
    if (stage === 'rest' || stage === 'pose') {
      const summary = tracker.current.summary();
      const partial = stage === 'pose' && summary.heldMs > 0
        ? [...results, { pose: step.pose, heldMs: summary.heldMs, targetMs: step.holdSec * 1000, alignment: summary.alignment, skipped: false }]
        : results;
      finish(partial, false);
    }
    stopSpeaking();
    router.back();
  };

  useEffect(() => () => stopSpeaking(), []);

  const accent = live.inPose ? IN_POSE : SEEKING;
  const holdPct = (live.heldMs / (step.holdSec * 1000)) * 100;
  const score = useMemo(() => flowScore(results), [results]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <CameraStage
        exercise="stretch"
        outputs={outputs}
        device={device}
        isActive={appActive && stage !== 'done' && hasPermission}
        cameraReady={cameraReady}
        height={0}
        fps={cameraFps}
      >
        {cameraReady && stage !== 'done' ? <PoseOverlay pose={posePoints} frame={poseFrame} color={accent} visible={poseVisible} /> : null}

        {/* ---------------- Intro ---------------- */}
        {stage === 'intro' ? (
          <Animated.View entering={FadeIn} style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <Text style={styles.sheetTitle}>{flow.title}</Text>
            <Text style={styles.sheetBody}>Prop your phone up at hip height and step back 2–3 m so your whole body is in view.</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.poseStrip}>
              {flow.steps.map((s, i) => (
                <View key={i} style={styles.poseChip}>
                  <PoseFigure figure={stepFigure(s)} size={40} color={palette.white} strokeWidth={6} />
                  <Text style={styles.poseChipText} numberOfLines={1}>
                    {YOGA_POSES[s.pose].name}
                  </Text>
                </View>
              ))}
            </ScrollView>
            <View style={styles.gestureCard}>
              <Text style={styles.gestureTitle}>✋ Hands-free</Text>
              <Text style={styles.gestureBody}>Step back and raise one hand to begin. During the flow, hold one hand up to pause; then one hand carries on, both hands skip the pose.</Text>
            </View>
            <Text style={styles.framing}>{framing >= 0.6 ? '✓ I can see you — raise one hand to begin' : cameraReady ? 'Step back until I can see all of you' : modelState === 'loading' ? 'Warming up the camera coach…' : ' '}</Text>
            <PressableScale onPress={start} accessibilityRole="button" style={styles.startBtn}>
              <Text style={styles.startText}>Start flow</Text>
            </PressableScale>
          </Animated.View>
        ) : null}

        {/* ---------------- Rest between poses ---------------- */}
        {stage === 'rest' ? (
          <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.center}>
            <Text style={styles.nextLabel}>{step.switchSide ? 'Other side' : index === 0 ? 'First' : 'Next'}</Text>
            <View style={styles.figureBig}>
              <PoseFigure figure={stepFigure(step)} size={150} color={palette.white} strokeWidth={5} />
            </View>
            <Text style={styles.poseName}>{pose.name}</Text>
            <Text style={styles.sanskrit}>{pose.sanskrit}</Text>
            <Text style={styles.setup}>{pose.setup}</Text>
            <Text style={styles.countdown}>{restLeft}</Text>
          </Animated.View>
        ) : null}

        {/* ---------------- Holding ---------------- */}
        {stage === 'pose' ? (
          <>
            <View style={[styles.refFigure, { top: insets.top + 60 }]}>
              <PoseFigure figure={stepFigure(step)} size={84} color={live.inPose ? IN_POSE : palette.white} strokeWidth={6} />
            </View>
            <Animated.View entering={FadeInDown} style={[styles.panel, { paddingBottom: insets.bottom + 16 }]}>
              <View style={styles.panelHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.panelPose}>{pose.name}</Text>
                  <Text style={styles.panelSub}>{`${pose.view === 'side' ? 'Side-on' : 'Facing the camera'}${step.switchSide ? ' · other side' : ''}`}</Text>
                </View>
                <View style={[styles.matchBadge, live.inPose && styles.matchBadgeOn]}>
                  <Text style={styles.matchText}>{`${Math.round(live.match * 100)}%`}</Text>
                </View>
              </View>
              <ProgressBar percent={holdPct} height={10} trackColor="rgba(255,255,255,0.18)" fillColor={IN_POSE} />
              <View style={styles.panelRow}>
                <Text style={styles.holdText}>{live.inPose ? `Hold · ${Math.ceil((step.holdSec * 1000 - live.heldMs) / 1000)}s` : 'Find the pose'}</Text>
                <Text style={styles.nextText} numberOfLines={1}>
                  {next ? `Next: ${YOGA_POSES[next.pose].name}` : 'Last pose'}
                </Text>
              </View>
              <Text style={styles.cue} numberOfLines={2}>
                {live.inPose ? (live.cue ?? 'Beautiful. Breathe slowly and hold.') : (live.cue ?? 'Match the shape in the corner.')}
              </Text>
              <View style={styles.controls}>
                <PressableScale onPress={() => setPaused(true)} accessibilityRole="button" style={styles.ctrl}>
                  <Text style={styles.ctrlText}>Pause</Text>
                </PressableScale>
                <PressableScale onPress={() => complete(true)} accessibilityRole="button" style={styles.ctrl}>
                  <Text style={styles.ctrlText}>Skip</Text>
                </PressableScale>
              </View>
            </Animated.View>
          </>
        ) : null}

        {/* ---------------- Gesture fill-up ---------------- */}
        {live.gesture > 0.15 && (stage === 'pose' || stage === 'rest') ? (
          <View style={[styles.gestureMeter, { top: insets.top + 60 }]}>
            <Text style={styles.gestureHand}>✋</Text>
            <View style={styles.gestureTrack}>
              <View style={[styles.gestureFill, { width: `${Math.round(live.gesture * 100)}%` }]} />
            </View>
          </View>
        ) : null}

        {/* ---------------- Paused ---------------- */}
        {paused && (stage === 'pose' || stage === 'rest') ? (
          <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.pausedScrim}>
            <Text style={styles.pausedTitle}>Paused</Text>
            <Text style={styles.pausedBody}>✋ One hand up to carry on{'\n'}🙌 Both hands up to skip this pose</Text>
            <View style={styles.controls}>
              <PressableScale
                onPress={() => {
                  tracker.current.resume();
                  setPaused(false);
                }}
                accessibilityRole="button"
                style={[styles.ctrl, styles.ctrlSolid]}
              >
                <Text style={[styles.ctrlText, { color: '#1E1B4B' }]}>Resume</Text>
              </PressableScale>
              <PressableScale onPress={() => complete(true)} accessibilityRole="button" style={styles.ctrl}>
                <Text style={styles.ctrlText}>Skip pose</Text>
              </PressableScale>
            </View>
          </Animated.View>
        ) : null}

        {toast ? (
          <Animated.View entering={FadeIn} exiting={FadeOut} style={[styles.toast, { top: insets.top + 110 }]}>
            <Text style={styles.toastText}>{toast}</Text>
          </Animated.View>
        ) : null}

        {/* ---------------- Top bar — last, so no overlay dims it ---------------- */}
        <View style={[styles.topBar, { top: insets.top + 8 }]}>
          <PressableScale onPress={leave} accessibilityRole="button" accessibilityLabel="End session" style={styles.close}>
            <Text style={styles.closeText}>×</Text>
          </PressableScale>
          {stage === 'rest' || stage === 'pose' ? (
            <View style={styles.stepPill}>
              <Text style={styles.stepText}>{`${index + 1} / ${flow.steps.length}`}</Text>
            </View>
          ) : null}
          <View style={{ width: 40 }} />
        </View>

        {cameraBlocked ? <CameraDenied restricted={permissionStatus === 'restricted'} onBack={leave} /> : null}
      </CameraStage>

      {/* ---------------- Summary ---------------- */}
      {stage === 'done' ? (
        <Animated.View entering={FadeIn} style={[styles.summary, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20 }]}>
          <Text style={styles.summaryEyebrow}>Flow complete</Text>
          {record ? (
            <View style={[styles.recordPill, record.beat && styles.recordPillBest]}>
              <Text style={styles.recordText}>
                {record.prev === null ? 'First score on this flow' : record.beat ? `New best · was ${record.prev}` : `Best so far: ${record.prev}`}
              </Text>
            </View>
          ) : null}
          <Text style={styles.summaryTitle}>{flow.title}</Text>
          <View style={styles.scoreRing}>
            <Text style={styles.scoreNum}>{score}</Text>
            <Text style={styles.scoreLabel}>alignment</Text>
          </View>
          <ScrollView style={{ alignSelf: 'stretch' }} contentContainerStyle={{ gap: 8 }}>
            {results.map((r, i) => (
              <View key={i} style={styles.resultRow}>
                <PoseFigure figure={YOGA_POSES[r.pose].figure} size={34} color={palette.white} strokeWidth={7} />
                <Text style={styles.resultName} numberOfLines={1}>
                  {YOGA_POSES[r.pose].name}
                </Text>
                <Text style={styles.resultMeta}>{r.skipped && r.heldMs === 0 ? 'skipped' : `${Math.round(r.heldMs / 1000)}s · ${Math.round(r.alignment * 100)}%`}</Text>
              </View>
            ))}
          </ScrollView>
          <PressableScale onPress={() => router.back()} accessibilityRole="button" style={[styles.startBtn, { alignSelf: 'stretch' }]}>
            <Text style={styles.startText}>Done</Text>
          </PressableScale>
        </Animated.View>
      ) : null}

      {modelState === 'error' ? (
        <PressableScale onPress={leave} accessibilityRole="button" style={styles.modelBanner}>
          <Text style={styles.modelBannerText}>The camera coach couldn’t start on this device. Tap to go back.</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

const glass = 'rgba(12,10,28,0.72)';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#070509' },
  topBar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: glass, alignItems: 'center', justifyContent: 'center' },
  closeText: font('semibold', 24, { color: palette.white }),
  stepPill: { paddingHorizontal: 14, height: 32, borderRadius: 16, backgroundColor: glass, justifyContent: 'center' },
  stepText: font('bold', 13, { color: palette.white }),

  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: glass, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20 },
  sheetTitle: font('extrabold', 24, { color: palette.white }),
  sheetBody: { marginTop: 6, ...font('regular', 14, { color: 'rgba(255,255,255,0.75)' }), lineHeight: 20 },
  poseStrip: { gap: 10, paddingVertical: 14 },
  poseChip: { width: 76, alignItems: 'center', gap: 4, paddingVertical: 8, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)' },
  poseChipText: font('medium', 11, { color: 'rgba(255,255,255,0.85)' }),
  gestureCard: { borderRadius: 16, padding: 14, backgroundColor: 'rgba(167,139,250,0.18)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.4)' },
  gestureTitle: font('bold', 15, { color: palette.white }),
  gestureBody: { marginTop: 4, ...font('regular', 13, { color: 'rgba(255,255,255,0.8)' }), lineHeight: 18 },
  framing: { marginTop: 12, textAlign: 'center', ...font('semibold', 13, { color: 'rgba(255,255,255,0.85)' }) },
  startBtn: { marginTop: 12, height: 54, borderRadius: 27, backgroundColor: palette.white, alignItems: 'center', justifyContent: 'center' },
  startText: font('extrabold', 17, { color: '#1E1B4B' }),

  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(7,5,9,0.55)', paddingHorizontal: 32 },
  nextLabel: font('bold', 13, { color: 'rgba(255,255,255,0.7)', letterSpacing: 1.2, textTransform: 'uppercase' }),
  figureBig: { marginTop: 12 },
  poseName: { marginTop: 8, ...font('extrabold', 30, { color: palette.white }) },
  sanskrit: { marginTop: 2, ...font('medium', 14, { color: 'rgba(255,255,255,0.6)' }) },
  setup: { marginTop: 12, textAlign: 'center', ...font('regular', 15, { color: 'rgba(255,255,255,0.85)' }), lineHeight: 21 },
  countdown: { marginTop: 20, ...font('extrabold', 44, { color: palette.white }) },

  refFigure: { position: 'absolute', right: 16, width: 100, height: 100, borderRadius: 20, backgroundColor: glass, alignItems: 'center', justifyContent: 'center' },
  panel: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: glass, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 18, gap: 10 },
  panelHead: { flexDirection: 'row', alignItems: 'center' },
  panelPose: font('extrabold', 22, { color: palette.white }),
  panelSub: { marginTop: 2, ...font('medium', 13, { color: 'rgba(255,255,255,0.65)' }) },
  matchBadge: { minWidth: 64, height: 40, paddingHorizontal: 10, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  matchBadgeOn: { backgroundColor: palette.green600 },
  matchText: font('extrabold', 17, { color: palette.white }),
  panelRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  holdText: font('bold', 14, { color: palette.white }),
  nextText: { flexShrink: 1, ...font('medium', 13, { color: 'rgba(255,255,255,0.6)' }) },
  cue: { minHeight: 44, ...font('semibold', 16, { color: palette.white }), lineHeight: 22 },
  controls: { flexDirection: 'row', gap: 10 },
  ctrl: { flex: 1, height: 46, borderRadius: 23, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', alignItems: 'center', justifyContent: 'center' },
  ctrlSolid: { backgroundColor: palette.white, borderColor: palette.white },
  ctrlText: font('semibold', 15, { color: palette.white }),

  gestureMeter: { position: 'absolute', left: 16, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, height: 40, borderRadius: 20, backgroundColor: glass },
  gestureHand: { fontSize: 18 },
  gestureTrack: { width: 70, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' },
  gestureFill: { height: 6, borderRadius: 3, backgroundColor: palette.white },

  pausedScrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(7,5,9,0.72)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 },
  pausedTitle: font('extrabold', 32, { color: palette.white }),
  pausedBody: { textAlign: 'center', ...font('medium', 16, { color: 'rgba(255,255,255,0.85)' }), lineHeight: 26 },

  toast: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 18, height: 40, borderRadius: 20, backgroundColor: palette.white, justifyContent: 'center' },
  toastText: font('bold', 15, { color: '#1E1B4B' }),

  summary: { ...StyleSheet.absoluteFill, backgroundColor: '#140F26', alignItems: 'center', paddingHorizontal: 20, gap: 14 },
  summaryEyebrow: font('bold', 13, { color: 'rgba(255,255,255,0.65)', letterSpacing: 1.2, textTransform: 'uppercase' }),
  summaryTitle: font('extrabold', 26, { color: palette.white }),
  recordPill: { paddingHorizontal: 14, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center' },
  recordPillBest: { backgroundColor: palette.amber500 },
  recordText: font('bold', 13, { color: palette.white }),
  scoreRing: { width: 140, height: 140, borderRadius: 70, borderWidth: 8, borderColor: palette.purple500, alignItems: 'center', justifyContent: 'center' },
  scoreNum: font('extrabold', 44, { color: palette.white }),
  scoreLabel: font('medium', 13, { color: 'rgba(255,255,255,0.7)' }),
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)' },
  resultName: { flex: 1, ...font('semibold', 15, { color: palette.white }) },
  resultMeta: font('medium', 13, { color: 'rgba(255,255,255,0.7)' }),

  modelBanner: { position: 'absolute', left: 16, right: 16, top: 120, padding: 16, borderRadius: 16, backgroundColor: palette.ink },
  modelBannerText: { textAlign: 'center', ...font('semibold', 14, { color: palette.white }) },
});

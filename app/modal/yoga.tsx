import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';

import { YogaGlyph } from '@/components/YogaGlyph';
import { ProgressRing } from '@/components/home/ProgressRing';
import { CheckIcon } from '@/components/home/Icons';
import { PressableScale } from '@/components/ui';
import {
  POSES,
  YOGA_HABIT,
  earnsTick,
  flowMinutes,
  flowSeconds,
  poseAt,
  stepLabel,
  stepStart,
  yogaFlow,
} from '@/domain/mindful';
import { dayKey } from '@/domain/progression';
import { track } from '@/lib/analytics';
import { playChimeSound, selectionHaptic, speak, stopSpeaking, successHaptic } from '@/lib/feedback';
import { syncRitualNow } from '@/services/ritualSync';
import { useAuthStore } from '@/state/authStore';
import { useRitualStore } from '@/state/ritualStore';
import { useMindfulStore } from '@/state/mindfulStore';
import { useCouple } from '@/state/useCouple';
import { font } from '@/theme/typography';
import { palette, radius, surfaceShadow } from '@/theme/tokens';

/**
 * A guided yoga flow: one pose at a time, held against a ring that closes as
 * the time runs out, with the next pose named below so nothing is a surprise.
 *
 * There is no camera here — nothing to count in a downward dog — so the app's
 * job is the clock and the cue. Each new pose is spoken (through the voice-coach
 * setting, so a muted coach stays muted) and felt as a haptic tick, which lets
 * the athlete keep their eyes off the phone. Finishing the whole flow ticks the
 * Stretch habit; stopping early leaves it alone.
 */
export default function YogaScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ flow?: string }>();
  /* A guided session is minutes of not touching the phone — exactly when it
     would otherwise dim and lock mid-pose. */
  useKeepAwake();
  const flow = yogaFlow(params.flow);
  const total = flowSeconds(flow);
  const couple = useCouple();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const toggle = useRitualStore((s) => s.toggle);

  /* A pausable clock: seconds banked before the current run, plus the run. */
  const [running, setRunning] = useState(true);
  const banked = useRef(0);
  const runStart = useRef(0);
  const [elapsed, setElapsed] = useState(0);
  /* Wall-clock seconds actually spent running, which skip does not add to —
     what the habit tick is judged on. */
  const held = useRef(0);
  const [earned, setEarned] = useState(false);

  const now = useCallback(
    () => banked.current + (running ? (Date.now() - runStart.current) / 1000 : 0),
    [running],
  );

  useEffect(() => {
    runStart.current = Date.now();
    track('mindful_started', { kind: 'yoga', id: flow.id });
    return () => stopSpeaking();
  }, [flow.id]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setElapsed(now()), 250);
    return () => clearInterval(id);
  }, [running, now]);

  const at = poseAt(flow, elapsed);
  const step = flow.steps[at.index]!;
  const next = flow.steps[at.index + 1];
  const done = at.done;

  /* Announce each pose as it arrives, including the first. */
  const announced = useRef(-1);
  useEffect(() => {
    if (done || announced.current === at.index) return;
    announced.current = at.index;
    if (at.index > 0) selectionHaptic();
    speak(stepLabel(step));
  }, [at.index, done, step]);

  /* Finishing ticks Stretch — once, and only if it isn't already ticked. */
  const finished = useRef(false);
  useEffect(() => {
    if (!done || finished.current) return;
    finished.current = true;
    if (running) held.current += (Date.now() - runStart.current) / 1000;
    setRunning(false);
    playChimeSound();
    successHaptic();
    speak('Flow complete. Well done.');
    track('mindful_done', { kind: 'yoga', id: flow.id });
    if (!earnsTick(held.current, total)) return;
    setEarned(true);
    const today = dayKey();
    useMindfulStore.getState().record({ day: today, kind: 'yoga', id: flow.id, seconds: Math.round(held.current) }, today);
    const state = useRitualStore.getState();
    const ticked = state.day === today && state.ticks.includes(YOGA_HABIT);
    const ticks = ticked ? state.ticks : toggle(today, YOGA_HABIT);
    void syncRitualNow(couple.couple?.id, uid, ticks);
    // `running` is read once, at the moment the flow ends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, flow.id, total, toggle, couple.couple?.id, uid]);

  const seek = (to: number) => {
    if (running) held.current += (Date.now() - runStart.current) / 1000;
    banked.current = Math.max(0, Math.min(total, to));
    runStart.current = Date.now();
    setElapsed(banked.current);
  };

  const togglePause = () => {
    if (running) {
      banked.current = now();
      held.current += (Date.now() - runStart.current) / 1000;
      setRunning(false);
    } else {
      runStart.current = Date.now();
      setRunning(true);
    }
  };

  /* Leaving the app pauses the flow: time on another screen is not time in
     the pose, and must not count towards the Stretch tick. Coming back stays
     paused so the athlete can get back on the mat before pressing play. */
  useEffect(() => {
    if (!running) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' || finished.current) return;
      banked.current = now();
      held.current += (Date.now() - runStart.current) / 1000;
      setRunning(false);
      stopSpeaking();
    });
    return () => sub.remove();
  }, [running, now]);

  /* Back restarts the pose you're in; a second tap in its first moments goes
     to the one before, the way a music player's back button behaves. */
  const back = () => {
    const into = elapsed - stepStart(flow, at.index);
    seek(stepStart(flow, into > 3 ? at.index : at.index - 1));
  };
  const skip = () => seek(stepStart(flow, at.index + 1));

  const stepPct = done ? 100 : Math.round(((step.seconds - at.left) / step.seconds) * 100);
  const mm = Math.floor(at.left / 60);
  const ss = String(at.left % 60).padStart(2, '0');

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[`${flow.accent}22`, `${flow.accent}08`, palette.canvas]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safe}>
        <View style={styles.top}>
          <PressableScale
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={done ? 'Close' : 'Stop the flow'}
            style={styles.close}
          >
            <Svg width={16} height={16} viewBox="0 0 24 24">
              <Path d="M6 6l12 12M18 6L6 18" stroke={palette.ink} strokeWidth={2.4} strokeLinecap="round" />
            </Svg>
          </PressableScale>
          <View style={{ flex: 1 }}>
            <Text style={styles.flowTitle} numberOfLines={1}>
              {flow.title}
            </Text>
            <Text style={styles.flowMeta}>
              {done ? `${flowMinutes(flow)} min · complete` : `Pose ${at.index + 1} of ${flow.steps.length}`}
            </Text>
          </View>
        </View>

        {/* One segment per pose: filled behind, filling now, empty ahead. */}
        <View style={styles.segments}>
          {flow.steps.map((s, i) => (
            <View key={i} style={[styles.segment, { flex: s.seconds }]}>
              <View
                style={[
                  styles.segmentFill,
                  {
                    backgroundColor: flow.accent,
                    width: done || i < at.index ? '100%' : i === at.index ? `${stepPct}%` : '0%',
                  },
                ]}
              />
            </View>
          ))}
        </View>

        {done ? (
          <View style={styles.stage}>
            <View style={[styles.doneBadge, { backgroundColor: flow.accent }]}>
              <CheckIcon size={40} color={palette.white} strokeWidth={3} />
            </View>
            <Text style={styles.poseName}>Flow complete</Text>
            <Text style={styles.cue}>
              {earned
                ? `${flowMinutes(flow)} minutes, ${flow.steps.length} poses. Stretch is ticked for today.`
                : 'You skipped through most of it — hold the poses to tick Stretch.'}
            </Text>
          </View>
        ) : (
          <View style={styles.stage}>
            <ProgressRing
              percent={Math.max(1, stepPct)}
              size={250}
              thickness={10}
              from={flow.accent}
              to={flow.accent}
              track={`${flow.accent}1F`}
            >
              <View style={styles.glyphDisc}>
                <YogaGlyph pose={step.pose} size={150} color={flow.accent} />
              </View>
            </ProgressRing>
            <Text style={styles.time} accessibilityLabel={`${at.left} seconds left`}>
              {mm}:{ss}
            </Text>
            <Text style={styles.poseName}>{POSES[step.pose].name}</Text>
            {step.side ? (
              <Text style={[styles.side, { color: flow.accent }]}>
                {step.side === 'right' ? 'Right side' : 'Left side'}
              </Text>
            ) : null}
            <Text style={styles.cue}>{POSES[step.pose].cue}</Text>
          </View>
        )}

        {done ? (
          <PressableScale
            onPress={() => router.back()}
            accessibilityRole="button"
            style={[styles.doneButton, { backgroundColor: flow.accent }]}
          >
            <Text style={font('extrabold', 16, { color: palette.white })}>Done</Text>
          </PressableScale>
        ) : (
          <>
            <View style={styles.nextRow}>
              {next ? (
                <>
                  <View style={styles.nextGlyph}>
                    <YogaGlyph pose={next.pose} size={28} color={palette.grey600} />
                  </View>
                  <Text style={styles.nextText} numberOfLines={1}>
                    Up next · {stepLabel(next)}
                  </Text>
                </>
              ) : (
                <Text style={styles.nextText}>Last pose — nearly there</Text>
              )}
            </View>

            <View style={styles.controls}>
              <PressableScale onPress={back} accessibilityRole="button" accessibilityLabel="Previous pose" style={styles.sideButton}>
                <SkipGlyph flip />
              </PressableScale>
              <PressableScale
                onPress={togglePause}
                accessibilityRole="button"
                accessibilityLabel={running ? 'Pause' : 'Resume'}
                style={[styles.playButton, { backgroundColor: flow.accent, shadowColor: flow.accent }]}
              >
                <Svg width={26} height={26} viewBox="0 0 24 24">
                  {running ? (
                    <>
                      <Rect x={6} y={5} width={4} height={14} rx={1.5} fill={palette.white} />
                      <Rect x={14} y={5} width={4} height={14} rx={1.5} fill={palette.white} />
                    </>
                  ) : (
                    <Path d="M8 5.5v13l11-6.5z" fill={palette.white} />
                  )}
                </Svg>
              </PressableScale>
              <PressableScale onPress={skip} accessibilityRole="button" accessibilityLabel="Next pose" style={styles.sideButton}>
                <SkipGlyph />
              </PressableScale>
            </View>
          </>
        )}
      </SafeAreaView>
    </View>
  );
}

function SkipGlyph({ flip = false }: { flip?: boolean }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" style={flip ? { transform: [{ scaleX: -1 }] } : undefined}>
      <Path d="M6 5.5v13l9-6.5z" fill={palette.ink} />
      <Rect x={16} y={5.5} width={2.6} height={13} rx={1.2} fill={palette.ink} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.canvas },
  safe: { flex: 1, paddingHorizontal: 20 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...surfaceShadow,
  },
  flowTitle: { ...font('extrabold', 18, { color: palette.ink }), letterSpacing: -0.4 },
  flowMeta: font('semibold', 12.5, { color: palette.grey600 }),
  segments: { flexDirection: 'row', gap: 3, marginTop: 16 },
  segment: { height: 4, borderRadius: 2, backgroundColor: 'rgba(15,31,23,0.08)', overflow: 'hidden' },
  segmentFill: { height: '100%', borderRadius: 2 },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  glyphDisc: {
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...surfaceShadow,
  },
  time: {
    ...font('extrabold', 40, { color: palette.ink }),
    fontVariant: ['tabular-nums'],
    letterSpacing: -1.2,
    marginTop: 18,
  },
  poseName: { ...font('extrabold', 24, { color: palette.ink }), letterSpacing: -0.6, marginTop: 4 },
  side: { ...font('bold', 13), marginTop: 2 },
  cue: {
    ...font('medium', 15, { color: palette.grey600 }),
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 8,
    paddingHorizontal: 12,
  },
  nextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: palette.white,
    ...surfaceShadow,
  },
  nextGlyph: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  nextText: font('semibold', 13.5, { color: palette.grey600 }),
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    marginTop: 20,
    marginBottom: 24,
  },
  sideButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...surfaceShadow,
  },
  playButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  doneBadge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  doneButton: {
    height: 54,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
});

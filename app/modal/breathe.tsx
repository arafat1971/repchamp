import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { PressableScale } from '@/components/ui';
import { dayKey } from '@/domain/progression';
import { guideFor, type HabitId } from '@/domain/ritual';
import { PHASE_WORD, breathPhaseAt, breathResumeAt, meditation, type BreathPattern, type BreathPhase } from '@/domain/mindful';
import { track } from '@/lib/analytics';
import { playChimeSound, successHaptic } from '@/lib/feedback';
import { syncRitualNow } from '@/services/ritualSync';
import { useAuthStore } from '@/state/authStore';
import { useRitualStore } from '@/state/ritualStore';
import { useMindfulStore } from '@/state/mindfulStore';
import { useCouple } from '@/state/useCouple';
import { font } from '@/theme/typography';

/** The ritual guides' rhythm: four in, six out. */
const RITUAL_PATTERN: BreathPattern = { in: 4, hold: 0, out: 6, rest: 0 };

/**
 * A few quiet minutes: a circle that grows as you breathe in and settles as
 * you breathe out, a countdown, and nothing else on the screen. Finishing it
 * ticks the habit it was opened for — the tick is earned by doing it, not by
 * remembering to press a box.
 */
export default function BreatheScreen() {
  const router = useRouter();
  /* A guided session is minutes of not touching the phone — exactly when it
     would otherwise dim and lock mid-pose. */
  useKeepAwake();
  /* Opened either for a ritual habit (`habit`) or as a meditation from Train
     (`session`), which brings its own rhythm and may tick nothing at all. */
  const params = useLocalSearchParams<{ habit?: string; session?: string }>();
  const session = meditation(params.session);
  const ritual = guideFor((params.habit as HabitId) ?? 'breathe');
  const guide = session
    ? { habit: session.habit, minutes: session.minutes, title: session.title, line: session.line }
    : ritual;
  const pattern = session?.pattern ?? RITUAL_PATTERN;
  const reduced = useReducedMotion();
  const couple = useCouple();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const toggle = useRitualStore((s) => s.toggle);

  const total = guide.minutes * 60;
  const [left, setLeft] = useState(total);
  const [phase, setPhase] = useState<BreathPhase>('in');
  const [done, setDone] = useState(false);
  const finished = useRef(false);

  /* The clock only runs while the app is in front: minutes spent elsewhere
     are not minutes breathing, and must not finish the session. */
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => sub.remove();
  }, []);
  /* Milliseconds breathed before the current stretch in front. */
  const banked = useRef(0);

  const scale = useSharedValue(0.55);
  useEffect(() => {
    if (reduced || done || !active) return;
    /* Every run starts on a fresh in-breath — see `breathResumeAt`. */
    scale.set(0.55);
    /* Holds are the circle staying put: a timing to the value it is already at. */
    const ease = { easing: Easing.inOut(Easing.sin) };
    scale.set(
      withRepeat(
        withSequence(
          withTiming(1, { duration: pattern.in * 1000, ...ease }),
          withTiming(1, { duration: pattern.hold * 1000 }),
          withTiming(0.55, { duration: pattern.out * 1000, ...ease }),
          withTiming(0.55, { duration: pattern.rest * 1000 }),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(scale);
  }, [reduced, done, active, scale, pattern]);

  useEffect(() => {
    if (session) track('mindful_started', { kind: 'meditation', id: session.id });
  }, [session]);

  /* One clock for the words and the countdown. */
  useEffect(() => {
    if (done || !active) return;
    const started = Date.now();
    const base = breathResumeAt(pattern, banked.current);
    const tick = () => {
      const elapsed = base + Date.now() - started;
      banked.current = elapsed;
      setPhase(breathPhaseAt(pattern, elapsed).phase);
      const remaining = Math.max(0, total - Math.floor(elapsed / 1000));
      setLeft(remaining);
      if (remaining === 0) setDone(true);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [done, active, total, pattern]);

  /* Finishing ticks the habit — once, and only if it isn't already ticked. */
  useEffect(() => {
    if (!done || finished.current) return;
    finished.current = true;
    playChimeSound();
    successHaptic();
    if (session) {
      track('mindful_done', { kind: 'meditation', id: session.id });
      const today = dayKey();
      useMindfulStore.getState().record({ day: today, kind: 'meditation', id: session.id, seconds: total }, today);
    } else track('ritual_guide_done', { habit: ritual.habit });
    /* The one-minute reset ticks nothing — see `Meditation.habit`. */
    if (!guide.habit) return;
    const habit = guide.habit;
    const today = dayKey();
    const state = useRitualStore.getState();
    const ticked = state.day === today && state.ticks.includes(habit);
    const ticks = ticked ? state.ticks : toggle(today, habit);
    void syncRitualNow(couple.couple?.id, uid, ticks);
  }, [done, guide.habit, session, ritual.habit, total, toggle, couple.couple?.id, uid]);

  const circle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient colors={['#0B1026', '#1E1B4B', '#3B2A6B']} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe}>
        <Text style={styles.title}>{guide.title}</Text>
        <Text style={styles.sub}>{done ? (guide.habit ? 'Done. Ticked for today.' : 'Done. Carry that with you.') : guide.line}</Text>

        <View style={styles.stage}>
          <Animated.View style={[styles.circle, circle]} />
          <View style={styles.core}>
            <Text style={styles.word}>{done ? 'Well done' : PHASE_WORD[phase]}</Text>
            {!done ? (
              <Text style={styles.time}>
                {mm}:{ss}
              </Text>
            ) : null}
          </View>
        </View>

        <PressableScale onPress={() => router.back()} accessibilityRole="button" style={styles.button}>
          <Text style={styles.buttonText}>{done ? 'Close' : 'Stop'}</Text>
        </PressableScale>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B1026' },
  safe: { flex: 1, alignItems: 'center', paddingHorizontal: 24 },
  title: { marginTop: 32, ...font('extrabold', 26, { color: '#FFFFFF' }) },
  sub: { marginTop: 8, textAlign: 'center', ...font('regular', 15, { color: 'rgba(255,255,255,0.72)' }) },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  circle: { position: 'absolute', width: 280, height: 280, borderRadius: 140, backgroundColor: 'rgba(167,139,250,0.28)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)' },
  core: { alignItems: 'center' },
  word: font('semibold', 22, { color: '#FFFFFF' }),
  time: { marginTop: 8, ...font('medium', 15, { color: 'rgba(255,255,255,0.7)' }) },
  button: { marginBottom: 32, height: 48, paddingHorizontal: 40, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', justifyContent: 'center' },
  buttonText: font('semibold', 16, { color: '#FFFFFF' }),
});

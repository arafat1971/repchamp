import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
import { track } from '@/lib/analytics';
import { playChimeSound, successHaptic } from '@/lib/feedback';
import { syncRitualNow } from '@/services/ritualSync';
import { useAuthStore } from '@/state/authStore';
import { useRitualStore } from '@/state/ritualStore';
import { useCouple } from '@/state/useCouple';
import { font } from '@/theme/typography';

const IN_MS = 4000;
const OUT_MS = 6000;

/**
 * A few quiet minutes: a circle that grows as you breathe in and settles as
 * you breathe out, a countdown, and nothing else on the screen. Finishing it
 * ticks the habit it was opened for — the tick is earned by doing it, not by
 * remembering to press a box.
 */
export default function BreatheScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ habit?: string }>();
  const guide = guideFor((params.habit as HabitId) ?? 'breathe');
  const reduced = useReducedMotion();
  const couple = useCouple();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const toggle = useRitualStore((s) => s.toggle);

  const total = guide.minutes * 60;
  const [left, setLeft] = useState(total);
  const [phase, setPhase] = useState<'in' | 'out'>('in');
  const [done, setDone] = useState(false);
  const finished = useRef(false);

  const scale = useSharedValue(0.55);
  useEffect(() => {
    if (reduced || done) return;
    scale.set(
      withRepeat(
        withSequence(
          withTiming(1, { duration: IN_MS, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.55, { duration: OUT_MS, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(scale);
  }, [reduced, done, scale]);

  /* One clock for the words and the countdown: 10 s a breath. */
  useEffect(() => {
    if (done) return;
    const started = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - started;
      setPhase(elapsed % (IN_MS + OUT_MS) < IN_MS ? 'in' : 'out');
      const remaining = Math.max(0, total - Math.floor(elapsed / 1000));
      setLeft(remaining);
      if (remaining === 0) setDone(true);
    }, 250);
    return () => clearInterval(id);
  }, [done, total]);

  /* Finishing ticks the habit — once, and only if it isn't already ticked. */
  useEffect(() => {
    if (!done || finished.current) return;
    finished.current = true;
    playChimeSound();
    successHaptic();
    track('ritual_guide_done', { habit: guide.habit });
    const today = dayKey();
    const state = useRitualStore.getState();
    const ticked = state.day === today && state.ticks.includes(guide.habit);
    const ticks = ticked ? state.ticks : toggle(today, guide.habit);
    void syncRitualNow(couple.couple?.id, uid, ticks);
  }, [done, guide.habit, toggle, couple.couple?.id, uid]);

  const circle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient colors={['#0B1026', '#1E1B4B', '#3B2A6B']} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe}>
        <Text style={styles.title}>{guide.title}</Text>
        <Text style={styles.sub}>{done ? 'Done. Ticked for today.' : guide.line}</Text>

        <View style={styles.stage}>
          <Animated.View style={[styles.circle, circle]} />
          <View style={styles.core}>
            <Text style={styles.word}>{done ? 'Well done' : phase === 'in' ? 'Breathe in' : 'Breathe out'}</Text>
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

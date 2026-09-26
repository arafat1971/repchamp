import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/ui';
import { MEDITATIONS, PHASE_WORD, breathAt, getMeditation, promptSchedule, type BreathPhase } from '@/domain/mindful';
import { canUse } from '@/domain/pro';
import { dayKey } from '@/domain/progression';
import { track } from '@/lib/analytics';
import { playChimeSound, selectionHaptic, speakCalm, stopSpeaking, successHaptic } from '@/lib/feedback';
import { tickRitualHabit } from '@/services/ritualTick';
import { useAuthStore } from '@/state/authStore';
import { useCouple } from '@/state/useCouple';
import { useMindfulStore } from '@/state/mindfulStore';
import { useIsPro } from '@/state/proStore';
import { font } from '@/theme/typography';

const SMALL = 0.55;

/**
 * A guided sit: pick a length, then a circle to breathe with, a spoken line
 * now and then, and a bell at the end. The clock is wall time minus pauses, so
 * a missed tick never stretches the session.
 */
export default function MeditateScreen() {
  const router = useRouter();
  const isPro = useIsPro();
  const params = useLocalSearchParams<{ id?: string }>();
  const med = getMeditation(params.id ?? '') ?? MEDITATIONS[0]!;
  const reduced = useReducedMotion();
  const savedLength = useMindfulStore((s) => s.lengths[med.id]);
  const couple = useCouple();
  const uid = useAuthStore((s) => s.user?.uid ?? null);

  const [minutes, setMinutes] = useState(savedLength && med.minutes.includes(savedLength) ? savedLength : med.minutes[0]!);
  const [stage, setStage] = useState<'setup' | 'playing' | 'done'>('setup');
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [prompt, setPrompt] = useState<string | null>(null);

  const total = minutes * 60;
  const schedule = useMemo(() => promptSchedule(med, total), [med, total]);

  /* Pro guard for a deep link or a stale route — the hub gates the tap. */
  useEffect(() => {
    if (!canUse(isPro, 'mind-body')) router.replace({ pathname: '/modal/paywall', params: { source: 'mind-body' } });
  }, [isPro, router]);

  /* Clock: accumulated running time, advanced by wall-clock deltas. */
  const runMs = useRef(0);
  const lastTick = useRef<number | null>(null);
  const nextPrompt = useRef(0);
  useEffect(() => {
    if (stage !== 'playing' || paused) {
      lastTick.current = null;
      return;
    }
    const id = setInterval(() => {
      const now = Date.now();
      // Capped per tick: a locked phone suspends timers, and time nobody saw
      // pass shouldn't finish the sit for them.
      if (lastTick.current !== null) runMs.current += Math.min(now - lastTick.current, 1000);
      lastTick.current = now;
      const sec = runMs.current / 1000;
      setElapsed(sec);
      while (nextPrompt.current < schedule.length && schedule[nextPrompt.current]!.at <= sec) {
        const p = schedule[nextPrompt.current]!;
        nextPrompt.current += 1;
        setPrompt(p.text);
        speakCalm(p.text);
      }
      if (sec >= total) setStage('done');
    }, 200);
    return () => clearInterval(id);
  }, [stage, paused, schedule, total]);

  /* Finishing: bell, log, once. */
  const logged = useRef(false);
  const finish = (completed: boolean) => {
    if (logged.current) return;
    logged.current = true;
    const mins = completed ? minutes : Math.floor(runMs.current / 60000);
    track('mind_session_finished', { kind: 'meditation', id: med.id, minutes: mins, score: 0, completed });
    if (mins >= 1) useMindfulStore.getState().add({ day: dayKey(), kind: 'meditation', id: med.id, minutes: mins });
    // A finished sit is today's Breathe, done — not a box to remember to tick.
    if (completed) tickRitualHabit('breathe', couple.couple?.id, uid);
  };
  useEffect(() => {
    if (stage !== 'done') return;
    playChimeSound();
    successHaptic();
    speakCalm('Well done.');
    finish(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  useEffect(() => () => stopSpeaking(), []);

  const begin = () => {
    useMindfulStore.getState().setLength(med.id, minutes);
    track('mind_session_started', { kind: 'meditation', id: med.id });
    runMs.current = 0;
    nextPrompt.current = 0;
    playChimeSound();
    setStage('playing');
  };

  const leave = () => {
    if (stage === 'playing') finish(false);
    stopSpeaking();
    router.back();
  };

  /* The circle: follows the breath pattern when there is one, else a slow tide. */
  const breath = med.breath && stage === 'playing' ? breathAt(med.breath, elapsed) : null;
  const phase: BreathPhase | null = breath?.phase ?? null;
  const scale = useSharedValue(SMALL);
  useEffect(() => {
    if (reduced || stage !== 'playing' || paused) {
      cancelAnimation(scale);
      return;
    }
    if (!med.breath) {
      scale.set(
        withRepeat(
          withSequence(
            withTiming(0.9, { duration: 5000, easing: Easing.inOut(Easing.sin) }),
            withTiming(SMALL + 0.1, { duration: 6000, easing: Easing.inOut(Easing.sin) }),
          ),
          -1,
        ),
      );
      return () => cancelAnimation(scale);
    }
    if (!breath) return;
    // A soft tap at each change, so the breath can be followed eyes closed.
    selectionHaptic();
    const remaining = (1 - breath.progress) * breath.phaseSec * 1000;
    if (phase === 'inhale') scale.set(withTiming(1, { duration: remaining, easing: Easing.inOut(Easing.sin) }));
    else if (phase === 'exhale') scale.set(withTiming(SMALL, { duration: remaining, easing: Easing.inOut(Easing.sin) }));
    // Holds keep the circle where it is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, stage, paused, reduced, med.breath]);
  const circle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  const left = Math.max(0, Math.ceil(total - elapsed));
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient colors={['#0B1026', '#1E1B4B', '#3B2A6B']} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe}>
        <Text style={styles.title}>{`${med.emoji}  ${med.title}`}</Text>
        <Text style={styles.sub}>{stage === 'done' ? 'Done. Logged to your streak, and today’s Breathe is ticked.' : med.blurb}</Text>

        <View style={styles.stage}>
          <Animated.View style={[styles.circle, circle]} />
          <View style={styles.core}>
            {stage === 'setup' ? (
              <>
                <Text style={styles.word}>How long?</Text>
                <View style={styles.chips}>
                  {[...med.minutes]
                    .sort((a, b) => a - b)
                    .map((m) => (
                      <PressableScale
                        key={m}
                        onPress={() => setMinutes(m)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: m === minutes }}
                        accessibilityLabel={`${m} minutes`}
                        style={[styles.chip, m === minutes && styles.chipOn]}
                      >
                        <Text style={[styles.chipText, m === minutes && styles.chipTextOn]}>{`${m} min`}</Text>
                      </PressableScale>
                    ))}
                </View>
              </>
            ) : stage === 'done' ? (
              <Text style={styles.word}>Well done</Text>
            ) : (
              <>
                <Text style={styles.word}>{paused ? 'Paused' : phase ? PHASE_WORD[phase] : 'Breathe'}</Text>
                <Text style={styles.time}>
                  {mm}:{ss}
                </Text>
              </>
            )}
          </View>
        </View>

        <View style={styles.promptBox}>
          {stage === 'playing' && prompt ? (
            <Animated.Text key={prompt} entering={FadeIn.duration(700)} exiting={FadeOut.duration(400)} style={styles.prompt}>
              {prompt}
            </Animated.Text>
          ) : null}
        </View>

        <View style={styles.actions}>
          {stage === 'setup' ? (
            <PressableScale onPress={begin} accessibilityRole="button" style={[styles.button, styles.buttonSolid]}>
              <Text style={[styles.buttonText, styles.buttonTextSolid]}>Begin</Text>
            </PressableScale>
          ) : null}
          {stage === 'playing' ? (
            <PressableScale onPress={() => setPaused((p) => !p)} accessibilityRole="button" style={styles.button}>
              <Text style={styles.buttonText}>{paused ? 'Resume' : 'Pause'}</Text>
            </PressableScale>
          ) : null}
          <PressableScale onPress={leave} accessibilityRole="button" style={styles.button}>
            <Text style={styles.buttonText}>{stage === 'playing' ? 'End' : 'Close'}</Text>
          </PressableScale>
        </View>
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
  chips: { flexDirection: 'row', gap: 8, marginTop: 14 },
  chip: { paddingHorizontal: 14, height: 36, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', justifyContent: 'center' },
  chipOn: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
  chipText: font('semibold', 14, { color: '#FFFFFF' }),
  chipTextOn: { color: '#1E1B4B' },
  promptBox: { minHeight: 72, justifyContent: 'center', alignSelf: 'stretch' },
  prompt: { textAlign: 'center', ...font('medium', 17, { color: 'rgba(255,255,255,0.9)' }), lineHeight: 24 },
  actions: { flexDirection: 'row', gap: 12, marginBottom: 32 },
  button: { height: 48, paddingHorizontal: 32, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', justifyContent: 'center' },
  buttonSolid: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
  buttonText: font('semibold', 16, { color: '#FFFFFF' }),
  buttonTextSolid: { color: '#1E1B4B' },
});

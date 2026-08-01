import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { canStartExercise } from '@/domain/pro';
import { useIsPro } from '@/state/proStore';
import { ModalHeader } from '@/components/ModalHeader';
import { Card, PressableScale, PrimaryButton, Screen } from '@/components/ui';
import { font, text } from '@/theme/typography';
import { gradients, palette, radius, shadow } from '@/theme/tokens';

type TrackedActivity = {
  kind: 'tracked';
  emoji: string; title: string; exerciseId: 'shoulder' | 'stretch';
  target: number; description: string; tips: string[];
};

type TimedActivity = {
  kind: 'timed';
  emoji: string; title: string; durationSec: number; description: string; tips: string[];
};

const ACTIVITIES: Record<string, TrackedActivity | TimedActivity> = {
  shoulder: {
    kind: 'tracked',
    emoji: '🙆', title: 'Shoulder Rolls', exerciseId: 'shoulder',
    target: 20,
    description: 'Roll your shoulders in full circles — forward and backward. Each full roll counts as one rep.',
    tips: ['Stand tall, feet shoulder-width apart', 'Roll all the way back for full range', 'Keep your neck relaxed', 'Match both shoulders together'],
  },
  stretch: {
    kind: 'tracked',
    emoji: '🤸', title: 'Full-Body Stretch', exerciseId: 'stretch',
    target: 15,
    description: 'Perform controlled full-body bends — reach down and back up. Each full movement counts as one rep.',
    tips: ['Keep your back straight on the way down', 'Breathe out as you lower', 'Hold the bottom for 1 second', 'Drive through your heels on the way up'],
  },
  walk: {
    kind: 'timed',
    emoji: '🚶', title: 'Easy Walk', durationSec: 900,
    description: 'A brisk walk for active recovery — no tracking needed. Just start the timer and move.',
    tips: ['Keep a comfortable pace', 'Breathe steady and relaxed', 'Swing arms naturally', 'Finish with a slow cool-down pace'],
  },
};

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function MobilityScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isPro = useIsPro();
  const activity = ACTIVITIES[id ?? 'shoulder'] ?? ACTIVITIES.shoulder!;

  if (activity.kind === 'timed') return <TimedFlow activity={activity} onDone={() => router.back()} />;

  const go = (mode: 'versus' | 'solo' | 'practice') => {
    // Mobility drills (shoulder rolls, full-body stretch) are part of the Pro
    // exercise library. A free athlete hits the paywall instead of the session.
    if (!canStartExercise(isPro, activity.exerciseId)) {
      router.replace({ pathname: '/modal/paywall', params: { source: 'exercise-library' } });
      return;
    }
    router.replace({
      pathname: '/session',
      params: {
        exercise: activity.exerciseId,
        mode,
        ...(mode === 'solo' ? { target: String(activity.target) } : {}),
      },
    });
  };

  return (
    <Screen>
      <ModalHeader title={activity.title} />

      <Card style={styles.hero}>
        <Text style={styles.heroEmoji}>{activity.emoji}</Text>
        <Text style={text.cardTitle}>{activity.title}</Text>
        <Text style={[text.caption, { marginTop: 4, textAlign: 'center' }]}>{activity.description}</Text>
      </Card>

      <View style={styles.tips}>
        {activity.tips.map((tip, i) => (
          <View key={i} style={styles.tipRow}>
            <View style={styles.tipDot} />
            <Text style={font('semibold', 13, { color: palette.ink, flex: 1 })}>{tip}</Text>
          </View>
        ))}
      </View>

      <View style={styles.modes}>
        <PressableScale onPress={() => go('versus')} accessibilityRole="button" accessibilityLabel="Duel mode" style={[styles.modeCard, styles.modeDuel]}>
          <Text style={{ fontSize: 22 }}>⚔️</Text>
          <Text style={font('extrabold', 14, { color: palette.white })}>Duel</Text>
          <Text style={font('semibold', 11, { color: 'rgba(255,255,255,0.85)' })}>vs opponent</Text>
        </PressableScale>

        <PressableScale onPress={() => go('solo')} accessibilityRole="button" accessibilityLabel="Solo challenge" style={[styles.modeCard, styles.modeSolo]}>
          <Text style={{ fontSize: 22 }}>🎯</Text>
          <Text style={font('extrabold', 14, { color: palette.white })}>Solo</Text>
          <Text style={font('semibold', 11, { color: 'rgba(255,255,255,0.85)' })}>beat {activity.target} reps</Text>
        </PressableScale>

        <PressableScale onPress={() => go('practice')} accessibilityRole="button" accessibilityLabel="Practice mode" style={[styles.modeCard, styles.modePractice]}>
          <Text style={{ fontSize: 22 }}>💪</Text>
          <Text style={font('extrabold', 14, { color: palette.ink })}>Practice</Text>
          <Text style={font('semibold', 11, { color: palette.grey600 })}>no pressure</Text>
        </PressableScale>
      </View>
    </Screen>
  );
}

/** Plain timer for activities the camera can't track (e.g. walking). */
function TimedFlow({ activity, onDone }: { activity: TimedActivity; onDone: () => void }) {
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const remaining = Math.max(0, activity.durationSec - elapsed);
  const percent = Math.min(100, Math.round((elapsed / activity.durationSec) * 100));

  useEffect(() => {
    if (!started || done) return;
    intervalRef.current = setInterval(() => {
      setElapsed((e) => {
        if (e + 1 >= activity.durationSec) {
          clearInterval(intervalRef.current!);
          setDone(true);
          return activity.durationSec;
        }
        return e + 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current!);
  }, [started, done, activity.durationSec]);

  return (
    <Screen>
      <ModalHeader title={activity.title} />

      <LinearGradient colors={gradients.info} style={[styles.timerHero, shadow.info]}>
        <Text style={styles.heroEmoji}>{activity.emoji}</Text>
        <Text style={styles.timerValue}>{done ? 'Done! 🎉' : fmt(remaining)}</Text>
        <Text style={styles.timerLabel}>{done ? 'Great work' : started ? 'remaining' : 'total time'}</Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${percent}%` as any }]} />
        </View>
      </LinearGradient>

      <View style={styles.tips}>
        {activity.tips.map((tip, i) => (
          <View key={i} style={styles.tipRow}>
            <View style={styles.tipDot} />
            <Text style={font('semibold', 13, { color: palette.ink, flex: 1 })}>{tip}</Text>
          </View>
        ))}
      </View>

      {done ? (
        <PrimaryButton label="Back to rest day" onPress={onDone} style={{ marginTop: 4 }} />
      ) : started ? (
        <PressableScale
          onPress={() => { clearInterval(intervalRef.current!); setStarted(false); setElapsed(0); }}
          accessibilityRole="button"
          accessibilityLabel="Stop"
          style={styles.stopButton}
        >
          <Text style={font('extrabold', 15, { color: palette.red500 })}>Stop</Text>
        </PressableScale>
      ) : (
        <PrimaryButton
          label={`Start · ${fmt(activity.durationSec)}`}
          colors={gradients.info}
          onPress={() => setStarted(true)}
          style={{ marginTop: 4 }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', padding: 24, marginBottom: 16 },
  heroEmoji: { fontSize: 52, marginBottom: 8 },
  tips: { gap: 8, marginBottom: 24 },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tipDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.green500 },
  modes: { flexDirection: 'row', gap: 8 },
  modeCard: { flex: 1, alignItems: 'center', gap: 4, padding: 16, borderRadius: radius['3xl'] },
  modeDuel: { backgroundColor: palette.green600 },
  modeSolo: { backgroundColor: palette.amber500 },
  modePractice: { backgroundColor: palette.white, ...shadow.card },
  timerHero: { borderRadius: radius['5xl'], padding: 28, alignItems: 'center', marginBottom: 20 },
  timerValue: { ...font('extrabold', 48, { color: palette.white }), lineHeight: 54 },
  timerLabel: { ...font('bold', 12, { color: 'rgba(255,255,255,0.8)' }), marginTop: 4, marginBottom: 16 },
  track: { width: '100%', height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4, backgroundColor: palette.white },
  stopButton: { height: 54, borderRadius: radius.xl, backgroundColor: palette.white, alignItems: 'center', justifyContent: 'center', ...shadow.card },
});

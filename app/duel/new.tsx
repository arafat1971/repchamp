import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ModalHeader } from '@/components/ModalHeader';
import { PressableScale, Screen } from '@/components/ui';
import { font, text } from '@/theme/typography';
import { gradients, palette, radius } from '@/theme/tokens';
import type { ExerciseId } from '@/vision/exercises';

const EXERCISES: { id: ExerciseId; label: string; emoji: string }[] = [
  { id: 'push', label: 'Push-ups', emoji: '💪' },
  { id: 'squat', label: 'Squats', emoji: '🦵' },
];

const DURATIONS = [20, 30, 45, 60];

/**
 * Exercise + duration picker before the duel waiting room.
 *
 * Params passed through:
 *   role    'host' | 'guest' (forwarded to the waiting room)
 *   target  uid of the friend being challenged (optional, forwarded)
 *   name    opponent display name (optional, forwarded)
 *   level   opponent level (optional, forwarded)
 *   queue   '1' when coming from the open-matchmaking queue path
 */
export default function DuelNewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    role?: string;
    target?: string;
    name?: string;
    level?: string;
    queue?: string;
  }>();

  const [exercise, setExercise] = useState<ExerciseId>('push');
  const [duration, setDuration] = useState(20);

  const start = () => {
    if (params.queue === '1') {
      router.replace({
        pathname: '/duel/queue',
        params: { exercise, duration: String(duration) },
      });
    } else {
      router.replace({
        pathname: '/duel/[id]',
        params: {
          id: 'new',
          role: params.role ?? 'host',
          exercise,
          duration: String(duration),
          ...(params.target ? { target: params.target } : {}),
          ...(params.name ? { name: params.name } : {}),
          ...(params.level ? { level: params.level } : {}),
        },
      });
    }
  };

  return (
    <Screen>
      <ModalHeader title="Set up duel" />

      <Text style={[text.caption, styles.sectionLabel]}>EXERCISE</Text>
      <View style={styles.row}>
        {EXERCISES.map((ex) => (
          <PressableScale
            key={ex.id}
            onPress={() => setExercise(ex.id)}
            accessibilityRole="button"
            accessibilityLabel={ex.label}
            style={[styles.tile, exercise === ex.id && styles.tileSelected]}
          >
            <Text style={styles.tileEmoji}>{ex.emoji}</Text>
            <Text style={font('extrabold', 13, { color: exercise === ex.id ? palette.green700 : palette.ink })}>
              {ex.label}
            </Text>
          </PressableScale>
        ))}
      </View>

      <Text style={[text.caption, styles.sectionLabel]}>DURATION</Text>
      <View style={styles.row}>
        {DURATIONS.map((d) => (
          <TouchableOpacity
            key={d}
            onPress={() => setDuration(d)}
            accessibilityRole="button"
            accessibilityLabel={`${d} seconds`}
            style={[styles.durationChip, duration === d && styles.durationChipSelected]}
          >
            <Text style={font('extrabold', 14, { color: duration === d ? palette.white : palette.ink })}>
              {d}s
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <LinearGradient colors={gradients.brand} style={styles.previewCard}>
        <Text style={font('extrabold', 15, { color: palette.white })}>
          {EXERCISES.find((e) => e.id === exercise)?.emoji}{' '}
          {EXERCISES.find((e) => e.id === exercise)?.label} · {duration}s
        </Text>
        <Text style={font('semibold', 12, { color: 'rgba(255,255,255,0.85)' })}>
          {params.name ? `vs ${params.name}` : 'Open match'}
        </Text>
      </LinearGradient>

      <PressableScale onPress={start} style={styles.startBtn} accessibilityRole="button">
        <Text style={font('extrabold', 16, { color: palette.white })}>
          {params.queue === '1' ? 'Find opponent' : 'Send challenge'}
        </Text>
      </PressableScale>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { marginTop: 20, marginBottom: 10 },
  row: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  tile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 18,
    borderRadius: radius.xl,
    backgroundColor: palette.white,
    borderWidth: 2,
    borderColor: palette.border,
    gap: 8,
  },
  tileSelected: { borderColor: palette.green500, backgroundColor: palette.green50 },
  tileEmoji: { fontSize: 28 },
  durationChip: {
    flex: 1,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: palette.white,
    borderWidth: 2,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationChipSelected: { backgroundColor: palette.green500, borderColor: palette.green500 },
  previewCard: {
    borderRadius: radius['3xl'],
    padding: 18,
    marginTop: 20,
    gap: 4,
  },
  startBtn: {
    marginTop: 16,
    backgroundColor: palette.green500,
    height: 56,
    borderRadius: radius['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
});

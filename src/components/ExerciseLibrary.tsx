import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui';
import { canStartExercise, FREE_EXERCISES } from '@/domain/pro';
import { useIsPro } from '@/state/proStore';
import { EXERCISES, type ExerciseId } from '@/vision/exercises';
import { font } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

/** Emoji per movement — small visual anchors for the grid. */
const EMOJI: Record<ExerciseId, string> = {
  push: '💪',
  squat: '🦵',
  shoulder: '🙆',
  stretch: '🤸',
  lunge: '🏃',
  situp: '🧎',
  'glute-bridge': '🌉',
  'pike-push': '🔺',
  'high-knees': '🦵',
  'jumping-jack': '⭐',
};

/**
 * The full exercise library grid.
 *
 * Free staples (push-ups, squats) are shown elsewhere as the big tiles; this
 * surfaces the *rest* of the library. Every item here is Pro, so tapping one
 * either starts a practice session (Pro) or opens the paywall (free) — the gate
 * lives in `canStartExercise`, so this component never decides pricing itself.
 */
export function ExerciseLibrary() {
  const router = useRouter();
  const isPro = useIsPro();

  // Everything that isn't a free staple — the Pro library.
  const library = (Object.keys(EXERCISES) as ExerciseId[]).filter(
    (id) => !FREE_EXERCISES.includes(id),
  );

  const open = (id: ExerciseId) => {
    if (!canStartExercise(isPro, id)) {
      router.push({ pathname: '/modal/paywall', params: { source: 'exercise-library' } });
      return;
    }
    router.push({ pathname: '/session', params: { exercise: id, mode: 'practice' } });
  };

  return (
    <View style={styles.grid}>
      {library.map((id) => (
        <PressableScale
          key={id}
          onPress={() => open(id)}
          accessibilityRole="button"
          accessibilityLabel={`${EXERCISES[id].label}${isPro ? '' : ' (Pro)'}`}
          style={styles.tile}
        >
          <View style={styles.tileTop}>
            <Text style={styles.emoji}>{EMOJI[id]}</Text>
            {!isPro ? (
              <View style={styles.lock}>
                <Text style={styles.lockText}>PRO</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.label} numberOfLines={1}>
            {EXERCISES[id].label}
          </Text>
        </PressableScale>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    // Two per row with the 12px gap.
    width: '47%',
    flexGrow: 1,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius['2xl'],
    padding: 12,
    gap: 8,
  },
  tileTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  emoji: { fontSize: 26 },
  lock: {
    backgroundColor: palette.amber200,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  lockText: { ...font('extrabold', 9, { color: palette.amber900 }), letterSpacing: 1 },
  label: font('extrabold', 14, { color: palette.ink }),
});

import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ExerciseGlyph } from '@/components/ExerciseGlyph';
import { LockIcon } from '@/components/home/Icons';
import { PressableScale } from '@/components/ui';
import { canStartExercise, FREE_EXERCISES } from '@/domain/pro';
import { useIsPro } from '@/state/proStore';
import { EXERCISES, type ExerciseId } from '@/vision/exercises';
import { font } from '@/theme/typography';
import { palette, radius, surfaceShadow } from '@/theme/tokens';

/**
 * Per-movement accent and the body area it works.
 *
 * The grid used to be a platform emoji per tile (🙆 for shoulder rolls, ⭐ for
 * jumping jacks), which rendered in a style nothing else on the tab shares.
 * The line-drawn `ExerciseGlyph` is what the duel picker already uses, so the
 * library now reads as the same set of movements wherever it appears.
 */
const META: Record<ExerciseId, { accent: string; area: string }> = {
  push: { accent: palette.green600, area: 'Upper body' },
  squat: { accent: palette.purple600, area: 'Lower body' },
  shoulder: { accent: '#0D9488', area: 'Mobility' },
  stretch: { accent: '#0284C7', area: 'Mobility' },
  lunge: { accent: '#EA580C', area: 'Legs' },
  situp: { accent: '#E11D48', area: 'Core' },
  'glute-bridge': { accent: '#9333EA', area: 'Glutes' },
  'pike-push': { accent: '#4F46E5', area: 'Shoulders' },
  'high-knees': { accent: '#D97706', area: 'Cardio' },
  'jumping-jack': { accent: '#DB2777', area: 'Cardio' },
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
      {library.map((id) => {
        const { accent, area } = META[id];
        return (
          <PressableScale
            key={id}
            onPress={() => open(id)}
            accessibilityRole="button"
            accessibilityLabel={`${EXERCISES[id].label}${isPro ? '' : ' (Pro)'}`}
            style={styles.tileWrap}
          >
            <View style={styles.tile}>
              <View style={[styles.glyph, { backgroundColor: `${accent}14` }]}>
                <ExerciseGlyph exercise={id} size={30} color={accent} />
              </View>
              {/* Clear of the corner lock, so a long name truncates before it. */}
              <View style={{ flex: 1, paddingRight: isPro ? 0 : 16 }}>
                <Text style={styles.label} numberOfLines={1}>
                  {EXERCISES[id].label}
                </Text>
                <Text style={[styles.area, { color: accent }]} numberOfLines={1}>
                  {area}
                </Text>
              </View>
              {!isPro ? (
                <View style={styles.lock}>
                  <LockIcon size={11} color={palette.amber800} strokeWidth={2.4} />
                </View>
              ) : null}
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  // Two per row with the 10px gap.
  tileWrap: { width: '48%', flexGrow: 1 },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: radius['2xl'],
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
    ...surfaceShadow,
  },
  glyph: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { ...font('bold', 13.5, { color: palette.ink }), letterSpacing: -0.2 },
  area: { ...font('semibold', 11), marginTop: 1 },
  lock: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: palette.amber50,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

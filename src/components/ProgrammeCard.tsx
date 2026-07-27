import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale, ProgressBar } from '@/components/ui';
import { PUSHUP_LADDER } from '@/domain/programme';
import { getExercise } from '@/vision/exercises';
import { selectProgramme, useProfileStore } from '@/state/profileStore';
import { font } from '@/theme/typography';
import { gradients, palette, radius, shadow } from '@/theme/tokens';

/**
 * The training-programme surface on the Train tab.
 *
 * Enrolled → shows today's programme day (exercise + target) with a progress bar
 * across the whole ladder, and starts that exact session on tap. Not enrolled →
 * a start CTA for the flagship push-up ladder. All the maths lives in the pure
 * `programme.ts`; this only renders and routes.
 */
export function ProgrammeCard() {
  const router = useRouter();
  const state = useProfileStore(selectProgramme);
  const startProgramme = useProfileStore((s) => s.startProgramme);

  // ---- Not enrolled: offer the flagship ladder ----
  if (!state) {
    return (
      <PressableScale
        onPress={() => startProgramme(PUSHUP_LADDER.id)}
        accessibilityRole="button"
        accessibilityLabel={`Start the programme: ${PUSHUP_LADDER.title}`}
      >
        <LinearGradient colors={gradients.brandDeep} style={[styles.card, shadow.brand]}>
          <Text style={styles.eyebrow}>NEW · 4-WEEK PROGRAMME</Text>
          <Text style={styles.title}>{PUSHUP_LADDER.title}</Text>
          <Text style={styles.body}>{PUSHUP_LADDER.description}</Text>
          <View style={styles.ctaPill}>
            <Text style={styles.ctaText}>Start programme →</Text>
          </View>
        </LinearGradient>
      </PressableScale>
    );
  }

  // ---- Finished ----
  if (state.finished || !state.currentDay) {
    return (
      <LinearGradient colors={gradients.gold} style={[styles.card, shadow.amber]}>
        <Text style={[styles.eyebrow, { color: palette.amber900 }]}>PROGRAMME COMPLETE</Text>
        <Text style={[styles.title, { color: palette.amber900 }]}>
          {state.programme.title} — done 🎉
        </Text>
        <Text style={[styles.body, { color: palette.amber800 }]}>
          You finished all {state.totalDays} days. Start another to keep climbing.
        </Text>
        <PressableScale
          onPress={() => startProgramme(PUSHUP_LADDER.id)}
          accessibilityRole="button"
          accessibilityLabel="Restart a programme"
          style={styles.ghostPill}
        >
          <Text style={font('extrabold', 13, { color: palette.amber900 })}>Start again</Text>
        </PressableScale>
      </LinearGradient>
    );
  }

  // ---- Active: today's day ----
  const day = state.currentDay;
  const def = getExercise(day.exercise);

  const onStart = () => {
    if (day.rest) return; // Rest day — nothing to launch.
    router.push({
      pathname: '/session',
      params: { exercise: day.exercise, mode: 'solo', target: String(day.target) },
    });
  };

  return (
    <PressableScale
      onPress={onStart}
      accessibilityRole="button"
      accessibilityLabel={
        day.rest
          ? 'Rest day'
          : `Programme day ${day.index}: ${day.target} ${def.label}`
      }
      disabled={day.rest}
    >
      <LinearGradient colors={gradients.brandStrong} style={[styles.card, shadow.brand]}>
        <View style={styles.headerRow}>
          <Text style={styles.eyebrow}>
            {state.programme.title.toUpperCase()} · WK {day.week} DAY {day.dayOfWeek}
          </Text>
          <Text style={styles.dayCount}>
            {state.completedDays}/{state.totalDays}
          </Text>
        </View>

        {day.rest ? (
          <>
            <Text style={styles.title}>Rest day 🧘</Text>
            <Text style={styles.body}>Recovery is part of the plan. Come back tomorrow.</Text>
          </>
        ) : (
          <>
            <Text style={styles.title}>
              {day.target} {def.label}
            </Text>
            <Text style={styles.body}>Clear today’s target to advance the ladder.</Text>
            <View style={styles.ctaPill}>
              <Text style={styles.ctaText}>Start day {day.index} →</Text>
            </View>
          </>
        )}

        <View style={{ marginTop: 14 }}>
          <ProgressBar
            percent={Math.round(state.percent * 100)}
            trackColor="rgba(255,255,255,0.25)"
            fillColor={palette.white}
          />
        </View>
      </LinearGradient>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius['4xl'], padding: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { ...font('extrabold', 10, { color: 'rgba(255,255,255,0.85)' }), letterSpacing: 1.5 },
  dayCount: { ...font('extrabold', 12, { color: 'rgba(255,255,255,0.9)' }) },
  title: { ...font('extrabold', 24, { color: palette.white }), marginTop: 10 },
  body: { ...font('bold', 12, { color: 'rgba(255,255,255,0.9)' }), marginTop: 6, lineHeight: 18 },
  ctaPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 22,
    marginTop: 14,
  },
  ctaText: font('extrabold', 14, { color: palette.white }),
  ghostPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.12)',
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 22,
    marginTop: 14,
  },
});

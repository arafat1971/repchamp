import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { StepsTrail, stepsTrailText } from '@/components/home/StepsTrail';
import { WaterGlass } from '@/components/home/WaterGlass';
import { PressableScale } from '@/components/ui';
import { DRINK_SIZES_ML, type HydrationProgress, formatMl } from '@/domain/hydration';
import { type StepsState, formatSteps, isFixableByAthlete, stepsProgress } from '@/domain/steps';
import { font } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

/**
 * Today's water and steps, drawn as the things they are.
 *
 * Water is a glass that fills — waves, bubbles, a spring on every drink —
 * and steps are a trail of footprints lighting up round an arc. They replace
 * nested progress rings: a ring says "percentage", a glass and a trail say
 * "drink" and "walk", which is what the card is asking for. Today's challenge
 * is not repeated here; the hero above already leads with it.
 *
 * Every action the old card offered is still here — the drink chips, undo,
 * the goal stepper, the partner's water and the steps fix.
 *
 * Presentational only: every figure is computed by the domain and passed in.
 */
export function TodayCard({
  water,
  steps,
  partner,
  onLogWater,
  onUndoWater,
  onStepWaterGoal,
  onFixSteps,
}: {
  water: HydrationProgress;
  steps: StepsState;
  partner: { name: string; ml: number } | null;
  onLogWater: (ml: number) => void;
  onUndoWater?: () => void;
  onStepWaterGoal: (direction: 1 | -1) => void;
  onFixSteps?: () => void;
}) {
  const stepRead = steps.status === 'ready' ? stepsProgress(steps.steps, steps.goal) : null;
  const goals = stepRead ? 2 : 1;
  const met = Number(water.met) + Number(stepRead?.met ?? false);
  const canFixSteps = steps.status === 'unavailable' && isFixableByAthlete(steps.reason) && !!onFixSteps;

  return (
    <LinearGradient colors={['#0b1b2e', '#0f172a']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.eyebrow}>TODAY</Text>
        <Text style={styles.closedText}>
          {met === goals
            ? 'All goals met 🎉'
            : goals === 1
              ? `${water.percent}% of your water goal`
              : `${met} of ${goals} goals met`}
        </Text>
      </View>

      <View style={styles.panels}>
        <View style={styles.panel}>
          <WaterGlass percent={water.percent} />
          <Text style={styles.panelValue}>{formatMl(water.ml)}</Text>
          <Text style={styles.panelSub}>of {formatMl(water.goalMl)} water</Text>
        </View>

        <View style={styles.panel}>
          <StepsTrail percent={stepRead?.percent ?? null}>
            {stepRead ? (
              <>
                <Text style={stepsTrailText.count}>{formatSteps(stepRead.steps)}</Text>
                <Text style={stepsTrailText.sub}>of {formatSteps(stepRead.goal)}</Text>
              </>
            ) : canFixSteps ? (
              <PressableScale
                onPress={onFixSteps}
                accessibilityRole="button"
                accessibilityLabel="Turn on step counting"
                style={styles.fixButton}
              >
                <Text style={styles.fixText}>Turn on</Text>
              </PressableScale>
            ) : (
              <Text style={stepsTrailText.sub}>
                {steps.status === 'loading' ? 'Counting…' : 'Not on this phone'}
              </Text>
            )}
          </StepsTrail>
          <Text style={styles.panelValue}>{stepRead?.met ? 'Goal met' : 'Steps'}</Text>
          <Text style={styles.panelSub}>
            {stepRead ? `${formatSteps(Math.max(0, stepRead.goal - stepRead.steps))} to go` : 'today'}
          </Text>
        </View>
      </View>

      {/* Water, one tap away — the only ring you can close from Home. */}
      <View style={styles.waterRow}>
        {DRINK_SIZES_ML.map((ml) => (
          <PressableScale
            key={ml}
            onPress={() => onLogWater(ml)}
            accessibilityRole="button"
            accessibilityLabel={`Log ${formatMl(ml)} of water`}
            style={styles.drink}
          >
            <Text style={styles.drinkText}>💧 +{ml}</Text>
          </PressableScale>
        ))}
      </View>

      <View style={styles.foot}>
        <View style={styles.footLeft}>
          <Text style={water.met ? styles.footMet : styles.footHint}>
            {water.met ? 'Water goal met' : `${formatMl(water.remainingMl)} to go`}
          </Text>
          {onUndoWater ? (
            <Animated.View entering={FadeIn.duration(200)}>
              <Pressable
                onPress={onUndoWater}
                accessibilityRole="button"
                accessibilityLabel="Undo the last drink"
                hitSlop={8}
              >
                <Text style={styles.undo}>Undo</Text>
              </Pressable>
            </Animated.View>
          ) : null}
        </View>
        <View style={styles.stepper}>
          <PressableScale
            onPress={() => onStepWaterGoal(-1)}
            accessibilityRole="button"
            accessibilityLabel="Lower the water goal"
            style={styles.stepHit}
          >
            <Text style={styles.stepText}>−</Text>
          </PressableScale>
          <Text style={styles.stepValue}>Goal {formatMl(water.goalMl)}</Text>
          <PressableScale
            onPress={() => onStepWaterGoal(1)}
            accessibilityRole="button"
            accessibilityLabel="Raise the water goal"
            style={styles.stepHit}
          >
            <Text style={styles.stepText}>+</Text>
          </PressableScale>
        </View>
      </View>

      {partner ? (
        <Text style={styles.partner}>
          {partner.name} has had {formatMl(partner.ml)} today
        </Text>
      ) : null}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius['3xl'], padding: 18 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  eyebrow: { ...font('extrabold', 12, { color: 'rgba(255,255,255,0.55)' }), letterSpacing: 1.6 },
  closedText: font('bold', 13, { color: palette.white }),
  panels: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', marginTop: 14 },
  panel: { alignItems: 'center', flex: 1 },
  panelValue: { ...font('extrabold', 16, { color: palette.white }), marginTop: 10 },
  panelSub: font('medium', 11.5, { color: 'rgba(255,255,255,0.55)' }),
  fixButton: {
    backgroundColor: '#f59e0b',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  fixText: font('extrabold', 13, { color: palette.ink }),
  waterRow: { flexDirection: 'row', gap: 8, marginTop: 18 },
  drink: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(56,189,248,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.35)',
  },
  drinkText: font('extrabold', 13, { color: '#bae6fd' }),
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  footLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  footHint: font('medium', 12.5, { color: 'rgba(255,255,255,0.6)' }),
  footMet: font('bold', 12.5, { color: '#86efac' }),
  undo: font('bold', 12.5, { color: '#7dd3fc' }),
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepHit: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  stepText: font('bold', 15, { color: palette.white }),
  stepValue: font('semibold', 12, { color: 'rgba(255,255,255,0.75)' }),
  partner: { ...font('medium', 12, { color: 'rgba(255,255,255,0.55)' }), marginTop: 10 },
});

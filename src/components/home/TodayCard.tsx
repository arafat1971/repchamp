import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { StepsTrail, stepsTrailText } from '@/components/home/StepsTrail';
import { WaterControls } from '@/components/home/WaterControls';
import { WaterGlass } from '@/components/home/WaterGlass';
import { PressableScale } from '@/components/ui';
import { DEFAULT_DAILY_GOAL_ML, type HydrationProgress, formatMl } from '@/domain/hydration';
import {
  type StepsState,
  formatSteps,
  isFixableByAthlete,
  stepsProgress,
  stepsUnavailableCopy,
} from '@/domain/steps';
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
  /* Their goal is not synced, so their glass fills against the default; the
     label shows only their real amount, never a goal they did not set. */
  const partnerPercent = partner
    ? Math.min(100, Math.round((partner.ml / DEFAULT_DAILY_GOAL_ML) * 100))
    : 0;
  const bothMet = !!partner && water.met && partner.ml >= DEFAULT_DAILY_GOAL_ML;
  /* Each reason in its own words — "Counting your steps from now" on the first
     read of a day is not "not available on this phone". */
  const stepsNote =
    steps.status === 'unavailable'
      ? stepsUnavailableCopy(steps.reason)
      : steps.status === 'loading'
        ? 'Counting…'
        : '';
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

      {partner ? (
        <>
          {/* A toast: two glasses leaning in, filling side by side. */}
          <View style={styles.toast}>
            <View style={[styles.panel, styles.leanRight]}>
              <WaterGlass id="me" percent={water.percent} />
              <Text style={styles.panelValue}>{formatMl(water.ml)}</Text>
              <Text style={styles.panelSub}>You</Text>
            </View>
            <View style={styles.clink}>
              <Text style={styles.clinkEmoji}>{bothMet ? '🥂' : '💧'}</Text>
            </View>
            <View style={[styles.panel, styles.leanLeft]}>
              <WaterGlass id="partner" percent={partnerPercent} />
              <Text style={styles.panelValue}>{formatMl(partner.ml)}</Text>
              <Text style={styles.panelSub} numberOfLines={1}>
                {partner.name}
              </Text>
            </View>
          </View>
          <Text style={[styles.toastLine, bothMet && styles.toastLineMet]}>
            {bothMet
              ? `Cheers! You and ${partner.name} both hit your water goal`
              : water.ml >= partner.ml
                ? `You're ${formatMl(water.ml - partner.ml)} ahead of ${partner.name}`
                : `${partner.name} is ${formatMl(partner.ml - water.ml)} ahead — top up`}
          </Text>
        </>
      ) : (
        <View style={styles.panels}>
          <View style={styles.panel}>
            <WaterGlass id="me" percent={water.percent} />
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
                {stepsNote}
              </Text>
            )}
          </StepsTrail>
            <Text style={styles.panelValue}>{stepRead?.met ? 'Goal met' : 'Steps'}</Text>
          </View>
        </View>
      )}

      <WaterControls
        water={water}
        onLogWater={onLogWater}
        onUndoWater={onUndoWater}
        onStepWaterGoal={onStepWaterGoal}
      />

      {partner ? (
        <View style={styles.stepsRow}>
          <StepsTrail percent={stepRead?.percent ?? null} width={124} height={92} />
          <View style={{ flex: 1 }}>
            <Text style={styles.stepsTitle}>
              {stepRead ? formatSteps(stepRead.steps) : 'Steps today'}
              {stepRead?.met ? ' 👟' : ''}
            </Text>
            {stepRead ? (
              <Text style={styles.panelSub}>
                {stepRead.met
                  ? `Goal of ${formatSteps(stepRead.goal)} met`
                  : `${formatSteps(stepRead.goal - stepRead.steps)} to your ${formatSteps(stepRead.goal)} goal`}
              </Text>
            ) : canFixSteps ? (
              <PressableScale
                onPress={onFixSteps}
                accessibilityRole="button"
                accessibilityLabel="Turn on step counting"
                style={[styles.fixButton, styles.fixInline]}
              >
                <Text style={styles.fixText}>Turn on step counting</Text>
              </PressableScale>
            ) : (
              <Text style={styles.panelSub}>
                {stepsNote}
              </Text>
            )}
          </View>
        </View>
      ) : null}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius['3xl'], padding: 18 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  eyebrow: { ...font('extrabold', 12, { color: 'rgba(255,255,255,0.55)' }), letterSpacing: 1.6 },
  closedText: font('bold', 13, { color: palette.white }),
  toast: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 6, marginTop: 14 },
  leanRight: { transform: [{ rotate: '5deg' }] },
  leanLeft: { transform: [{ rotate: '-5deg' }] },
  clink: { width: 40, alignItems: 'center', paddingBottom: 60 },
  clinkEmoji: { fontSize: 24 },
  toastLine: { ...font('semibold', 13, { color: 'rgba(255,255,255,0.8)' }), textAlign: 'center', marginTop: 12 },
  toastLineMet: font('extrabold', 13.5, { color: '#fde68a' }),
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  stepsTitle: font('extrabold', 15, { color: palette.white }),
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
  fixInline: { alignSelf: 'flex-start', marginTop: 8 },
});

import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { ProgressRing } from '@/components/home/ProgressRing';
import { PressableScale } from '@/components/ui';
import type { DailyChallengeProgress } from '@/domain/dailyChallenge';
import { DRINK_SIZES_ML, type HydrationProgress, formatMl } from '@/domain/hydration';
import { type StepsState, formatSteps, isFixableByAthlete, stepsProgress } from '@/domain/steps';
import { font } from '@/theme/typography';
import { gradients, palette, radius } from '@/theme/tokens';

/** Ring colours: the three things a day is made of, each with its own hue. */
const RING = {
  reps: { from: '#4ade80', to: '#16a34a', dot: '#22c55e' },
  water: { from: '#7dd3fc', to: '#2563eb', dot: '#38bdf8' },
  steps: { from: '#fcd34d', to: '#f97316', dot: '#f59e0b' },
} as const;

const OUTER = 132;
const THICK = 13;
const GAP = 4;

/**
 * Today, as three rings — reps, water, steps — on one dark card.
 *
 * Replaces the white two-ring `DailyCard` on Home. The rings nest, in the
 * activity-ring idiom, so a day reads as one shape that fills in rather than
 * three separate stats; the centre counts how many are closed, which is the
 * number people come back to finish. Every action the old card offered is
 * still here — the drink chips, undo, the goal stepper, the partner's water
 * and the steps fix — just compacted under the rings.
 *
 * Presentational only: every figure is computed by the domain and passed in.
 */
export function TodayCard({
  challenge,
  water,
  steps,
  partner,
  onLogWater,
  onUndoWater,
  onStepWaterGoal,
  onFixSteps,
  onOpenChallenge,
}: {
  challenge: DailyChallengeProgress;
  water: HydrationProgress;
  steps: StepsState;
  partner: { name: string; ml: number } | null;
  onLogWater: (ml: number) => void;
  onUndoWater?: () => void;
  onStepWaterGoal: (direction: 1 | -1) => void;
  onFixSteps?: () => void;
  onOpenChallenge: () => void;
}) {
  const stepRead = steps.status === 'ready' ? stepsProgress(steps.steps, steps.goal) : null;
  const closed =
    Number(challenge.cleared) + Number(water.met) + Number(stepRead?.met ?? false);
  const rings = stepRead ? 3 : 2;

  return (
    <LinearGradient colors={gradients.ink} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.eyebrow}>TODAY</Text>
        <Text style={styles.closedText}>
          {closed === rings ? 'All rings closed 🎉' : `${closed} of ${rings} rings closed`}
        </Text>
      </View>

      <View style={styles.body}>
        {/* Three nested rings, each inset by its thickness plus a hairline gap. */}
        <View style={{ width: OUTER, height: OUTER }}>
          <View style={StyleSheet.absoluteFill}>
            <ProgressRing
              percent={challenge.percent}
              size={OUTER}
              thickness={THICK}
              from={RING.reps.from}
              to={RING.reps.to}
              track="rgba(255,255,255,0.08)"
            />
          </View>
          <View style={[styles.inset, { margin: THICK + GAP }]}>
            <ProgressRing
              percent={water.percent}
              size={OUTER - 2 * (THICK + GAP)}
              thickness={THICK}
              from={RING.water.from}
              to={RING.water.to}
              track="rgba(255,255,255,0.08)"
            />
          </View>
          <View style={[styles.inset, { margin: 2 * (THICK + GAP) }]}>
            <ProgressRing
              percent={stepRead?.percent ?? 0}
              size={OUTER - 4 * (THICK + GAP)}
              thickness={THICK}
              from={RING.steps.from}
              to={RING.steps.to}
              track={stepRead ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)'}
            />
          </View>
        </View>

        <View style={styles.legend}>
          <LegendRow
            color={RING.reps.dot}
            label="Challenge"
            value={challenge.cleared ? 'Done ✓' : `${challenge.best}/${challenge.target}`}
            onPress={onOpenChallenge}
          />
          <LegendRow
            color={RING.water.dot}
            label="Water"
            value={`${formatMl(water.ml)} / ${formatMl(water.goalMl)}`}
          />
          {stepRead ? (
            <LegendRow
              color={RING.steps.dot}
              label="Steps"
              value={`${formatSteps(stepRead.steps)}`}
            />
          ) : steps.status === 'unavailable' && isFixableByAthlete(steps.reason) && onFixSteps ? (
            <LegendRow color={RING.steps.dot} label="Steps" value="Turn on ›" onPress={onFixSteps} />
          ) : (
            <LegendRow
              color="rgba(255,255,255,0.25)"
              label="Steps"
              value={steps.status === 'loading' ? 'Counting…' : 'Not on this phone'}
              muted
            />
          )}
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

function LegendRow({
  color,
  label,
  value,
  muted,
  onPress,
}: {
  color: string;
  label: string;
  value: string;
  muted?: boolean;
  onPress?: () => void;
}) {
  const content = (
    <View style={styles.legendRow}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.legendLabel}>{label}</Text>
        <Text style={[styles.legendValue, muted && styles.legendMuted]} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius['3xl'], padding: 18 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  eyebrow: { ...font('extrabold', 12, { color: 'rgba(255,255,255,0.55)' }), letterSpacing: 1.6 },
  closedText: font('bold', 13, { color: palette.white }),
  body: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 14 },
  inset: { position: 'absolute', top: 0, left: 0 },
  legend: { flex: 1, gap: 12 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: font('semibold', 11.5, { color: 'rgba(255,255,255,0.6)' }),
  legendValue: font('extrabold', 15, { color: palette.white }),
  legendMuted: font('medium', 12.5, { color: 'rgba(255,255,255,0.45)' }),
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

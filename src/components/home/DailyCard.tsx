import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  Layout,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { ProgressRing } from '@/components/home/ProgressRing';
import { PressableScale } from '@/components/ui';
import { CountUp } from '@/components/motion';
import { DRINK_SIZES_ML, type HydrationProgress, formatMl } from '@/domain/hydration';
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
 * Today at a glance: water and steps, as two rings.
 *
 * Replaces the water-only card. Two rings side by side rather than two stacked
 * bars, because at Home's density a pair of rings reads as one status in a
 * single glance while two bars read as a list to work through.
 *
 * The asymmetry between them is the point and is deliberate: water is logged,
 * so it has controls; steps are counted, so they have none. A step ring with
 * a "+1000" chip under it would be a lie about where the number comes from.
 *
 * Motion is confined to what carries meaning. The rings sweep on mount and on
 * change (the goal being *closed* is the thing worth feeling), the water total
 * counts rather than swaps, and a met goal pulses once. Nothing loops, nothing
 * drifts — a card that is permanently in motion on a Home screen is noise the
 * athlete learns to skip.
 */
export function DailyCard({
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
  /** Partner's water today, or null when unpaired or not synced today. */
  partner: { name: string; ml: number } | null;
  onLogWater: (ml: number) => void;
  onUndoWater?: () => void;
  onStepWaterGoal: (direction: 1 | -1) => void;
  /** Offered only when the athlete can actually fix it — a denied permission. */
  onFixSteps?: () => void;
}) {
  return (
    <Animated.View style={styles.card} layout={Layout.springify().damping(18)}>
      <View style={styles.ringRow}>
        <WaterRing water={water} />
        <View style={styles.divider} />
        <StepsRing steps={steps} onFix={onFixSteps} />
      </View>

      <View style={styles.chipRow}>
        {DRINK_SIZES_ML.map((ml, i) => (
          <Animated.View
            key={ml}
            style={styles.chipWrap}
            entering={FadeInDown.delay(80 * i).duration(280)}
          >
            <PressableScale
              onPress={() => onLogWater(ml)}
              accessibilityRole="button"
              accessibilityLabel={`Log ${formatMl(ml)} of water`}
              style={styles.chip}
            >
              <Text style={styles.chipText}>+{ml}</Text>
            </PressableScale>
          </Animated.View>
        ))}
      </View>

      <View style={styles.footRow}>
        {/* Both, not one or the other. Undo appears as soon as anything is
            logged, so branching on it meant the status line — the "to go"
            figure and the goal-met line — was never once seen in practice.
            They answer different questions and share the row. */}
        <View style={styles.footLeft}>
          <Text style={water.met ? styles.footMet : styles.footHint}>
            {water.met ? 'Goal met' : `${formatMl(water.remainingMl)} to go`}
          </Text>
          {onUndoWater ? (
            <Animated.View entering={FadeIn.duration(200)}>
              <Pressable
                onPress={onUndoWater}
                accessibilityRole="button"
                accessibilityLabel="Undo the last drink"
                hitSlop={8}
              >
                <Text style={styles.undoText}>Undo</Text>
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
          <Text style={styles.stepValue}>{formatMl(water.goalMl)}</Text>
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

      {/* Only when they actually synced today — an absent line and a zero are
          different claims, and only one of them is true. */}
      {partner ? (
        <Animated.Text entering={FadeIn.duration(260)} style={styles.partnerLine}>
          {partner.name} has had {formatMl(partner.ml)} today
        </Animated.Text>
      ) : null}
    </Animated.View>
  );
}

function WaterRing({ water }: { water: HydrationProgress }) {
  return (
    <View style={styles.ringCell}>
      <CelebrateOnMet met={water.met}>
        <ProgressRing
          percent={water.percent}
          from={palette.blue400}
          to={palette.blue600}
        >
          <CountUp
            value={water.ml}
            duration={700}
            delay={120}
            format={(n) => (n >= 1000 ? `${Number((n / 1000).toFixed(1))}L` : `${n}`)}
            style={styles.ringValue}
          />
        </ProgressRing>
      </CelebrateOnMet>
      <Text style={styles.ringLabel}>WATER</Text>
      <Text style={styles.ringSub}>of {formatMl(water.goalMl)}</Text>
    </View>
  );
}

function StepsRing({
  steps,
  onFix,
}: {
  steps: StepsState;
  onFix?: () => void;
}) {
  if (steps.status === 'ready') {
    const p = stepsProgress(steps.steps, steps.goal);
    return (
      <View style={styles.ringCell}>
        <CelebrateOnMet met={p.met}>
          <ProgressRing
            percent={p.percent}
            from={palette.green500}
            to={palette.green700}
          >
            <CountUp
              value={p.steps}
              duration={900}
              delay={120}
              format={(n) => (n >= 1000 ? `${Number((n / 1000).toFixed(1))}k` : `${n}`)}
              style={styles.ringValue}
            />
          </ProgressRing>
        </CelebrateOnMet>
        <Text style={styles.ringLabel}>STEPS</Text>
        {/* A post-reboot count is real but understates the day, so it says so
            rather than sitting under "of 8,000" as though it were a total.
            Android's hardware counter resets on reboot and the earlier steps
            cannot be recovered — see `domain/stepBaseline`. */}
        <Text style={styles.ringSub}>
          {steps.partial ? 'since restart' : `of ${formatSteps(p.goal)}`}
        </Text>
      </View>
    );
  }

  if (steps.status === 'loading') {
    return (
      <View style={styles.ringCell}>
        <ProgressRing percent={0} from={palette.grey600} to={palette.grey600} animate={false}>
          <Text style={styles.ringValueMuted}>—</Text>
        </ProgressRing>
        <Text style={styles.ringLabel}>STEPS</Text>
        <Text style={styles.ringSub}>Reading…</Text>
      </View>
    );
  }

  /* Unavailable. An empty ring with the reason under it, rather than a zero:
     a 0 in the ring would read as "you have not moved today". */
  const fixable = isFixableByAthlete(steps.reason);
  return (
    <View style={styles.ringCell}>
      <ProgressRing percent={0} from={palette.border} to={palette.border} animate={false}>
        <Text style={styles.ringValueMuted}>—</Text>
      </ProgressRing>
      <Text style={styles.ringLabel}>STEPS</Text>
      {fixable && onFix ? (
        <Pressable onPress={onFix} accessibilityRole="button" hitSlop={6}>
          <Text style={styles.ringAction}>Allow access</Text>
        </Pressable>
      ) : (
        <Text style={styles.ringSubTight}>{stepsUnavailableCopy(steps.reason)}</Text>
      )}
    </View>
  );
}

/**
 * One pulse when a goal is first met.
 *
 * Once, on the transition — not while it stays met. A ring that keeps
 * celebrating a goal closed hours ago is the kind of motion that trains
 * people to ignore the card.
 */
function CelebrateOnMet({ met, children }: { met: boolean; children: React.ReactNode }) {
  const scale = useSharedValue(1);
  const wasMet = useSharedValue(met);

  useEffect(() => {
    if (met && !wasMet.value) {
      scale.value = withSequence(
        withTiming(1.08, { duration: 160, easing: Easing.out(Easing.quad) }),
        withSpring(1, { damping: 9, stiffness: 300 }),
      );
    }
    wasMet.value = met;
  }, [met, scale, wasMet]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.white,
    borderRadius: radius['4xl'],
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
  },
  ringRow: { flexDirection: 'row', alignItems: 'center' },
  ringCell: { flex: 1, alignItems: 'center' },
  divider: { width: 1, alignSelf: 'stretch', backgroundColor: palette.border, marginVertical: 4 },
  ringValue: { ...font('extrabold', 17, { color: palette.ink }) },
  ringValueMuted: { ...font('extrabold', 17, { color: palette.grey600 }) },
  ringLabel: {
    ...font('extrabold', 9.5, { color: palette.grey600 }),
    letterSpacing: 1.1,
    marginTop: 8,
  },
  ringSub: { ...font('semibold', 11, { color: palette.grey600 }), marginTop: 2 },
  ringSubTight: {
    ...font('semibold', 10, { color: palette.grey600 }),
    marginTop: 2,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  ringAction: { ...font('bold', 11, { color: palette.blue600 }), marginTop: 2 },
  chipRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  chipWrap: { flex: 1 },
  chip: {
    alignItems: 'center',
    paddingVertical: 11,
    borderRadius: radius.xl,
    backgroundColor: palette.blue50,
  },
  chipText: { ...font('extrabold', 13, { color: palette.blue700 }) },
  footRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  footLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  footHint: { ...font('semibold', 12, { color: palette.grey600 }) },
  footMet: { ...font('extrabold', 12, { color: palette.green700 }) },
  undoText: { ...font('bold', 12, { color: palette.grey600 }) },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepHit: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.blue50,
  },
  stepText: { ...font('extrabold', 14, { color: palette.blue700 }) },
  stepValue: { ...font('bold', 12, { color: palette.ink }), minWidth: 52, textAlign: 'center' },
  partnerLine: {
    ...font('semibold', 12, { color: palette.grey600 }),
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
});

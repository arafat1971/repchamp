import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { PressableScale } from '@/components/ui';
import { CountUp } from '@/components/motion';
import { ProgressRing } from '@/components/home/ProgressRing';
import type { StepsState } from '@/domain/steps';
import { font } from '@/theme/typography';
import { palette, radius, surfaceShadow } from '@/theme/tokens';

/* Outer to inner. Each ring is its own colour story, carried into its row. */
const RINGS = {
  challenge: { from: '#4ADE80', to: '#15803D', track: 'rgba(22,163,74,0.12)', ink: '#15803D' },
  water: { from: '#7DD3FC', to: '#0284C7', track: 'rgba(2,132,199,0.12)', ink: '#0369A1' },
  steps: { from: '#FCD34D', to: '#EA580C', track: 'rgba(234,88,12,0.12)', ink: '#C2410C' },
} as const;

const OUTER = 128;
const THICK = 12;
const GAP = 3;

/**
 * Today at a glance: three nested rings — the daily challenge, water, steps.
 *
 * Each card below owns one of these in full; this is the summary that makes
 * the day legible in a second and gives the athlete three loops to close. A
 * ring that is 80% round is the strongest "one more" there is, which is why
 * this sits just under the hero rather than at the bottom with the stats.
 *
 * Nested rather than side by side: one object the eye takes in at once, and
 * "all three closed" becomes a single shape — a full target — worth earning.
 */
export function TodayRings({
  challenge,
  water,
  steps,
  onChallenge,
  onWater,
  onSteps,
}: {
  challenge: { best: number; target: number; percent: number };
  water: { ml: number; goalMl: number; percent: number };
  steps: StepsState;
  onChallenge: () => void;
  onWater?: () => void;
  onSteps: () => void;
}) {
  const stepsReady = steps.status === 'ready';
  const stepPct = stepsReady ? Math.min(100, Math.round((steps.steps / Math.max(1, steps.goal)) * 100)) : 0;
  const closed = [challenge.percent, water.percent, stepPct].filter((p) => p >= 100).length;
  const allClosed = closed === 3;
  const overall = Math.round((challenge.percent + water.percent + stepPct) / 3);

  return (
    <View style={[styles.card, allClosed && styles.cardDone]}>
      <View style={styles.head}>
        <View>
          <Text style={styles.eyebrow}>TODAY</Text>
          <Text style={styles.title}>{headline(closed, overall)}</Text>
        </View>
        <View style={[styles.badge, allClosed && styles.badgeDone]}>
          <Text style={[styles.badgeText, allClosed && styles.badgeTextDone]}>
            {allClosed ? '✦ Perfect day' : `${closed}/3`}
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.ringStack}>
          {allClosed ? <DoneGlow /> : null}
          <Ring size={OUTER} percent={challenge.percent} tone={RINGS.challenge} />
          <Ring size={OUTER - 2 * (THICK + GAP)} percent={water.percent} tone={RINGS.water} />
          <Ring size={OUTER - 4 * (THICK + GAP)} percent={stepPct} tone={RINGS.steps} />
          <View style={styles.ringCenter} pointerEvents="none">
            <Text style={styles.centerValue}>{overall}%</Text>
          </View>
        </View>

        <View style={styles.legend}>
          <Row
            icon="💪"
            label="Challenge"
            tone={RINGS.challenge}
            value={challenge.best}
            unit={`/ ${challenge.target}`}
            percent={challenge.percent}
            onPress={onChallenge}
          />
          <Row
            icon="💧"
            label="Water"
            tone={RINGS.water}
            text={litres(water.ml)}
            unit={`/ ${litres(water.goalMl)} L`}
            percent={water.percent}
            onPress={onWater}
          />
          <Row
            icon="👟"
            label="Steps"
            tone={RINGS.steps}
            value={stepsReady ? steps.steps : undefined}
            text={stepsReady ? undefined : steps.status === 'loading' ? '…' : 'Turn on'}
            unit={stepsReady ? `/ ${Math.round(steps.goal / 1000)}k` : ''}
            percent={stepPct}
            onPress={stepsReady ? undefined : onSteps}
            last
          />
        </View>
      </View>
    </View>
  );
}

/** One line that reads the day back, not a number to decode. */
function headline(closed: number, overall: number): string {
  if (closed === 3) return 'Every ring closed';
  if (closed === 2) return 'One ring to go';
  if (overall >= 50) return 'Past halfway';
  if (overall > 0) return 'Building momentum';
  return 'Close your rings';
}

function litres(ml: number): string {
  const l = ml / 1000;
  return l === 0 ? '0' : l < 10 ? l.toFixed(1).replace(/\.0$/, '') : String(Math.round(l));
}

function Ring({
  size,
  percent,
  tone,
}: {
  size: number;
  percent: number;
  tone: { from: string; to: string; track: string };
}) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.ringSlot]} pointerEvents="none">
      <ProgressRing percent={percent} size={size} thickness={THICK} from={tone.from} to={tone.to} track={tone.track} />
    </View>
  );
}

/** A slow golden breath behind a perfect day's rings. */
function DoneGlow() {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0.5);
  useEffect(() => {
    if (reduced) return;
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.5, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [pulse, reduced]);
  const style = useAnimatedStyle(() => ({
    opacity: pulse.value,
    transform: [{ scale: 0.92 + pulse.value * 0.12 }],
  }));
  return <Animated.View style={[styles.doneGlow, style]} pointerEvents="none" />;
}

function Row({
  icon,
  label,
  tone,
  value,
  text,
  unit,
  percent,
  onPress,
  last = false,
}: {
  icon: string;
  label: string;
  tone: { from: string; to: string; ink: string };
  value?: number;
  text?: string;
  unit: string;
  percent: number;
  onPress?: () => void;
  last?: boolean;
}) {
  const done = percent >= 100;
  const inner = (
    <View style={[styles.row, !last && styles.rowDivider]}>
      <View style={[styles.rowIcon, { backgroundColor: `${tone.to}14` }]}>
        <Text style={styles.rowEmoji}>{icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <View style={styles.rowValueLine}>
          {value != null ? (
            <CountUp value={value} duration={800} style={styles.rowValue} />
          ) : (
            <Text style={[styles.rowValue, text === 'Turn on' && { color: tone.ink, fontSize: 14 }]}>{text}</Text>
          )}
          {unit ? <Text style={styles.rowUnit}> {unit}</Text> : null}
        </View>
      </View>
      <Text style={[styles.rowPct, { color: done ? tone.ink : palette.grey500 }]}>
        {done ? '✓' : `${percent}%`}
      </Text>
    </View>
  );
  if (!onPress) return inner;
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}, ${percent}%`}>
      {inner}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 16,
    backgroundColor: palette.white,
    borderRadius: radius['4xl'],
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
    padding: 18,
    ...surfaceShadow,
  },
  cardDone: { borderColor: 'rgba(217,119,6,0.35)' },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  eyebrow: { ...font('bold', 10.5, { color: palette.grey500 }), letterSpacing: 1.6 },
  title: { ...font('extrabold', 19, { color: palette.ink, marginTop: 2 }), letterSpacing: -0.4 },
  badge: {
    backgroundColor: palette.divider,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeDone: { backgroundColor: '#FEF3C7' },
  badgeText: { ...font('extrabold', 12, { color: palette.grey600 }), fontVariant: ['tabular-nums'] },
  badgeTextDone: { color: '#B45309' },
  body: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 16 },
  ringStack: { width: OUTER, height: OUTER },
  ringSlot: { alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  centerValue: { ...font('extrabold', 15, { color: palette.ink }), fontVariant: ['tabular-nums'], letterSpacing: -0.3 },
  doneGlow: {
    position: 'absolute',
    top: -10,
    left: -10,
    right: -10,
    bottom: -10,
    borderRadius: (OUTER + 20) / 2,
    backgroundColor: 'rgba(251,191,36,0.22)',
  },
  legend: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: palette.dividerSoft },
  rowIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowEmoji: { fontSize: 15 },
  rowLabel: { ...font('semibold', 11, { color: palette.grey600 }), letterSpacing: 0.2 },
  rowValueLine: { flexDirection: 'row', alignItems: 'baseline' },
  rowValue: { ...font('extrabold', 16, { color: palette.ink }), fontVariant: ['tabular-nums'] },
  rowUnit: font('semibold', 11, { color: palette.grey500 }),
  rowPct: { ...font('bold', 12), fontVariant: ['tabular-nums'] },
});

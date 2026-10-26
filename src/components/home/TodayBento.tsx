import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { CountUp, PopOnChange } from '@/components/motion';
import { PressableScale } from '@/components/ui';
import { CheckIcon, FlameIcon, SnowflakeIcon } from '@/components/home/Icons';
import { ProgressRing } from '@/components/home/ProgressRing';
import type { LeagueProgress } from '@/domain/leagueProgress';
import { nextToClose } from '@/domain/nextToClose';
import { isFixableByAthlete, type StepsState } from '@/domain/steps';
import { font } from '@/theme/typography';
import { palette, radius, surfaceShadow } from '@/theme/tokens';

const MEDAL_BRONZE = require('../../../assets/medal-bronze.png');

/* Outer to inner. Each ring keeps its own colour story into the legend. */
const RINGS = {
  challenge: { from: '#4ADE80', to: '#15803D', track: 'rgba(22,163,74,0.12)', ink: '#15803D' },
  water: { from: '#7DD3FC', to: '#0284C7', track: 'rgba(2,132,199,0.12)', ink: '#0369A1' },
  steps: { from: '#FCD34D', to: '#EA580C', track: 'rgba(234,88,12,0.12)', ink: '#C2410C' },
} as const;

const OUTER = 100;
const THICK = 10;
const GAP = 3;

/**
 * Today as a bento grid: the three rings on the left, the streak and the
 * league stacked on the right.
 *
 * Replaces both the full-width "Today" rings card and the "Your progress"
 * pair that sat at the very bottom of Home. Streak and league are status, not
 * actions, so they get small tiles beside the rings instead of a section of
 * their own below the fold — the whole day and the whole week in one glance.
 */
export function TodayBento({
  challenge,
  water,
  steps,
  streak,
  freezes = 0,
  daysTrained,
  goal,
  league,
  onChallenge,
  onSteps,
  onStreak,
  onLeague,
}: {
  challenge: { best: number; target: number; percent: number; label?: string };
  water: { ml: number; goalMl: number; percent: number };
  steps: StepsState;
  streak: number;
  /** Streak freezes banked — shown as a small ice chip on the streak tile. */
  freezes?: number;
  daysTrained: number;
  goal: number;
  league: LeagueProgress;
  onChallenge: () => void;
  onSteps: () => void;
  onStreak: () => void;
  onLeague: () => void;
}) {
  const stepsReady = steps.status === 'ready';
  /* "Turn on" only when a tap can turn it on. A phone with no step sensor used
     to get the same orange call to act, beside a Steps card saying the device
     has no counter. */
  const stepsFixable = steps.status === 'unavailable' && isFixableByAthlete(steps.reason);
  const stepPct = stepsReady ? Math.min(100, Math.round((steps.steps / Math.max(1, steps.goal)) * 100)) : 0;
  const closed = [challenge.percent, water.percent, stepPct].filter((p) => p >= 100).length;
  const overall = Math.round((challenge.percent + water.percent + stepPct) / 3);
  const daysToGoal = Math.max(0, goal - daysTrained);
  /* The nearest open ring as a next step — "2 glasses of water to go" says
     what to do; an average percentage does not. */
  const next = nextToClose({
    challenge: { best: challenge.best, target: challenge.target, label: challenge.label ?? 'Push-Up' },
    water,
    steps: stepsReady ? { steps: steps.steps, goal: steps.goal } : null,
  });
  const perfect = next?.kind === 'perfect';
  const nextColor =
    next?.kind === 'water' ? RINGS.water.ink : next?.kind === 'steps' ? RINGS.steps.ink : RINGS.challenge.ink;

  return (
    <View style={styles.grid}>
      {/* Rings tile */}
      <PressableScale
        onPress={onChallenge}
        accessibilityRole="button"
        accessibilityLabel={`Today: ${closed} of 3 goals closed${next ? `. ${next.text}` : ''}`}
        style={[styles.tile, styles.ringsTile, styles.left]}
      >
        <>
          <View style={styles.tileHead}>
            <Text style={styles.tileLabel}>Today</Text>
            <Text style={styles.tileMeta}>{overall}%</Text>
          </View>
          <View style={styles.ringStack}>
            <Ring size={OUTER} percent={challenge.percent} tone={RINGS.challenge} />
            <Ring size={OUTER - 2 * (THICK + GAP)} percent={water.percent} tone={RINGS.water} />
            <Ring size={OUTER - 4 * (THICK + GAP)} percent={stepPct} tone={RINGS.steps} />
            {/* Rings closed, not an average: three is the number to chase. */}
            <View style={styles.ringCenter} pointerEvents="none">
              {perfect ? (
                <PopOnChange trigger={closed} style={styles.perfectBadge}>
                  <CheckIcon size={16} color={palette.white} strokeWidth={3} />
                </PopOnChange>
              ) : (
                <Text style={styles.ringPct}>
                  {closed}
                  <Text style={styles.ringPctOf}>/3</Text>
                </Text>
              )}
            </View>
          </View>
          <View style={styles.legend}>
            <Legend color={RINGS.challenge.to} label={challenge.label ?? "Push"} value={`${challenge.best}/${challenge.target}`} />
            <Legend color={RINGS.water.to} label="Water" value={`${litres(water.ml)}/${litres(water.goalMl)}L`} />
            {stepsReady ? (
              <Legend color={RINGS.steps.to} label="Steps" value={compact(steps.steps)} />
            ) : stepsFixable ? (
              <PressableScale onPress={onSteps} accessibilityRole="button" accessibilityLabel="Turn on step counting">
                <Legend color={RINGS.steps.to} label="Steps" value="Turn on" valueColor={RINGS.steps.ink} />
              </PressableScale>
            ) : (
              <Legend
                color={RINGS.steps.to}
                label="Steps"
                value={steps.status === 'loading' ? '…' : '—'}
                valueColor={palette.grey700}
              />
            )}
          </View>
          {next ? (
            <View style={[styles.nextPill, perfect && styles.nextPillPerfect]}>
              <Text
                style={[styles.nextText, { color: perfect ? palette.green700 : nextColor }]}
                numberOfLines={2}
              >
                {perfect ? next.text : `Next: ${next.text}`}
              </Text>
            </View>
          ) : null}
        </>
      </PressableScale>

      <View style={styles.right}>
        {/* Streak tile — the one dark surface, so the number you protect pops. */}
        <PressableScale
          onPress={onStreak}
          accessibilityRole="button"
          accessibilityLabel={`${streak} day streak, ${daysTrained} of ${goal} days this week${
            freezes > 0 ? `, ${freezes} streak ${freezes === 1 ? 'freeze' : 'freezes'} banked` : ''
          }`}
          style={[styles.tile, styles.streakTile]}
        >
          <>
            <View style={styles.bigRow}>
              <PopOnChange trigger={streak} style={styles.flameBubble}>
                <FlameIcon size={15} color={streak > 0 ? palette.amber300 : palette.grey500} />
              </PopOnChange>
              <CountUp value={streak} style={[styles.bigNumber, { color: palette.white }]} />
              <Text style={[styles.bigUnit, { color: 'rgba(255,255,255,0.7)' }]}>
                {streak === 1 ? 'day' : 'days'}
              </Text>
              {freezes > 0 ? (
                <PopOnChange trigger={freezes} style={styles.freezeChip}>
                  <SnowflakeIcon size={11} color={palette.blue300} strokeWidth={2.4} />
                  <Text style={styles.freezeCount}>{freezes}</Text>
                </PopOnChange>
              ) : null}
            </View>
            <Text style={[styles.tileFoot, { color: 'rgba(255,255,255,0.6)' }]} numberOfLines={1}>
              {streak === 0
                ? 'Start a streak today'
                : daysToGoal === 0
                  ? `Weekly goal met · ${daysTrained}/${goal}`
                  : `${daysTrained}/${goal} this week · ${daysToGoal} to go`}
            </Text>
          </>
        </PressableScale>

        {/* League tile */}
        <PressableScale
          onPress={onLeague}
          accessibilityRole="button"
          accessibilityLabel={`League ${league.title}, ${league.weeklyXp} XP this week`}
          style={[styles.tile, styles.leagueTile]}
        >
          <>
            <View style={styles.leagueName}>
              <Image source={MEDAL_BRONZE} style={styles.medal} contentFit="contain" />
              <Text style={font('extrabold', 13.5, { color: palette.ink, letterSpacing: -0.2, flex: 1 })} numberOfLines={1}>
                {league.title}
              </Text>
            </View>
            <View style={[styles.bigRow, { marginTop: 4 }]}>
              <CountUp value={league.weeklyXp} style={[styles.bigNumber, { fontSize: 22 }]} />
              <Text style={styles.bigUnit}>XP this week</Text>
            </View>
            <XpBar fill={league.fill} />
            <Text style={styles.tileFoot} numberOfLines={1}>
              {league.nextLeague
                ? `${league.xpToNext.toLocaleString()} to ${league.nextLeague.name}`
                : 'Top league'}
            </Text>
          </>
        </PressableScale>
      </View>
    </View>
  );
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
      {/* An empty ring is just its track. Three start dots stacked at twelve
          o'clock read as a glitch, not as three rings waiting. */}
      <ProgressRing percent={percent} size={size} thickness={THICK} from={tone.from} to={tone.to} track={tone.track} />
    </View>
  );
}

function Legend({
  color,
  label,
  value,
  valueColor = palette.ink,
}: {
  color: string;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
      <Text style={[styles.legendValue, { color: valueColor }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function XpBar({ fill }: { fill: number }) {
  const width = useSharedValue(0);
  useEffect(() => {
    width.value = withDelay(
      300,
      withTiming(Math.max(0.04, Math.min(1, fill)), { duration: 900, easing: Easing.out(Easing.cubic) }),
    );
  }, [fill, width]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${Math.round(width.value * 100)}%` }));
  return (
    <View style={styles.xpTrack}>
      <Animated.View style={[styles.xpFill, fillStyle]} />
    </View>
  );
}

function litres(ml: number): string {
  const l = ml / 1000;
  return l === 0 ? '0' : l < 10 ? l.toFixed(1).replace(/\.0$/, '') : String(Math.round(l));
}

function compact(n: number): string {
  return n >= 10000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : n.toLocaleString();
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', alignItems: 'stretch', gap: 12, marginTop: 12 },
  left: { flex: 1.08 },
  right: { flex: 1, gap: 12 },
  flex: { flex: 1 },
  tile: {
    flex: 1,
    borderRadius: radius['4xl'],
    padding: 12,
    justifyContent: 'center',
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
    ...surfaceShadow,
  },
  ringsTile: { alignItems: 'stretch', justifyContent: 'flex-start' },
  streakTile: { backgroundColor: palette.ink, borderColor: palette.ink },
  freezeChip: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(147,197,253,0.16)',
  },
  freezeCount: { ...font('extrabold', 11, { color: palette.blue300 }), fontVariant: ['tabular-nums'] },
  leagueTile: {},
  tileHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tileLabel: { ...font('bold', 15, { color: palette.ink }), letterSpacing: -0.2 },
  tileMeta: { ...font('bold', 12, { color: palette.grey700 }), fontVariant: ['tabular-nums'] },
  ringStack: { width: OUTER, height: OUTER, alignSelf: 'center', marginTop: 6 },
  ringCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  ringPct: { ...font('extrabold', 15, { color: palette.ink }), fontVariant: ['tabular-nums'] },
  ringPctOf: font('bold', 11, { color: palette.grey700 }),
  perfectBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: palette.green600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextPill: {
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: palette.canvas,
  },
  nextPillPerfect: { backgroundColor: palette.green50 },
  nextText: { ...font('bold', 11.5), lineHeight: 15 },
  ringSlot: { alignItems: 'center', justifyContent: 'center' },
  legend: { marginTop: 8, gap: 3 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendLabel: { ...font('semibold', 12, { color: palette.grey700 }), flex: 1 },
  legendValue: { ...font('extrabold', 12), fontVariant: ['tabular-nums'] },
  flameBubble: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignSelf: 'center',
    marginRight: 2,
    backgroundColor: 'rgba(251,191,36,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5, flexWrap: 'wrap' },
  bigNumber: {
    ...font('extrabold', 28, { color: palette.ink }),
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.8,
  },
  bigUnit: font('semibold', 13, { color: palette.grey700 }),
  tileFoot: { ...font('medium', 11, { color: palette.grey700 }), marginTop: 3 },
  leagueName: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  medal: { width: 22, height: 22, marginLeft: -3 },
  xpTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(146,64,14,0.10)',
    overflow: 'hidden',
    marginTop: 6,
  },
  xpFill: { height: '100%', borderRadius: 3, backgroundColor: '#d97706' },
});

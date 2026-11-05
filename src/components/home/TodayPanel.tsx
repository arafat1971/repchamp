import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { CountUp, PopOnChange } from '@/components/motion';
import { PressableScale } from '@/components/ui';
import { CheckIcon, FlameIcon } from '@/components/home/Icons';
import { ProgressRing } from '@/components/home/ProgressRing';
import type { LeagueProgress } from '@/domain/leagueProgress';
import { nextToClose } from '@/domain/nextToClose';
import { isFixableByAthlete, type StepsState } from '@/domain/steps';
import { streakLine } from '@/domain/todayPanel';
import type { WeekCell } from '@/domain/weekStrip';
import { font } from '@/theme/typography';
import { palette, radius, surfaceShadow } from '@/theme/tokens';

const MEDAL_BRONZE = require('../../../assets/medal-bronze.png');

/* Outer to inner; each ring keeps its colour into its row. */
const RINGS = {
  challenge: { from: '#4ADE80', to: '#15803D', track: 'rgba(22,163,74,0.12)', ink: '#15803D' },
  water: { from: '#7DD3FC', to: '#0284C7', track: 'rgba(2,132,199,0.12)', ink: '#0369A1' },
  steps: { from: '#FCD34D', to: '#EA580C', track: 'rgba(234,88,12,0.12)', ink: '#C2410C' },
} as const;

const OUTER = 118;
const THICK = 11;
const GAP = 3;

/**
 * Today and this week as one panel — the progress half of Home.
 *
 * It replaces four cards that each told part of the same story (the week
 * strip, the rings tile, the streak tile and the league tile). One surface,
 * read top to bottom: how today stands (three rings, each beside its own
 * bar), the single next step that closes the nearest ring, then the week as a
 * chain with the streak, and the league as one line. A new athlete sees where
 * they are going rather than a wall of zeros: an unstarted streak says "Day 1
 * starts with one set", an empty league says how far Silver is.
 */
export function TodayPanel({
  challenge,
  water,
  steps,
  streak,
  week,
  daysTrained,
  goal,
  league,
  onChallenge,
  onWater,
  onSteps,
  onFixSteps,
  onWeek,
  onLeague,
}: {
  challenge: { best: number; target: number; percent: number; label: string };
  water: { ml: number; goalMl: number; percent: number };
  steps: StepsState;
  streak: number;
  week: WeekCell[];
  daysTrained: number;
  goal: number;
  league: LeagueProgress;
  onChallenge: () => void;
  onWater: () => void;
  onSteps: () => void;
  onFixSteps: () => void;
  onWeek: () => void;
  onLeague: () => void;
}) {
  const stepsReady = steps.status === 'ready';
  const stepsFixable = steps.status === 'unavailable' && isFixableByAthlete(steps.reason);
  const stepPct = stepsReady ? Math.min(100, Math.round((steps.steps / Math.max(1, steps.goal)) * 100)) : 0;
  const closed = [challenge.percent, water.percent, stepPct].filter((p) => p >= 100).length;
  const next = nextToClose({
    challenge: { best: challenge.best, target: challenge.target, label: challenge.label },
    water,
    steps: stepsReady ? { steps: steps.steps, goal: steps.goal } : null,
  });
  const perfect = next?.kind === 'perfect';
  const nextTone = next?.kind === 'water' ? RINGS.water : next?.kind === 'steps' ? RINGS.steps : RINGS.challenge;
  const onNext = next?.kind === 'water' ? onWater : next?.kind === 'steps' ? onSteps : onChallenge;
  const streakCopy = streakLine(streak, daysTrained, goal);

  return (
    <View style={styles.card}>
      {/* Head: the day's score in words, the streak beside it. */}
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Today</Text>
          <Text style={styles.subtitle}>
            {perfect ? 'Every ring closed' : `${closed} of 3 rings closed`}
          </Text>
        </View>
        <PressableScale
          onPress={onWeek}
          accessibilityRole="button"
          accessibilityLabel={`${streak} day streak`}
          style={[styles.streakChip, streak > 0 && styles.streakChipLive]}
        >
          <PopOnChange trigger={streak}>
            <FlameIcon size={14} color={streak > 0 ? palette.amber500 : palette.grey500} />
          </PopOnChange>
          {streak > 0 ? (
            <CountUp value={streak} style={[styles.streakNum, styles.tabular]} />
          ) : null}
          <Text style={[styles.streakUnit, streak > 0 && { color: '#92400E' }]}>
            {streak > 0 ? (streak === 1 ? 'day' : 'days') : 'No streak yet'}
          </Text>
        </PressableScale>
      </View>

      {/* Body: the rings, each beside its own row. */}
      <View style={styles.body}>
        <PressableScale onPress={onChallenge} accessibilityRole="button" accessibilityLabel={`${closed} of 3 rings closed`}>
          <View style={styles.ringStack}>
            <RingSlot size={OUTER} percent={challenge.percent} tone={RINGS.challenge} />
            <RingSlot size={OUTER - 2 * (THICK + GAP)} percent={water.percent} tone={RINGS.water} />
            <RingSlot size={OUTER - 4 * (THICK + GAP)} percent={stepPct} tone={RINGS.steps} />
            <View style={styles.ringCenter} pointerEvents="none">
              {perfect ? (
                <PopOnChange trigger={closed} style={styles.perfectBadge}>
                  <CheckIcon size={16} color={palette.white} strokeWidth={3} />
                </PopOnChange>
              ) : (
                <Text style={[styles.ringCount, styles.tabular]}>
                  {closed}
                  <Text style={styles.ringOf}>/3</Text>
                </Text>
              )}
            </View>
          </View>
        </PressableScale>

        <View style={styles.rows}>
          <MetricRow
            tone={RINGS.challenge}
            label={challenge.label}
            value={`${challenge.best}/${challenge.target}`}
            fraction={challenge.percent / 100}
            onPress={onChallenge}
          />
          <MetricRow
            tone={RINGS.water}
            label="Water"
            value={`${litres(water.ml)}/${litres(water.goalMl)} L`}
            fraction={water.percent / 100}
            onPress={onWater}
          />
          {stepsReady ? (
            <MetricRow
              tone={RINGS.steps}
              label="Steps"
              value={compact(steps.steps)}
              fraction={stepPct / 100}
              onPress={onSteps}
            />
          ) : (
            <MetricRow
              tone={RINGS.steps}
              label="Steps"
              value={stepsFixable ? 'Turn on' : steps.status === 'loading' ? '…' : '—'}
              valueColor={stepsFixable ? RINGS.steps.ink : palette.grey700}
              fraction={0}
              onPress={stepsFixable ? onFixSteps : onSteps}
            />
          )}
        </View>
      </View>

      {/* The one next step — the goal-gradient nudge. */}
      {next ? (
        <PressableScale
          onPress={onNext}
          accessibilityRole="button"
          style={[styles.next, { backgroundColor: perfect ? palette.green50 : nextTone.track }]}
        >
          <View style={[styles.nextDot, { backgroundColor: perfect ? palette.green600 : nextTone.to }]}>
            {perfect ? <CheckIcon size={10} color={palette.white} strokeWidth={3.2} /> : null}
          </View>
          <Text style={[styles.nextText, { color: perfect ? palette.green700 : nextTone.ink }]} numberOfLines={1}>
            {perfect ? next.text : `Next: ${next.text}`}
          </Text>
          {perfect ? null : <Text style={[styles.nextGo, { color: nextTone.ink }]}>›</Text>}
        </PressableScale>
      ) : null}

      <View style={styles.divider} />

      {/* The week as a chain, with where the weekly goal stands. */}
      <PressableScale onPress={onWeek} accessibilityRole="button" accessibilityLabel={`This week: ${daysTrained} of ${goal} training days`}>
        <View style={styles.weekHead}>
          <Text style={styles.weekLabel}>This week</Text>
          <Text style={styles.weekMeta}>{streakCopy}</Text>
        </View>
        <View style={styles.chain}>
          {week.map((cell, i) => {
            const prev = week[i - 1];
            const nextCell = week[i + 1];
            return (
              <View key={cell.day} style={styles.cell}>
                <View style={styles.dotSlot}>
                  {cell.trained && prev?.trained ? <View style={[styles.link, styles.linkLeft]} /> : null}
                  {cell.trained && nextCell?.trained ? <View style={[styles.link, styles.linkRight]} /> : null}
                  <View
                    style={[
                      styles.dot,
                      cell.trained && styles.dotTrained,
                      cell.isToday && !cell.trained && styles.dotToday,
                      cell.isFuture && styles.dotFuture,
                    ]}
                  >
                    {cell.trained ? <CheckIcon size={11} color={palette.white} strokeWidth={3.2} /> : null}
                  </View>
                </View>
                <Text style={[styles.letter, cell.isToday && styles.letterToday]}>{cell.letter}</Text>
              </View>
            );
          })}
        </View>
      </PressableScale>

      {/* League, as one line. */}
      <PressableScale onPress={onLeague} accessibilityRole="button" accessibilityLabel={`League ${league.title}`} style={styles.league}>
        <Image source={MEDAL_BRONZE} style={styles.medal} contentFit="contain" />
        <View style={{ flex: 1 }}>
          <View style={styles.leagueTop}>
            <Text style={styles.leagueName} numberOfLines={1}>
              {league.title}
            </Text>
            <Text style={[styles.leagueXp, styles.tabular]}>
              {league.nextLeague
                ? `${league.xpToNext.toLocaleString()} XP to ${league.nextLeague.name}`
                : `${league.weeklyXp.toLocaleString()} XP · top league`}
            </Text>
          </View>
          <Bar fraction={Math.max(0.03, league.fill)} color="#D97706" track="rgba(146,64,14,0.10)" delay={350} />
        </View>
      </PressableScale>
    </View>
  );
}

function RingSlot({ size, percent, tone }: { size: number; percent: number; tone: { from: string; to: string; track: string } }) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.ringSlot]} pointerEvents="none">
      <ProgressRing percent={percent} size={size} thickness={THICK} from={tone.from} to={tone.to} track={tone.track} />
    </View>
  );
}

function MetricRow({
  tone,
  label,
  value,
  valueColor = palette.ink,
  fraction,
  onPress,
}: {
  tone: { to: string; track: string };
  label: string;
  value: string;
  valueColor?: string;
  fraction: number;
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label} ${value}`}>
      <View style={styles.rowTop}>
        <View style={[styles.rowDot, { backgroundColor: tone.to }]} />
        <Text style={styles.rowLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.rowValue, styles.tabular, { color: valueColor }]} numberOfLines={1}>
          {value}
        </Text>
      </View>
      <Bar fraction={fraction} color={tone.to} track={tone.track} delay={150} />
    </PressableScale>
  );
}

/** A thin capsule that fills on mount — width only, measured in points. */
function Bar({ fraction, color, track, delay }: { fraction: number; color: string; track: string; delay: number }) {
  const [width, setWidth] = useState(0);
  const w = useSharedValue(0);
  const target = Math.max(0, Math.min(1, fraction)) * width;
  useEffect(() => {
    w.value = withDelay(delay, withTiming(target, { duration: 700, easing: Easing.bezier(0.23, 1, 0.32, 1) }));
  }, [target, delay, w]);
  const fill = useAnimatedStyle(() => ({ width: w.value }));
  return (
    <View style={[styles.barTrack, { backgroundColor: track }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Animated.View style={[styles.barFill, { backgroundColor: color }, fill]} />
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

const DOT = 26;

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    borderRadius: radius['4xl'],
    borderCurve: 'continuous',
    padding: 16,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
    ...surfaceShadow,
  },
  tabular: { fontVariant: ['tabular-nums'] },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { ...font('extrabold', 18, { color: palette.ink }), letterSpacing: -0.3 },
  subtitle: font('medium', 12.5, { color: palette.grey700, marginTop: 1 }),
  streakChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.canvas,
  },
  streakChipLive: { backgroundColor: '#FEF3C7' },
  streakNum: font('extrabold', 15, { color: '#92400E' }),
  streakUnit: font('semibold', 12, { color: palette.grey700 }),
  body: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 14 },
  ringStack: { width: OUTER, height: OUTER },
  ringSlot: { alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  ringCount: font('extrabold', 17, { color: palette.ink }),
  ringOf: font('bold', 12, { color: palette.grey700 }),
  perfectBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.green600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rows: { flex: 1, gap: 12 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  rowDot: { width: 8, height: 8, borderRadius: 4 },
  rowLabel: { ...font('semibold', 13, { color: palette.grey700 }), flex: 1 },
  rowValue: font('extrabold', 13.5),
  barTrack: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 5 },
  barFill: { height: '100%', borderRadius: 3 },
  next: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 14,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 12,
    borderCurve: 'continuous',
  },
  nextDot: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  nextText: { ...font('bold', 13), flex: 1 },
  nextGo: font('extrabold', 18, { marginTop: -2 }),
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.border, marginVertical: 14 },
  weekHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  weekLabel: font('bold', 13, { color: palette.ink }),
  weekMeta: font('semibold', 12, { color: palette.grey700 }),
  chain: { flexDirection: 'row', marginTop: 10 },
  cell: { flex: 1, alignItems: 'center' },
  dotSlot: { width: '100%', height: DOT, alignItems: 'center', justifyContent: 'center' },
  link: { position: 'absolute', height: 6, top: (DOT - 6) / 2, backgroundColor: palette.green500 },
  linkLeft: { left: 0, right: '50%' },
  linkRight: { left: '50%', right: 0 },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: palette.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotTrained: { backgroundColor: palette.green500 },
  dotToday: { backgroundColor: palette.white, borderWidth: 2, borderColor: palette.green500 },
  dotFuture: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: palette.border, borderStyle: 'dashed' },
  letter: font('semibold', 11, { color: palette.grey500, marginTop: 5 }),
  letterToday: { color: palette.ink, fontWeight: '800' },
  league: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  medal: { width: 28, height: 28 },
  leagueTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  leagueName: font('extrabold', 13.5, { color: palette.ink }),
  leagueXp: font('semibold', 12, { color: '#92400E' }),
});

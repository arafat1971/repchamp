import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ProgressRing } from '@/components/connected/ProgressRing';
import { CountUp } from '@/components/motion';
import { CheckIcon, FlameIcon } from '@/components/home/Icons';
import type { WeekReps } from '@/domain/weekReps';
import { font, scaleForRole } from '@/theme/typography';
import { gradients, palette, radius } from '@/theme/tokens';

/**
 * Train's lead card, on the deep-emerald look the daily and bond screens share:
 * a ring for training days against the weekly goal, this week's reps beside it
 * with the comparison to last week, and the seven days as a row of dots.
 * It answers "how am I doing this week?" before any practice row asks for more.
 */
export function WeekRepsCard({
  week,
  daysTrained,
  goal,
  streak,
}: {
  week: WeekReps;
  daysTrained: number;
  goal: number;
  streak: number;
}) {
  const diff = week.total - week.lastWeekTotal;
  const delta =
    week.lastWeekTotal === 0
      ? week.total > 0
        ? 'First week on the board'
        : 'Your week starts with one set'
      : diff === 0
        ? 'Level with last week'
        : `${diff > 0 ? '+' : '−'}${Math.abs(diff).toLocaleString()} vs last week`;
  const [picked, setPicked] = useState<string | null>(null);
  const pickedDay = week.days.find((d) => d.day === picked) ?? null;
  const hit = daysTrained >= goal;
  const percent = goal > 0 ? (daysTrained / goal) * 100 : 0;

  return (
    <LinearGradient
      colors={gradients.heroEmerald}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
      accessibilityLabel={`${week.total} reps this week, ${daysTrained} of ${goal} days trained. ${delta}`}
    >
      <View style={styles.glow} pointerEvents="none" />

      <View style={styles.top}>
        <ProgressRing
          percent={percent}
          size={104}
          stroke={10}
          color={hit ? palette.amber300 : palette.green400}
        >
          <Text style={styles.ringValue}>
            {daysTrained}
            <Text style={styles.ringGoal}>/{goal}</Text>
          </Text>
          <Text style={styles.ringLabel}>days</Text>
        </ProgressRing>

        <View style={styles.stats}>
          <Text style={styles.eyebrow} {...scaleForRole('control')}>
            REPS THIS WEEK
          </Text>
          <CountUp value={week.total} style={styles.total} />
          <Text style={styles.delta} numberOfLines={2}>
            {hit ? `Weekly goal hit · ${delta}` : delta}
          </Text>
        </View>

        {streak > 0 ? (
          <View style={styles.streak} accessibilityLabel={`${streak} day streak`}>
            <FlameIcon size={14} color={palette.amber300} />
            <Text style={styles.streakText}>{streak}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.days}>
        {week.days.map((d) => (
          <Pressable
            key={d.day}
            style={styles.dayCol}
            accessibilityRole="button"
            accessibilityLabel={`${d.letter}, ${d.reps} reps`}
            onPress={() => {
              void Haptics.selectionAsync();
              setPicked((cur) => (cur === d.day ? null : d.day));
            }}
          >
            <View
              style={[
                styles.dot,
                d.reps > 0 && styles.dotOn,
                d.isToday && styles.dotToday,
                d.isFuture && styles.dotFuture,
                picked === d.day && styles.dotPicked,
              ]}
            >
              {d.reps > 0 ? <CheckIcon size={12} color={palette.green900} strokeWidth={3} /> : null}
            </View>
            <Text style={[styles.letter, d.isToday && styles.letterToday]}>{d.letter}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.pickLine}>
        {pickedDay
          ? pickedDay.reps > 0
            ? `${pickedDay.reps.toLocaleString()} reps on ${pickedDay.isToday ? 'today' : 'this day'}`
            : pickedDay.isFuture
              ? 'Still to come'
              : 'Rest day — no reps logged'
          : 'Tap a day to see its reps'}
      </Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius['6xl'],
    padding: 18,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    top: -70,
    right: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(74,222,128,0.10)',
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  ringValue: { ...font('extrabold', 28, { color: palette.white }), fontVariant: ['tabular-nums'] },
  ringGoal: font('bold', 15, { color: 'rgba(255,255,255,0.6)' }),
  ringLabel: font('semibold', 11.5, { color: 'rgba(255,255,255,0.65)' }),
  stats: { flex: 1 },
  eyebrow: { ...font('extrabold', 11, { color: 'rgba(255,255,255,0.65)' }), letterSpacing: 1 },
  total: {
    ...font('extrabold', 40, { color: palette.white }),
    fontVariant: ['tabular-nums'],
    letterSpacing: -1.5,
  },
  delta: font('semibold', 12.5, { color: palette.green300 }),
  streak: {
    position: 'absolute',
    top: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(251,191,36,0.16)',
  },
  streakText: { ...font('extrabold', 13, { color: palette.amber300 }), fontVariant: ['tabular-nums'] },

  days: {
    flexDirection: 'row',
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  dayCol: { flex: 1, alignItems: 'center', gap: 6 },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  dotOn: { backgroundColor: palette.green400 },
  dotToday: { borderWidth: 2, borderColor: palette.white },
  dotPicked: { transform: [{ scale: 1.18 }] },
  pickLine: { ...font('semibold', 12, { color: 'rgba(255,255,255,0.6)' }), textAlign: 'center', marginTop: 10 },
  dotFuture: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)' },
  letter: font('bold', 11.5, { color: 'rgba(255,255,255,0.55)' }),
  letterToday: { color: palette.white },
});

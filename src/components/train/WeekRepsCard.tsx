import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { CountUp } from '@/components/motion';
import { FlameIcon } from '@/components/home/Icons';
import type { WeekReps } from '@/domain/weekReps';
import { font, scaleForRole } from '@/theme/typography';
import { palette, radius, surfaceShadow } from '@/theme/tokens';

const BAR_MAX = 76;
const BAR_MIN = 8;

/**
 * Train's lead card: this week's reps as seven bars, Monday to Sunday, with the
 * total and how it compares to last week. It answers the question the tab is
 * opened with — "how am I doing this week?" — before any practice tile asks
 * the athlete to do more.
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
  const up = week.lastWeekTotal === 0 ? week.total > 0 : diff > 0;

  return (
    <View
      style={styles.card}
      accessibilityLabel={`${week.total} reps this week, ${daysTrained} of ${goal} days trained. ${delta}`}
    >
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(34,197,94,0.14)', 'rgba(34,197,94,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.8 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow} {...scaleForRole('control')}>
            REPS THIS WEEK
          </Text>
          <View style={styles.totalRow}>
            <CountUp value={week.total} style={styles.total} />
            <View style={[styles.deltaChip, up ? styles.deltaUp : styles.deltaFlat]}>
              <Text
                numberOfLines={1}
                style={font('bold', 11.5, { color: up ? palette.green700 : palette.grey600 })}
              >
                {delta}
              </Text>
            </View>
          </View>
        </View>
        {streak > 0 ? (
          <View style={styles.streak} accessibilityLabel={`${streak} day streak`}>
            <FlameIcon size={15} color={palette.amber600} />
            <Text style={styles.streakText}>{streak}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.chart}>
        {week.days.map((d) => {
          const h = d.reps > 0 ? Math.max(BAR_MIN, Math.round((d.reps / week.peak) * BAR_MAX)) : BAR_MIN;
          return (
            <View key={d.day} style={styles.col}>
              <Text style={[styles.value, d.reps === 0 && { opacity: 0 }]} numberOfLines={1}>
                {d.reps}
              </Text>
              <View style={styles.track}>
                <View
                  style={[
                    styles.bar,
                    { height: h },
                    d.reps > 0
                      ? d.isToday
                        ? styles.barToday
                        : styles.barDone
                      : d.isFuture
                        ? styles.barFuture
                        : styles.barEmpty,
                  ]}
                />
              </View>
              <Text style={[styles.letter, d.isToday && styles.letterToday]}>{d.letter}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.goalRow}>
        <View style={styles.pips}>
          {Array.from({ length: Math.max(goal, 1) }, (_, i) => (
            <View key={i} style={[styles.pip, i < daysTrained && styles.pipOn]} />
          ))}
        </View>
        <Text style={styles.goalText}>
          {daysTrained >= goal ? 'Weekly goal hit' : `${daysTrained} of ${goal} training days`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius['4xl'],
    padding: 16,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
    overflow: 'hidden',
    ...surfaceShadow,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  eyebrow: { ...font('extrabold', 11.5, { color: palette.grey600 }), letterSpacing: 1 },
  totalRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  total: { ...font('extrabold', 40, { color: palette.ink }), fontVariant: ['tabular-nums'], letterSpacing: -1.5 },
  deltaChip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill },
  deltaUp: { backgroundColor: palette.green50 },
  deltaFlat: { backgroundColor: palette.divider },
  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: palette.amber50,
  },
  streakText: { ...font('extrabold', 14, { color: palette.amber800 }), fontVariant: ['tabular-nums'] },

  chart: { flexDirection: 'row', gap: 8, marginTop: 14 },
  col: { flex: 1, alignItems: 'center' },
  value: { ...font('bold', 10.5, { color: palette.grey600 }), fontVariant: ['tabular-nums'], marginBottom: 4 },
  track: { height: BAR_MAX, width: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: '70%', maxWidth: 30, borderRadius: 8 },
  barToday: { backgroundColor: palette.green500 },
  barDone: { backgroundColor: palette.green300 },
  barEmpty: { backgroundColor: palette.divider },
  barFuture: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: palette.divider, borderStyle: 'dashed' },
  letter: { ...font('bold', 12, { color: palette.grey500 }), marginTop: 6 },
  letterToday: { color: palette.green700 },

  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: palette.divider,
  },
  pips: { flexDirection: 'row', gap: 4 },
  pip: { width: 18, height: 6, borderRadius: 3, backgroundColor: palette.divider },
  pipOn: { backgroundColor: palette.green500 },
  goalText: font('semibold', 12.5, { color: palette.grey600 }),
});

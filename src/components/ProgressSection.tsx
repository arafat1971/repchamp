import { useMemo } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { BarChart } from '@/components/charts/BarChart';
import { ExerciseGlyph } from '@/components/ExerciseGlyph';
import { Card } from '@/components/ui';
import { exerciseProgress } from '@/domain/progressProof';
import { consistencyGrid, weekComparison, type GridCell } from '@/domain/progressSummary';
import type { SessionSummary } from '@/state/profileStore';
import { getExercise } from '@/vision/exercises';
import { font } from '@/theme/typography';
import { palette, radius, SCREEN_GUTTER } from '@/theme/tokens';

const SHADE: Record<GridCell['level'], string> = {
  0: '#eef1ee',
  1: '#bbf7d0',
  2: '#86efac',
  3: '#22c55e',
  4: '#15803d',
};

/**
 * Progress over time, on the Profile tab.
 *
 * The stat tiles above it are totals — they only ever go up, so they cannot
 * say whether this week was better than last or whether the athlete is
 * actually getting stronger. This section answers exactly those three
 * questions, and says nothing it cannot back up:
 * - this week against last, with a percentage only when last week is a fair
 *   baseline;
 * - twelve weeks of days, shaded against the athlete's own training;
 * - per-exercise gains from `exerciseProgress`, which only reports a genuine
 *   improvement over at least three sessions.
 */
export function ProgressSection({ sessions }: { sessions: readonly SessionSummary[] }) {
  const { width } = useWindowDimensions();
  const week = useMemo(() => weekComparison(sessions), [sessions]);
  const grid = useMemo(() => consistencyGrid(sessions), [sessions]);
  const gains = useMemo(() => exerciseProgress(sessions).slice(0, 3), [sessions]);

  const activeDays = grid.flat().filter((c) => c.level > 0).length;
  /* Twelve columns across the card's inner width, with 4pt gaps. */
  const inner = width - SCREEN_GUTTER * 2 - 32;
  const cell = Math.floor((inner - 11 * 4) / 12);

  const delta = week.deltaPct;

  return (
    <View style={{ gap: 12 }}>
      {/* ── This week ── */}
      <Animated.View entering={FadeInDown.duration(320)}>
        <Card style={styles.card}>
          <Text style={styles.eyebrow}>This week</Text>
          <View style={styles.weekHead}>
            <Text style={styles.big}>
              {week.thisWeek.toLocaleString()}
              <Text style={styles.bigUnit}> reps</Text>
            </Text>
            {delta != null && delta >= 0 ? (
              <View style={[styles.delta, styles.deltaUp]}>
                <Text style={[styles.deltaText, { color: palette.green700 }]}>▲ {delta}%</Text>
              </View>
            ) : null}
          </View>
          {/* Behind last week is stated as a target, never a red percentage:
              the week is still running, and "▼ 100%" on a Thursday is both
              untrue and the fastest way to make someone close the app. */}
          <Text style={styles.sub}>
            {delta == null
              ? week.thisWeek > 0
                ? 'Your first week on the board — next week gets a comparison'
                : 'No reps yet this week — a set today starts the chart'
              : delta >= 0
                ? `vs ${week.lastWeek.toLocaleString()} last week`
                : `${(week.lastWeek - week.thisWeek).toLocaleString()} reps to beat last week’s ${week.lastWeek.toLocaleString()}`}
          </Text>
          <View style={{ marginTop: 14 }}>
            <BarChart
              data={week.days}
              labels={week.labels}
              height={110}
              color={palette.green300}
              highlightColor={palette.green600}
              highlightIndex={week.todayIndex}
            />
          </View>
        </Card>
      </Animated.View>

      {/* ── Consistency ── */}
      <Animated.View entering={FadeInDown.delay(80).duration(320)}>
        <Card style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.eyebrow}>Consistency</Text>
            <Text style={styles.meta}>
              {activeDays} active {activeDays === 1 ? 'day' : 'days'} · 12 weeks
            </Text>
          </View>
          <View style={[styles.grid, { gap: 4 }]}>
            {grid.map((col, w) => (
              <View key={w} style={{ gap: 4 }}>
                {col.map((c) => (
                  <View
                    key={c.day}
                    style={[
                      { width: cell, height: cell, borderRadius: Math.max(3, cell * 0.28) },
                      c.isFuture
                        ? styles.future
                        : { backgroundColor: SHADE[c.level] },
                    ]}
                  />
                ))}
              </View>
            ))}
          </View>
          <View style={styles.legend}>
            <Text style={styles.meta}>Less</Text>
            {([0, 1, 2, 3, 4] as const).map((l) => (
              <View key={l} style={[styles.legendCell, { backgroundColor: SHADE[l] }]} />
            ))}
            <Text style={styles.meta}>More</Text>
          </View>
        </Card>
      </Animated.View>

      {/* ── Getting stronger ── */}
      <Animated.View entering={FadeInDown.delay(160).duration(320)}>
        <Card style={styles.card}>
          <Text style={styles.eyebrow}>Getting stronger</Text>
          {gains.length === 0 ? (
            <Text style={[styles.sub, { marginTop: 8 }]}>
              Train a movement three times and your best set here will show how far you have come.
            </Text>
          ) : (
            gains.map((g, i) => {
              const label = getExercise(g.exercise as never)?.label ?? g.exercise;
              return (
                <View key={g.exercise} style={[styles.gainRow, i > 0 && styles.gainDivider]}>
                  <View style={styles.glyph}>
                    <ExerciseGlyph exercise={g.exercise} size={26} color={palette.green700} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.gainName}>{label}</Text>
                    <Text style={styles.gainPath}>
                      Best set {g.firstBest} <Text style={styles.arrow}>→</Text>{' '}
                      <Text style={styles.gainNow}>{g.currentBest}</Text> reps
                    </Text>
                  </View>
                  <View style={[styles.delta, styles.deltaUp]}>
                    <Text style={[styles.deltaText, { color: palette.green700 }]}>+{g.percentGain}%</Text>
                  </View>
                </View>
              );
            })
          )}
        </Card>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16 },
  eyebrow: font('semibold', 14, { color: palette.slate500 }),
  weekHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  big: { ...font('extrabold', 34, { color: palette.ink }), letterSpacing: -0.8 },
  bigUnit: font('bold', 16, { color: palette.slate500 }),
  sub: { ...font('medium', 12.5, { color: palette.slate500 }), marginTop: 2 },
  delta: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  deltaUp: { backgroundColor: palette.green50 },
  deltaText: font('extrabold', 12.5),
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  meta: font('medium', 11.5, { color: palette.slate500 }),
  grid: { flexDirection: 'row', marginTop: 12 },
  future: { borderWidth: 1, borderColor: '#e6eae4', backgroundColor: 'transparent' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12, alignSelf: 'flex-end' },
  legendCell: { width: 11, height: 11, borderRadius: 3 },
  gainRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  gainDivider: { borderTopWidth: 1, borderTopColor: palette.divider },
  glyph: {
    width: 42,
    height: 42,
    borderRadius: radius.lg,
    backgroundColor: palette.green50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gainName: font('extrabold', 14.5, { color: palette.ink }),
  gainPath: { ...font('medium', 12.5, { color: palette.slate500 }), marginTop: 2 },
  arrow: font('bold', 12.5, { color: palette.green600 }),
  gainNow: font('extrabold', 12.5, { color: palette.ink }),
});

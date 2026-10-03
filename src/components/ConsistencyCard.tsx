import { Image } from 'expo-image';
import { useMemo } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { HomeCard } from '@/components/ui/HomeCard';
import { consistencyFor, type StreakState } from '@/domain/consistency';
import { consistencyGrid, type GridCell } from '@/domain/progressSummary';
import { pluralise } from '@/domain/plural';
import { weekStrip } from '@/domain/weekStrip';
import { selectBestStreak, useProfileStore, type SessionSummary } from '@/state/profileStore';
import { font } from '@/theme/typography';
import { palette, radius, SCREEN_GUTTER } from '@/theme/tokens';

const FLAME = require('../../assets/fire-flame.png');

const SHADE: Record<GridCell['level'], string> = {
  0: '#eef1ee',
  1: '#bbf7d0',
  2: '#86efac',
  3: '#22c55e',
  4: '#15803d',
};

const STATE_TONE: Record<StreakState, { bg: string; fg: string; chip: string }> = {
  start: { bg: palette.divider, fg: palette.grey600, chip: 'Day one' },
  safe: { bg: palette.green50, fg: palette.green700, chip: 'Safe today' },
  open: { bg: palette.green50, fg: palette.green700, chip: 'Rest day OK' },
  'at-risk': { bg: palette.amber50, fg: palette.amber800, chip: 'Train today' },
};

/**
 * Consistency, answered as a question the athlete is asking: "am I on track,
 * and what do I do today?"
 *
 * The streak leads, with a status that is only ever as urgent as the streak
 * rules make it (see `domain/consistency`). Under it, the next milestone and
 * this week's goal give two small targets that are always within reach; the
 * twelve-week grid then shows the pattern those days add up to, and three
 * readings — best streak, last 28 days, favourite day — say what the pattern
 * means. Every number comes from real sessions.
 */
export function ConsistencyCard({ sessions }: { sessions: readonly SessionSummary[] }) {
  const { width } = useWindowDimensions();
  const goal = useProfileStore((s) => s.weeklyGoal);
  const best = useProfileStore(selectBestStreak);

  const days = useMemo(() => sessions.map((s) => s.day), [sessions]);
  const c = useMemo(() => consistencyFor(days, goal), [days, goal]);
  const grid = useMemo(() => consistencyGrid(sessions), [sessions]);
  const week = useMemo(() => weekStrip(days), [days]);
  const activeDays = useMemo(() => grid.flat().filter((cell) => cell.level > 0).length, [grid]);

  const tone = STATE_TONE[c.state];
  /* Twelve columns across the card's inner width, with 4pt gaps. */
  const inner = width - SCREEN_GUTTER * 2 - 32;
  const cell = Math.floor((inner - 11 * 4) / 12);
  const goalHit = c.daysThisWeek >= goal;

  return (
    <HomeCard style={styles.card}>
      <View style={styles.top}>
        <View style={[styles.flameWrap, { backgroundColor: tone.bg }]}>
          <Image source={FLAME} style={styles.flame} contentFit="contain" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>Consistency</Text>
          <Text style={styles.headline} accessibilityRole="header">
            {c.headline}
          </Text>
        </View>
        <View style={[styles.chip, { backgroundColor: tone.bg }]}>
          <Text style={[styles.chipText, { color: tone.fg }]}>{tone.chip}</Text>
        </View>
      </View>
      <Text style={styles.line}>{c.line}</Text>

      {c.milestone ? (
        <View style={styles.block} accessibilityLabel={`${pluralise(c.milestone.daysToGo, 'day')} to a ${c.milestone.target} day streak`}>
          <View style={styles.rowBetween}>
            <Text style={styles.blockLabel}>Next milestone · {c.milestone.target} days</Text>
            <Text style={styles.blockValue}>{c.milestone.daysToGo} to go</Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round(c.milestone.fraction * 100)}%` }]} />
          </View>
        </View>
      ) : null}

      <View style={styles.block}>
        <View style={styles.rowBetween}>
          <Text style={styles.blockLabel}>This week</Text>
          <Text style={[styles.blockValue, goalHit && { color: palette.green700 }]}>
            {goalHit ? 'Goal hit' : `${c.daysThisWeek} of ${goal} days`}
          </Text>
        </View>
        <View style={styles.weekRow}>
          {week.map((d) => (
            <View key={d.day} style={styles.dayCol}>
              <View
                style={[
                  styles.dayDot,
                  d.trained && styles.dayDotOn,
                  d.isToday && !d.trained && styles.dayDotToday,
                ]}
              >
                {d.trained ? <Text style={styles.dayTick}>✓</Text> : null}
              </View>
              <Text style={[styles.dayLabel, d.isToday && styles.dayLabelToday]}>{d.letter}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.rowBetween}>
        <Text style={styles.blockLabel}>Last 12 weeks</Text>
        <Text style={styles.meta}>
          {activeDays} active {activeDays === 1 ? 'day' : 'days'}
        </Text>
      </View>
      <View style={[styles.grid, { gap: 4 }]}>
        {grid.map((col, w) => (
          <View key={w} style={{ gap: 4 }}>
            {col.map((g) => (
              <View
                key={g.day}
                style={[
                  { width: cell, height: cell, borderRadius: Math.max(3, cell * 0.28) },
                  g.isFuture ? styles.future : { backgroundColor: SHADE[g.level] },
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

      <View style={styles.stats}>
        <Stat value={`${Math.max(best, c.streak)}`} label="Best streak" unit={Math.max(best, c.streak) === 1 ? 'day' : 'days'} />
        <Stat value={`${c.last28.pct}%`} label="Last 28 days" />
        <Stat value={c.favouriteDay ? c.favouriteDay.slice(0, 3) : '—'} label="Favourite day" />
      </View>
    </HomeCard>
  );
}

function Stat({ value, label, unit }: { value: string; label: string; unit?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>
        {value}
        {unit ? <Text style={styles.statUnit}> {unit}</Text> : null}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flameWrap: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  flame: { width: 28, height: 28 },
  eyebrow: font('semibold', 12.5, { color: palette.grey600 }),
  headline: { ...font('extrabold', 22, { color: palette.ink }), letterSpacing: -0.6 },
  chip: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: font('extrabold', 11.5),
  line: { ...font('medium', 13, { color: palette.grey600 }), marginTop: 10, lineHeight: 18 },

  block: { marginTop: 16 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  blockLabel: font('bold', 12.5, { color: palette.ink }),
  blockValue: font('extrabold', 12.5, { color: palette.grey600 }),
  track: { height: 8, borderRadius: 4, backgroundColor: palette.divider, marginTop: 8, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: palette.amber500 },

  weekRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  dayCol: { flex: 1, alignItems: 'center', gap: 6 },
  dayDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: palette.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayDotOn: { backgroundColor: palette.green500 },
  dayDotToday: { backgroundColor: palette.white, borderWidth: 2.5, borderColor: palette.green500 },
  dayTick: font('extrabold', 13, { color: palette.white }),
  dayLabel: font('bold', 11, { color: palette.grey500 }),
  dayLabelToday: { color: palette.green700 },

  divider: { height: 1, backgroundColor: palette.divider, marginVertical: 16 },
  meta: font('medium', 11.5, { color: palette.grey600 }),
  grid: { flexDirection: 'row', marginTop: 10 },
  future: { borderWidth: 1, borderColor: '#e6eae4', backgroundColor: 'transparent' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, alignSelf: 'flex-end' },
  legendCell: { width: 11, height: 11, borderRadius: 3 },

  stats: {
    flexDirection: 'row',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: palette.divider,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { ...font('extrabold', 18, { color: palette.ink }), fontVariant: ['tabular-nums'] },
  statUnit: font('bold', 11, { color: palette.grey500 }),
  statLabel: { ...font('bold', 11, { color: palette.grey500 }), marginTop: 2 },
});

import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Card } from '@/components/ui';
import { ME, THEM } from '@/components/together/RitualCard';
import { trendLine, type RitualWeek } from '@/domain/ritual';
import { nextOutfit } from '@/domain/waterWidget';
import { weekdayIndex } from '@/domain/week';
import { font } from '@/theme/typography';
import { palette } from '@/theme/tokens';

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const BAR_H = 56;

/**
 * The last seven days: a pair of bars per day (mine, theirs), a mark over a
 * day we both finished, and the direction I am heading against the week
 * before — then the water streak and what it unlocks next, which used to be
 * its own loud card and is simply a row of the same story.
 */
export function RitualWeekCard({
  week,
  total,
  name,
  streak,
}: {
  week: RitualWeek;
  total: number;
  name: string;
  /** Days in a row both water goals were met. */
  streak: number;
}) {
  const up = !!week.trend && week.trend.now - week.trend.before >= 0.3;
  const next = nextOutfit(streak);
  return (
    <Card style={styles.card}>
      <View style={styles.chart}>
        {week.days.map((d, i) => {
          const today = i === week.days.length - 1;
          return (
            <View key={d.day} style={styles.col}>
              <View style={[styles.mark, d.perfect && styles.markOn]} />
              <View style={styles.bars}>
                <Bar value={d.me} total={total} color={ME} delay={i * 40} />
                <Bar value={d.them} total={total} color={THEM} delay={i * 40 + 20} />
              </View>
              <Text style={[styles.letter, today && styles.letterToday]}>{LETTERS[weekdayIndex(d.day)]}</Text>
            </View>
          );
        })}
      </View>
      <View style={styles.legend}>
        <Key color={ME} label="You" />
        <Key color={THEM} label={name} />
        <View style={styles.keyItem}>
          <View style={[styles.mark, styles.markOn, styles.markKey]} />
          <Text style={styles.keyLabel}>Perfect day</Text>
        </View>
      </View>
      <Text style={[styles.trend, up && styles.trendUp]}>{trendLine(week.trend)}</Text>

      <View style={styles.rule} />
      <View style={styles.streakRow}>
        <View style={styles.streakCopy}>
          <Text style={styles.streakTitle}>Water streak</Text>
          <Text style={styles.streakHint}>
            {next ? `${next.label} for both bears at ${next.days} days` : 'Every outfit earned'}
          </Text>
        </View>
        <Text style={styles.streakValue}>
          {streak}
          <Text style={styles.streakUnit}> {streak === 1 ? 'day' : 'days'}</Text>
        </Text>
      </View>
      {next ? (
        <View style={styles.unlockTrack}>
          <View style={[styles.unlockFill, { width: `${Math.max(3, Math.round((streak / next.days) * 100))}%` }]} />
        </View>
      ) : null}
    </Card>
  );
}

function Bar({ value, total, color, delay }: { value: number; total: number; color: string; delay: number }) {
  const h = value > 0 ? Math.max(4, Math.round((value / total) * BAR_H)) : 0;
  return (
    <View style={styles.track}>
      {h > 0 ? <Animated.View entering={FadeIn.delay(delay).duration(360)} style={[styles.fill, { height: h, backgroundColor: color }]} /> : null}
    </View>
  );
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.keyItem}>
      <View style={[styles.keyDot, { backgroundColor: color }]} />
      <Text style={styles.keyLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 18 },
  chart: { flexDirection: 'row', justifyContent: 'space-between' },
  col: { flex: 1, alignItems: 'center' },
  mark: { width: 6, height: 6, borderRadius: 3, marginBottom: 6, backgroundColor: 'transparent' },
  markOn: { backgroundColor: palette.green500 },
  markKey: { marginBottom: 0 },
  bars: { flexDirection: 'row', gap: 3, height: BAR_H, alignItems: 'flex-end' },
  track: { width: 8, height: BAR_H, justifyContent: 'flex-end', borderRadius: 4, backgroundColor: palette.track, overflow: 'hidden' },
  fill: { width: 8, borderRadius: 4 },
  letter: { marginTop: 6, ...font('semibold', 11, { color: palette.grey500 }) },
  letterToday: { color: palette.ink },
  legend: { flexDirection: 'row', gap: 14, marginTop: 12, flexWrap: 'wrap' },
  keyItem: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  keyDot: { width: 8, height: 8, borderRadius: 4 },
  keyLabel: font('medium', 12, { color: palette.slate500 }),
  trend: { marginTop: 10, ...font('semibold', 14, { color: palette.slate500 }) },
  trendUp: { color: palette.green700 },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: palette.divider, marginVertical: 14 },
  streakRow: { flexDirection: 'row', alignItems: 'center' },
  streakCopy: { flex: 1 },
  streakTitle: font('semibold', 15, { color: palette.ink }),
  streakHint: { ...font('regular', 12, { color: palette.slate500 }), marginTop: 1 },
  streakValue: font('extrabold', 22, { color: palette.ink }),
  streakUnit: font('semibold', 13, { color: palette.slate500 }),
  unlockTrack: { marginTop: 10, height: 4, borderRadius: 2, backgroundColor: palette.track, overflow: 'hidden' },
  unlockFill: { height: 4, borderRadius: 2, backgroundColor: palette.ink },
});

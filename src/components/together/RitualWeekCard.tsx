import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Card } from '@/components/ui';
import { trendLine, type RitualWeek } from '@/domain/ritual';
import { weekdayIndex } from '@/domain/week';
import { font, text } from '@/theme/typography';
import { palette } from '@/theme/tokens';

const ME = palette.purple500;
const THEM = palette.amber500;
const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const BAR_H = 64;

/**
 * The last seven days of the ritual as pairs of bars — mine and theirs, a
 * star over a day we both finished — with how many perfect days that made
 * and whether I am doing better than the week before. The point of a daily
 * routine is the direction it takes you, so this is where the direction shows.
 */
export function RitualWeekCard({ week, total, name }: { week: RitualWeek; total: number; name: string }) {
  const up = week.trend && week.trend.now - week.trend.before >= 0.3;
  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <View style={styles.headCopy}>
          <Text style={styles.big}>
            {week.perfectDays}
            <Text style={styles.bigUnit}> perfect {week.perfectDays === 1 ? 'day' : 'days'}</Text>
          </Text>
          <Text style={[text.caption, styles.sub]}>in the last 7, both of you, all {total}</Text>
        </View>
        {week.perfectDays > 0 ? <Text style={styles.trophy}>🏆</Text> : null}
      </View>

      <View style={styles.chart}>
        {week.days.map((d, i) => {
          const today = i === week.days.length - 1;
          return (
            <View key={d.day} style={styles.col}>
              <Text style={[styles.star, !d.perfect && styles.hidden]}>⭐</Text>
              <View style={styles.bars}>
                <Bar value={d.me} total={total} color={ME} delay={i * 50} />
                <Bar value={d.them} total={total} color={THEM} delay={i * 50 + 25} />
              </View>
              <Text style={[styles.letter, today && styles.letterToday]}>{today ? 'Today' : LETTERS[weekdayIndex(d.day)]}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.legend}>
        <Dot color={ME} label="You" />
        <Dot color={THEM} label={name} />
      </View>
      <Text style={[styles.trend, up && styles.trendUp]}>{trendLine(week.trend)}</Text>
    </Card>
  );
}

function Bar({ value, total, color, delay }: { value: number; total: number; color: string; delay: number }) {
  const h = Math.max(3, Math.round((value / total) * BAR_H));
  return (
    <View style={styles.track}>
      <Animated.View entering={FadeIn.delay(delay).duration(400)} style={[styles.fill, { height: h, backgroundColor: value > 0 ? color : palette.track }]} />
    </View>
  );
}

function Dot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.dotItem}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[text.caption, styles.dotLabel]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16 },
  head: { flexDirection: 'row', alignItems: 'center' },
  headCopy: { flex: 1 },
  big: { ...font('extrabold', 26, { color: palette.ink }) },
  bigUnit: { ...font('bold', 15, { color: palette.slate500 }) },
  sub: { color: palette.slate500, marginTop: 2 },
  trophy: { fontSize: 32 },
  chart: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  col: { flex: 1, alignItems: 'center' },
  star: { fontSize: 12, height: 16 },
  hidden: { opacity: 0 },
  bars: { flexDirection: 'row', gap: 3, height: BAR_H, alignItems: 'flex-end' },
  track: { width: 9, height: BAR_H, justifyContent: 'flex-end', borderRadius: 5, backgroundColor: palette.divider, overflow: 'hidden' },
  fill: { width: 9, borderRadius: 5 },
  letter: { marginTop: 6, ...font('bold', 11, { color: palette.slate500 }) },
  letterToday: { color: palette.ink },
  legend: { flexDirection: 'row', gap: 16, marginTop: 12 },
  dotItem: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotLabel: { color: palette.slate500 },
  trend: { marginTop: 10, ...font('bold', 14, { color: palette.slate500 }) },
  trendUp: { color: palette.green700 },
});

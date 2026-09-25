import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import type { Journey } from '@/domain/ritual';
import { pluralise } from '@/domain/plural';
import { font } from '@/theme/typography';
import { palette } from '@/theme/tokens';

/**
 * The long view of the ritual: thirty days as a heatmap of how much of it the
 * two of you did together, the perfect days so far, and — once there is a
 * first week and a latest one — how far your own day has come.
 */
export function JourneyCard({ journey, total }: { journey: Journey; total: number }) {
  const max = total * 2;
  const rows = [journey.days.slice(0, 10), journey.days.slice(10, 20), journey.days.slice(20, 30)];
  const up = journey.change && journey.change.to > journey.change.from;
  return (
    <Card style={styles.card}>
      <View style={styles.figures}>
        <View style={styles.figure}>
          <Text style={styles.value}>{journey.perfectDays}</Text>
          <Text style={styles.label}>perfect {journey.perfectDays === 1 ? 'day' : 'days'}</Text>
        </View>
        <View style={styles.figure}>
          <Text style={styles.value}>{journey.tracked}</Text>
          <Text style={styles.label}>{journey.tracked === 1 ? 'day' : 'days'} on the ritual</Text>
        </View>
      </View>

      <View style={styles.grid}>
        {rows.map((row, r) => (
          <View key={r} style={styles.row}>
            {row.map((d) => {
              const share = d.together / max;
              const perfect = d.together >= max;
              return (
                <View
                  key={d.day}
                  accessibilityLabel={`${d.day}: ${d.together} of ${max}`}
                  style={[
                    styles.cell,
                    { backgroundColor: share > 0 ? palette.green500 : palette.track, opacity: share > 0 ? 0.25 + share * 0.75 : 1 },
                    perfect && styles.cellPerfect,
                  ]}
                />
              );
            })}
          </View>
        ))}
      </View>
      <View style={styles.scale}>
        <Text style={styles.scaleText}>30 days ago</Text>
        <Text style={styles.scaleText}>Today</Text>
      </View>

      <Text style={[styles.change, up && styles.changeUp]}>
        {journey.change
          ? journey.change.to > journey.change.from
            ? `From ${journey.change.from} to ${journey.change.to} habits a day since your first week.`
            : journey.change.to < journey.change.from
              ? `${journey.change.to} habits a day now, from ${journey.change.from} in your first week.`
              : `Holding at ${journey.change.to} habits a day since your first week.`
          : `Your first weeks become the baseline — ${pluralise(Math.max(0, 10 - journey.tracked), 'more day')} until the comparison shows.`}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 18 },
  figures: { flexDirection: 'row', gap: 24, marginBottom: 14 },
  figure: {},
  value: font('extrabold', 24, { color: palette.ink }),
  label: font('medium', 12, { color: palette.slate500 }),
  grid: { gap: 5 },
  row: { flexDirection: 'row', gap: 5 },
  cell: { flex: 1, aspectRatio: 1, borderRadius: 5 },
  cellPerfect: { borderWidth: 2, borderColor: palette.green700 },
  scale: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  scaleText: font('medium', 11, { color: palette.grey500 }),
  change: { marginTop: 12, ...font('semibold', 14, { color: palette.slate500 }) },
  changeUp: { color: palette.green700 },
});

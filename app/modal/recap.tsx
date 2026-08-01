import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { track } from '@/lib/analytics';
import { ModalHeader } from '@/components/ModalHeader';
import { Card, PressableScale, Screen, SectionLabel, StatTile } from '@/components/ui';
import { selectWeekSessions, useProfileStore, type SessionSummary } from '@/state/profileStore';
import { useCouple } from '@/state/useCouple';
import { font, text } from '@/theme/typography';
import { gradients, palette, radius, shadow } from '@/theme/tokens';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

/** Reps per weekday for the trailing 7 days, Monday-first. */
function repsByWeekday(sessions: readonly SessionSummary[], now = new Date()): number[] {
  const buckets = new Array<number>(7).fill(0);

  for (const session of sessions) {
    const date = new Date(session.completedAt);
    // getDay() is Sunday-first; shift so Monday is index 0.
    const index = (date.getDay() + 6) % 7;
    buckets[index] = (buckets[index] ?? 0) + session.reps;
  }
  void now;
  return buckets;
}

function formatRange(now = new Date()): string {
  const end = new Date(now);
  const start = new Date(now);
  start.setDate(start.getDate() - 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase();
  return `${fmt(start)} – ${fmt(end)}`;
}

export default function WeeklyRecapScreen() {
  const router = useRouter();
  const couple = useCouple();
  const profile = useProfileStore();
  const week = selectWeekSessions(profile);

  const totalReps = week.reduce((acc, s) => acc + s.reps, 0);
  const xp = week.reduce((acc, s) => acc + s.xp, 0);
  const duels = week.filter((s) => s.mode === 'versus');
  const duelsWon = duels.filter((s) => s.won).length;
  const minutes = Math.round(week.reduce((acc, s) => acc + s.durationSec, 0) / 60);

  const buckets = repsByWeekday(week);
  const peak = Math.max(1, ...buckets);
  const bestIndex = buckets.indexOf(Math.max(...buckets));

  return (
    <Screen>
      <ModalHeader title="Weekly Recap" />

      <LinearGradient colors={gradients.brandDeep} style={[styles.hero, shadow.brand]}>
        <Svg width={140} height={140} viewBox="0 0 100 100" style={styles.heroWatermark}>
          <Rect x={8} y={58} width={18} height={32} rx={5} fill={palette.white} opacity={0.16} />
          <Rect x={32} y={40} width={18} height={50} rx={5} fill={palette.white} opacity={0.16} />
          <Rect x={56} y={18} width={18} height={72} rx={5} fill={palette.white} opacity={0.16} />
        </Svg>
        <View style={styles.heroChip}>
          <Text style={font('extrabold', 10, { color: palette.white })}>{formatRange()}</Text>
        </View>
        <Text style={font('extrabold', 27, { color: palette.white, marginTop: 12 })}>
          {totalReps > 0 ? 'Your week in reps' : 'A fresh week awaits'}
        </Text>
        <Text style={styles.heroCopy}>
          {totalReps > 0
            ? `${totalReps} reps across ${week.length} session${week.length === 1 ? '' : 's'}.`
            : 'Finish a session and your recap will fill in here.'}
        </Text>
      </LinearGradient>

      <View style={styles.grid}>
        <View style={styles.gridRow}>
          <StatTile value={totalReps} label="total reps" color={palette.green500} />
          <StatTile value={`${duelsWon} / ${duels.length}`} label="duels won" color={palette.green500} />
        </View>
        <View style={styles.gridRow}>
          <StatTile value={xp.toLocaleString()} label="XP earned" color={palette.green500} />
          <StatTile value={`${minutes}`} label="minutes trained" color={palette.green500} />
        </View>
      </View>

      <Card style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <SectionLabel>Reps per day</SectionLabel>
          {totalReps > 0 ? (
            <Text style={font('bold', 11, { color: palette.green600 })}>
              Best: {DAY_LABELS[bestIndex]} {buckets[bestIndex]}
            </Text>
          ) : null}
        </View>

        <View style={styles.chart}>
          {buckets.map((value, i) => {
            const heightPercent = Math.round((value / peak) * 100);
            const isBest = value > 0 && i === bestIndex;

            return (
              <View key={i} style={styles.chartColumn}>
                {value > 0 ? (
                  <LinearGradient
                    colors={isBest ? gradients.brandStrong : ['#86efac', '#22c55e']}
                    style={[
                      styles.chartBar,
                      { height: `${Math.max(8, heightPercent)}%` },
                    ]}
                  />
                ) : (
                  <View
                    style={[
                      styles.chartBar,
                      {
                        height: '3%',
                        backgroundColor: palette.dividerSoft,
                      },
                    ]}
                  />
                )}
                <Text
                  style={font('bold', 10, {
                    color: isBest ? palette.green600 : palette.grey600,
                  })}
                >
                  {DAY_LABELS[i]}
                </Text>
              </View>
            );
          })}
        </View>
      </Card>

      {/* The couple half — "here's what you two did" — only when paired. */}
      {couple.paired ? (
        <LinearGradient colors={gradients.brandStrong} style={[styles.coupleRecap, shadow.brand]}>
          <Text style={styles.coupleEyebrow}>WITH {couple.partner?.displayName?.toUpperCase()}</Text>
          <View style={styles.coupleStats}>
            <View>
              <Text style={styles.coupleValue}>{couple.streak}</Text>
              <Text style={styles.coupleLabel}>SHARED STREAK</Text>
            </View>
            <View>
              <Text style={styles.coupleValue}>{couple.combined}</Text>
              <Text style={styles.coupleLabel}>REPS TOGETHER</Text>
            </View>
            <View>
              <Text style={styles.coupleValue}>Lv.{couple.level.level}</Text>
              <Text style={styles.coupleLabel}>{couple.level.name.toUpperCase()}</Text>
            </View>
          </View>
          <PressableScale
            onPress={() => {
              track('share_opened', { kind: 'weekly-recap' });
              router.push('/modal/couple-card');
            }}
            accessibilityRole="button"
            accessibilityLabel="Share your couple card"
            style={styles.shareRow}
          >
            <Text style={font('extrabold', 13, { color: palette.white })}>Share your week →</Text>
          </PressableScale>
        </LinearGradient>
      ) : null}

      {week.length === 0 ? (
        <Text style={[text.caption, styles.empty]}>
          No sessions logged in the last 7 days.
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius['6xl'], padding: 24, overflow: 'hidden', marginBottom: 16 },
  heroWatermark: { position: 'absolute', right: -10, top: -6 },
  coupleRecap: { borderRadius: radius['4xl'], padding: 20, marginTop: 16, gap: 16 },
  coupleEyebrow: {
    ...font('extrabold', 10, { color: 'rgba(255,255,255,0.85)' }),
    letterSpacing: 1.5,
  },
  coupleStats: { flexDirection: 'row', justifyContent: 'space-between' },
  coupleValue: font('extrabold', 20, { color: palette.white }),
  coupleLabel: {
    ...font('bold', 8, { color: 'rgba(255,255,255,0.8)' }),
    letterSpacing: 0.8,
    marginTop: 4,
  },
  shareRow: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 22,
  },
  heroChip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  heroCopy: {
    ...font('semibold', 13, { color: 'rgba(255,255,255,0.9)' }),
    maxWidth: 250,
    marginTop: 4,
  },
  grid: { gap: 12, marginBottom: 16 },
  gridRow: { flexDirection: 'row', gap: 12 },
  chartCard: { padding: 16 },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 130 },
  chartColumn: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  chartBar: { width: '100%', borderRadius: 8 },
  empty: { textAlign: 'center', marginTop: 20 },
});

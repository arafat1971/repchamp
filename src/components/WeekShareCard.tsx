import { LinearGradient } from 'expo-linear-gradient';
import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FlameIcon } from '@/components/home/Icons';
import { font } from '@/theme/typography';
import { gradients, palette, radius } from '@/theme/tokens';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

/**
 * The week as a picture worth posting: the total, seven bars, the streak and
 * where to find the app. Rendered on screen and captured to a PNG for the
 * share sheet, the same way the session result card is.
 *
 * Strava's weekly summary is the model: one big number, a shape you can read
 * at a glance in a feed, and the brand on it so every post is an invitation.
 */
export const WeekShareCard = forwardRef<
  View,
  {
    range: string;
    totalReps: number;
    buckets: readonly number[];
    streak: number;
    xp: number;
    handle: string | null;
    site: string;
  }
>(function WeekShareCard({ range, totalReps, buckets, streak, xp, handle, site }, ref) {
  const peak = Math.max(1, ...buckets);
  const best = buckets.indexOf(Math.max(...buckets));

  return (
    <View ref={ref} collapsable={false} style={styles.frame}>
      <LinearGradient colors={gradients.brandDeep} style={styles.card}>
        <View style={styles.glow} pointerEvents="none" />
        <Text style={styles.eyebrow}>MY WEEK ON REPCHAMP</Text>
        <Text style={styles.range}>{range}</Text>

        <View style={styles.totalRow}>
          <Text style={styles.total}>{totalReps.toLocaleString()}</Text>
          <Text style={styles.totalUnit}>reps</Text>
        </View>

        <View style={styles.bars}>
          {buckets.map((value, i) => (
            <View key={i} style={styles.barCol}>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: `${value > 0 ? Math.max(10, Math.round((value / peak) * 100)) : 4}%`,
                      backgroundColor:
                        value > 0 && i === best ? palette.white : value > 0 ? palette.green300 : 'rgba(255,255,255,0.18)',
                    },
                  ]}
                />
              </View>
              <Text style={[styles.barDay, value > 0 && i === best && { color: palette.white }]}>{DAY_LABELS[i]}</Text>
            </View>
          ))}
        </View>

        <View style={styles.statsRow}>
          {streak > 0 ? (
            <View style={styles.stat}>
              <FlameIcon size={14} color={palette.amber300} />
              <Text style={styles.statText}>
                {streak}-day streak
              </Text>
            </View>
          ) : null}
          <View style={styles.stat}>
            <Text style={styles.statText}>+{xp.toLocaleString()} XP</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText} numberOfLines={1}>
            {handle ? `@${handle}` : 'Counted by AI, rep by rep'}
          </Text>
          <Text style={styles.footerSite}>{site}</Text>
        </View>
      </LinearGradient>
    </View>
  );
});

const styles = StyleSheet.create({
  frame: { borderRadius: radius['6xl'], overflow: 'hidden' },
  card: { padding: 22, overflow: 'hidden' },
  glow: {
    position: 'absolute',
    top: -90,
    right: -70,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  eyebrow: { ...font('extrabold', 11, { color: palette.green300 }), letterSpacing: 1.4 },
  range: { ...font('bold', 12, { color: 'rgba(255,255,255,0.7)' }), marginTop: 4 },
  totalRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 14 },
  total: { ...font('extrabold', 56, { color: palette.white }), letterSpacing: -2, fontVariant: ['tabular-nums'] },
  totalUnit: { ...font('extrabold', 18, { color: 'rgba(255,255,255,0.75)' }), marginBottom: 12 },
  bars: { flexDirection: 'row', gap: 8, height: 96, marginTop: 10 },
  barCol: { flex: 1, alignItems: 'center', gap: 6 },
  barTrack: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 6 },
  barDay: font('bold', 11, { color: 'rgba(255,255,255,0.6)' }),
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  statText: font('extrabold', 12.5, { color: palette.white }),
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.14)',
    gap: 12,
  },
  footerText: { ...font('bold', 12, { color: 'rgba(255,255,255,0.8)' }), flex: 1 },
  footerSite: font('extrabold', 12, { color: palette.white }),
});

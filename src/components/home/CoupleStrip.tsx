import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui';
import type { CoupleMember } from '@/domain/couple';
import { lastNDayKeys } from '@/domain/progression';
import { font } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

/** A tiny avatar chip — image if present, else the initial on a tinted disc. */
function Chip({ member, color }: { member: CoupleMember | null; color: string }) {
  const initial = (member?.displayName ?? '?').charAt(0).toUpperCase();
  return (
    <View style={[styles.chip, { backgroundColor: color }]}>
      <Text style={font('extrabold', 13, { color: palette.white })}>{initial}</Text>
    </View>
  );
}

/**
 * The paired-couple status strip on Home — visible only when bonded.
 *
 * Keeps the differentiator glanceable without competing with the hero card: both
 * partners, the shared streak, the combined total, and a 7-day row of dots
 * showing who trained which day. A day both trained is the full accent; one
 * partner is a half-tone; neither is empty — so the couple can *see* the streak
 * they're protecting.
 */
export function CoupleStrip({
  me,
  partner,
  streak,
  combined,
  onPress,
}: {
  me: CoupleMember | null;
  partner: CoupleMember | null;
  streak: number;
  combined: number;
  onPress: () => void;
}) {
  const week = lastNDayKeys(7);
  const mine = new Set(me?.trainedDays ?? []);
  const theirs = new Set(partner?.trainedDays ?? []);

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Couple with ${partner?.displayName ?? 'your partner'}, ${streak} day streak`}
    >
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.avatars}>
            <Chip member={me} color={palette.green500} />
            <Chip member={partner} color={palette.purple500} />
          </View>
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>🔥 {streak}</Text>
              <Text style={styles.statLabel}>STREAK</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{combined}</Text>
              <Text style={styles.statLabel}>TOGETHER</Text>
            </View>
          </View>
        </View>

        <View style={styles.week}>
          {week.map((day) => {
            const both = mine.has(day) && theirs.has(day);
            const one = mine.has(day) || theirs.has(day);
            return (
              <View
                key={day}
                style={[
                  styles.dot,
                  both
                    ? styles.dotBoth
                    : one
                      ? styles.dotOne
                      : styles.dotNone,
                ]}
              />
            );
          })}
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.white,
    borderRadius: radius['3xl'],
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
    gap: 14,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  avatars: { flexDirection: 'row' },
  chip: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: palette.white,
    marginRight: -8,
  },
  stats: { flexDirection: 'row', gap: 22 },
  stat: { alignItems: 'flex-end' },
  statValue: font('extrabold', 17, { color: palette.ink }),
  statLabel: { ...font('bold', 8, { color: palette.grey500 }), letterSpacing: 1 },
  week: { flexDirection: 'row', gap: 6, justifyContent: 'space-between' },
  dot: { flex: 1, height: 8, borderRadius: 4 },
  dotBoth: { backgroundColor: palette.green500 },
  dotOne: { backgroundColor: palette.green200 },
  dotNone: { backgroundColor: palette.border },
});
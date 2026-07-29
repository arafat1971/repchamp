import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInRight } from 'react-native-reanimated';

import { PressableScale } from '@/components/ui';
import type { CoupleMember } from '@/domain/couple';
import { lastNDayKeys } from '@/domain/progression';
import { font } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

/** A tiny avatar chip — photo if present, else the initial on a tinted disc. */
function Chip({ member, color }: { member: CoupleMember | null; color: string }) {
  const initial = (member?.displayName ?? '?').charAt(0).toUpperCase();
  const hasPhoto = !!member?.avatarUrl;
  return (
    <View style={[styles.chip, { backgroundColor: color }]}>
      {hasPhoto ? (
        <Image
          source={{ uri: member!.avatarUrl! }}
          style={styles.chipPhoto}
          contentFit="cover"
        />
      ) : (
        <Text style={font('extrabold', 13, { color: palette.white })}>{initial}</Text>
      )}
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
  const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Couple with ${partner?.displayName ?? 'your partner'}, ${streak} day streak`}
    >
      <View style={styles.card}>
        {/* Avatar pair + partner name */}
        <View style={styles.header}>
          <View style={styles.identityRow}>
            <View style={styles.avatars}>
              <Chip member={me} color={palette.green500} />
              <Chip member={partner} color={palette.purple500} />
            </View>
            <View style={styles.nameBlock}>
              <Text style={styles.bondWithText} numberOfLines={1}>
                With {partner?.displayName ?? 'Partner'}
              </Text>
              <Text style={styles.bondSubText}>Couple Bond</Text>
            </View>
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

        {/* 7-day activity row with labels */}
        <View style={styles.week}>
          {week.map((day, i) => {
            const both = mine.has(day) && theirs.has(day);
            const one = mine.has(day) || theirs.has(day);
            return (
              <Animated.View
                key={day}
                entering={FadeInRight.duration(250).delay(i * 40)}
                style={styles.dayCol}
              >
                <Text style={styles.dayLabel}>{dayLabels[i]}</Text>
                <View
                  style={[
                    styles.dot,
                    both
                      ? styles.dotBoth
                      : one
                        ? styles.dotOne
                        : styles.dotNone,
                  ]}
                >
                  {both ? <Text style={{ fontSize: 8 }}>✓</Text> : null}
                </View>
              </Animated.View>
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  avatars: { flexDirection: 'row' },
  chip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: palette.white,
    marginRight: -10,
    overflow: 'hidden',
  },
  chipPhoto: { width: '100%', height: '100%' },
  nameBlock: { marginLeft: 4, flex: 1 },
  bondWithText: font('extrabold', 13, { color: palette.ink }),
  bondSubText: {
    ...font('bold', 9, { color: palette.grey500 }),
    letterSpacing: 0.8,
  },
  stats: { flexDirection: 'row', gap: 18 },
  stat: { alignItems: 'flex-end' },
  statValue: font('extrabold', 16, { color: palette.ink }),
  statLabel: { ...font('bold', 8, { color: palette.grey500 }), letterSpacing: 1 },
  week: { flexDirection: 'row', gap: 4, justifyContent: 'space-between' },
  dayCol: { alignItems: 'center', gap: 4, flex: 1 },
  dayLabel: font('bold', 9, { color: palette.grey400 }),
  dot: {
    width: '100%',
    height: 10,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotBoth: { backgroundColor: palette.green500 },
  dotOne: { backgroundColor: palette.green200 },
  dotNone: { backgroundColor: palette.border },
});
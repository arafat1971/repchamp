import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInRight } from 'react-native-reanimated';

import { PressableScale } from '@/components/ui';
import {
  coupleBondPresentation,
  type CoupleBondTone,
  type CoupleMember,
} from '@/domain/couple';
import { dayKey, lastNDayKeys, weekdayLetter } from '@/domain/progression';
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

const TONE_ACCENT: Record<CoupleBondTone, string> = {
  fresh: palette.green500,
  nudge: palette.amber500,
  waiting: palette.purple500,
  locked: palette.green600,
  risk: palette.amber600,
  steady: palette.green500,
};

/**
 * The paired-couple status strip on Home — visible only when bonded.
 *
 * Smart-hooked: empty bonds invite the first set, half-days nudge the missing
 * partner, at-risk streaks warn cleanly, and locked days congratulate without
 * emoji noise. Milestone progress keeps the long game glanceable.
 *
 * Tap routes by `bond.action` so CTAs match behavior (train / nudge / open).
 */
export function CoupleStrip({
  me,
  partner,
  streak,
  combined,
  atRisk,
  levelName,
  today = dayKey(),
  onAction,
}: {
  me: CoupleMember | null;
  partner: CoupleMember | null;
  streak: number;
  combined: number;
  atRisk: boolean;
  levelName: string;
  today?: string;
  onAction: (action: 'train' | 'nudge' | 'open') => void;
}) {
  const week = lastNDayKeys(7);
  const mine = new Set(me?.trainedDays ?? []);
  const theirs = new Set(partner?.trainedDays ?? []);
  const bond = coupleBondPresentation({
    me,
    partner,
    streak,
    combined,
    atRisk,
    today,
    levelName,
  });
  const accent = TONE_ACCENT[bond.tone];

  return (
    <PressableScale
      onPress={() => onAction(bond.action)}
      accessibilityRole="button"
      accessibilityLabel={`Couple with ${partner?.displayName ?? 'your partner'}. ${bond.headline}`}
    >
      <View style={[styles.card, bond.tone === 'risk' && styles.cardRisk]}>
        <View style={[styles.accentBar, { backgroundColor: accent }]} />

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
              <Text style={[styles.eyebrow, { color: accent }]} numberOfLines={1}>
                {bond.eyebrow}
              </Text>
            </View>
          </View>
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={[styles.statValue, bond.tone === 'risk' && { color: palette.amber800 }]}>
                {streak}
              </Text>
              <Text style={styles.statLabel}>STREAK</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{combined}</Text>
              <Text style={styles.statLabel}>TOGETHER</Text>
            </View>
          </View>
        </View>

        <Text style={styles.headline} numberOfLines={2}>
          {bond.headline}
        </Text>

        {bond.milestoneLabel ? (
          <View style={styles.milestoneRow}>
            <View style={styles.milestoneTrack}>
              <View
                style={[
                  styles.milestoneFill,
                  {
                    width: `${Math.round(bond.milestoneProgress * 100)}%`,
                    backgroundColor: accent,
                  },
                ]}
              />
            </View>
            <Text style={styles.milestoneLabel}>{bond.milestoneLabel}</Text>
          </View>
        ) : null}

        <View style={styles.week}>
          {week.map((day, i) => {
            const both = mine.has(day) && theirs.has(day);
            const one = mine.has(day) || theirs.has(day);
            const isToday = day === today;
            return (
              <Animated.View
                key={day}
                entering={FadeInRight.duration(250).delay(i * 40)}
                style={styles.dayCol}
              >
                <Text style={[styles.dayLabel, isToday && styles.dayLabelToday]}>
                  {weekdayLetter(day)}
                </Text>
                <View
                  style={[
                    styles.dot,
                    both ? styles.dotBoth : one ? styles.dotOne : styles.dotNone,
                    isToday && styles.dotToday,
                    isToday && bond.tone === 'fresh' && !one && styles.dotTodayFresh,
                  ]}
                >
                  {both ? (
                    <Text style={styles.dotCheck}>✓</Text>
                  ) : isToday && !one ? (
                    <View style={[styles.dotPulse, { backgroundColor: accent }]} />
                  ) : null}
                </View>
              </Animated.View>
            );
          })}
        </View>

        {bond.cta ? (
          <View style={[styles.ctaRow, { backgroundColor: `${accent}14` }]}>
            <Text style={[styles.ctaText, { color: accent }]}>{bond.cta}</Text>
            <Text style={[styles.ctaChevron, { color: accent }]}>→</Text>
          </View>
        ) : null}
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
    paddingLeft: 16,
    gap: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardRisk: {
    borderColor: palette.amber200,
    backgroundColor: palette.amber50,
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
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
  nameBlock: { marginLeft: 4, flex: 1, paddingRight: 8 },
  bondWithText: font('extrabold', 13, { color: palette.ink }),
  eyebrow: {
    ...font('extrabold', 10, { color: palette.grey500 }),
    letterSpacing: 0.4,
    marginTop: 4,
    textTransform: 'uppercase',
  },
  stats: { flexDirection: 'row', gap: 16 },
  stat: { alignItems: 'flex-end', minWidth: 36 },
  statValue: font('extrabold', 18, { color: palette.ink }),
  statLabel: { ...font('bold', 9.5, { color: palette.grey500 }), letterSpacing: 1, marginTop: 4 },
  headline: {
    ...font('semibold', 13, { color: palette.grey600 }),
    lineHeight: 18,
  },
  milestoneRow: { gap: 4 },
  milestoneTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.border,
    overflow: 'hidden',
  },
  milestoneFill: { height: '100%', borderRadius: radius.xs },
  milestoneLabel: font('bold', 10, { color: palette.grey500 }),
  week: { flexDirection: 'row', gap: 4, justifyContent: 'space-between' },
  dayCol: { alignItems: 'center', gap: 4, flex: 1 },
  dayLabel: font('bold', 9.5, { color: palette.grey400 }),
  dayLabelToday: font('extrabold', 9.5, { color: palette.ink }),
  dot: {
    width: '100%',
    height: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotBoth: { backgroundColor: palette.green500 },
  dotOne: { backgroundColor: palette.green200 },
  dotNone: { backgroundColor: palette.border },
  dotToday: {
    borderWidth: 1.5,
    borderColor: palette.ink,
  },
  dotTodayFresh: {
    borderColor: palette.green500,
    backgroundColor: palette.green50,
  },
  dotCheck: { fontSize: 8, color: palette.white, fontWeight: '800' },
  dotPulse: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.xl,
  },
  ctaText: font('extrabold', 13, { color: palette.green700 }),
  ctaChevron: font('extrabold', 14, { color: palette.green700 }),
});

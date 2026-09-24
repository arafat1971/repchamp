import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui';
import { coupleBondPresentation, type CoupleMember } from '@/domain/couple';
import type { Rivalry } from '@/domain/rivalry';
import { font } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

/**
 * The couple, as one face-off on Home.
 *
 * Replaces two stacked white cards — `CoupleStrip` (the bond headline) and
 * `PartnerPulseCard` (their week) — that told the same story twice. This is
 * the version a couple actually opens the app for: both faces, who has shown
 * up today, the shared streak, and the running score between them.
 *
 * The words and the main action still come from `coupleBondPresentation`, so
 * the nudge, streak-at-risk and first-set logic is unchanged; only the shape
 * is new. Race is always on offer beside it, because a duel is the reason a
 * couple is on this app rather than a spreadsheet.
 */
export function DuoCard({
  me,
  partner,
  streak,
  combined,
  atRisk,
  levelName,
  today,
  rivalry,
  onAction,
  onRace,
  onOpen,
}: {
  me: CoupleMember | null;
  partner: CoupleMember | null;
  streak: number;
  combined: number;
  atRisk: boolean;
  levelName: string;
  today: string;
  rivalry: Rivalry;
  onAction: (action: 'train' | 'nudge' | 'open') => void;
  onRace: () => void;
  onOpen: () => void;
}) {
  const bond = coupleBondPresentation({ me, partner, streak, combined, atRisk, today, levelName });
  const partnerName = partner?.displayName?.trim() || 'Partner';
  const iTrained = !!me?.trainedDays.includes(today);
  const theyTrained = !!partner?.trainedDays.includes(today);
  const risk = bond.tone === 'risk';

  const score =
    rivalry.played === 0
      ? 'No duels yet'
      : rivalry.wins === rivalry.losses
        ? `Level ${rivalry.wins}–${rivalry.losses}`
        : rivalry.wins > rivalry.losses
          ? `You lead ${rivalry.wins}–${rivalry.losses}`
          : `${partnerName} leads ${rivalry.losses}–${rivalry.wins}`;

  return (
    <PressableScale
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`You and ${partnerName}. ${bond.headline}`}
    >
      <LinearGradient
        colors={risk ? ['#3b1d0b', '#1c1208'] : ['#1a1033', '#0f172a']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View style={styles.top}>
          <Text style={[styles.eyebrow, risk && { color: palette.amber300 }]}>
            {bond.eyebrow.toUpperCase()}
          </Text>
          <View style={styles.scoreChip}>
            <Text style={styles.scoreText}>⚔️ {score}</Text>
          </View>
        </View>

        <View style={styles.faceoff}>
          <Face member={me} label="You" trained={iTrained} ring="#a78bfa" />
          <View style={styles.center}>
            <Text style={styles.flame}>🔥</Text>
            <Text style={styles.streak}>{streak}</Text>
            <Text style={styles.streakLabel}>DAY STREAK</Text>
          </View>
          <Face member={partner} label={partnerName} trained={theyTrained} ring="#fbbf24" />
        </View>

        <Text style={styles.headline} numberOfLines={2}>
          {bond.headline}
        </Text>

        <View style={styles.actions}>
          {bond.cta ? (
            <PressableScale
              onPress={() => onAction(bond.action)}
              accessibilityRole="button"
              accessibilityLabel={bond.cta}
              style={[styles.primary, risk && styles.primaryRisk]}
            >
              <Text style={styles.primaryText} numberOfLines={1}>
                {bond.cta}
              </Text>
            </PressableScale>
          ) : null}
          <PressableScale
            onPress={onRace}
            accessibilityRole="button"
            accessibilityLabel={`Race ${partnerName}`}
            style={[styles.secondary, !bond.cta && { flex: 1 }]}
          >
            <Text style={styles.secondaryText}>⚔️ Race</Text>
          </PressableScale>
        </View>
      </LinearGradient>
    </PressableScale>
  );
}

function Face({
  member,
  label,
  trained,
  ring,
}: {
  member: CoupleMember | null;
  label: string;
  trained: boolean;
  ring: string;
}) {
  const initial = (member?.displayName ?? '?').charAt(0).toUpperCase();
  return (
    <View style={styles.face}>
      <View style={[styles.ring, { borderColor: trained ? ring : 'rgba(255,255,255,0.15)' }]}>
        {member?.avatarUrl ? (
          <Image source={{ uri: member.avatarUrl }} style={styles.photo} contentFit="cover" />
        ) : (
          <View style={styles.initialBox}>
            <Text style={font('extrabold', 20, { color: palette.white })}>{initial}</Text>
          </View>
        )}
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.state, { color: trained ? ring : 'rgba(255,255,255,0.45)' }]}>
        {trained ? 'TRAINED ✓' : 'NOT YET'}
      </Text>
    </View>
  );
}

const AVATAR = 58;

const styles = StyleSheet.create({
  card: { borderRadius: radius['3xl'], padding: 18 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { ...font('extrabold', 11.5, { color: '#c4b5fd' }), letterSpacing: 1.4, flexShrink: 1 },
  scoreChip: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  scoreText: font('bold', 11.5, { color: palette.white }),
  faceoff: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  face: { flex: 1, alignItems: 'center' },
  ring: { borderWidth: 3, borderRadius: (AVATAR + 12) / 2, padding: 3 },
  photo: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 },
  initialBox: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { ...font('bold', 13.5, { color: palette.white }), marginTop: 6, maxWidth: 110 },
  state: { ...font('extrabold', 10, {}), letterSpacing: 1, marginTop: 2 },
  center: { alignItems: 'center', minWidth: 76 },
  flame: { fontSize: 22 },
  streak: { ...font('extrabold', 28, { color: palette.white }), lineHeight: 32 },
  streakLabel: { ...font('extrabold', 9, { color: 'rgba(255,255,255,0.55)' }), letterSpacing: 1.2 },
  headline: {
    ...font('semibold', 14, { color: 'rgba(255,255,255,0.9)' }),
    textAlign: 'center',
    marginTop: 14,
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  primary: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: palette.green500,
  },
  primaryRisk: { backgroundColor: palette.amber500 },
  primaryText: font('extrabold', 14, { color: palette.white }),
  secondary: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  secondaryText: font('extrabold', 14, { color: palette.white }),
});

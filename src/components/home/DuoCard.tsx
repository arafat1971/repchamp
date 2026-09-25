import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Face, HealthCard, IOS } from '@/components/home/HealthCard';
import { HeartIcon } from '@/components/home/Icons';
import { PressableScale } from '@/components/ui';
import { coupleBondPresentation, type CoupleMember } from '@/domain/couple';
import type { Rivalry } from '@/domain/rivalry';
import { weekStrip } from '@/domain/weekStrip';
import { font } from '@/theme/typography';
import { palette } from '@/theme/tokens';

/* You in green, them in pink; a day you both trained is both halves full. */
const ME = IOS.green;
const THEM = IOS.duo;

/**
 * The couple, in the Health app's grammar: who, the week you share, and one
 * thing to do about it.
 *
 * Seven split days carry the whole story — your half, their half, both when
 * you both showed up — so today's half-filled dot is the nudge without a
 * paragraph explaining it. Words and the main action come from
 * `coupleBondPresentation`, so the nudge, streak-at-risk and first-set logic
 * is unchanged.
 */
export function DuoCard({
  me,
  partner,
  myAvatar,
  partnerAvatar,
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
  /** Resolved photos — the couple doc's own snapshot is often unloadable. */
  myAvatar: string | null;
  partnerAvatar: string | null;
  streak: number;
  combined: number;
  atRisk: boolean;
  levelName: string;
  today: string;
  rivalry: Rivalry;
  myRepsToday?: number;
  partnerRepsToday?: number;
  onAction: (action: 'train' | 'nudge' | 'open') => void;
  onRace: () => void;
  onOpen: () => void;
}) {
  const bond = coupleBondPresentation({ me, partner, streak, combined, atRisk, today, levelName });
  const partnerName = partner?.displayName?.trim() || 'Partner';
  const partnerFirst = partnerName.split(/\s+/)[0] ?? partnerName;
  const myName = me?.displayName?.trim() || 'You';
  const risk = bond.tone === 'risk';

  const score =
    rivalry.played === 0
      ? null
      : rivalry.wins === rivalry.losses
        ? `Duels ${rivalry.wins}–${rivalry.losses}`
        : rivalry.wins > rivalry.losses
          ? `You lead ${rivalry.wins}–${rivalry.losses}`
          : `${partnerFirst} leads ${rivalry.losses}–${rivalry.wins}`;

  const week = useMemo(() => {
    const mine = new Set(me?.trainedDays ?? []);
    const theirs = new Set(partner?.trainedDays ?? []);
    return weekStrip([]).map((c) => ({ ...c, me: mine.has(c.day), them: theirs.has(c.day) }));
  }, [me?.trainedDays, partner?.trainedDays]);

  return (
    <HealthCard
      icon={<HeartIcon size={16} color={risk ? '#FF9500' : THEM} />}
      title="Duo"
      tint={risk ? '#FF9500' : THEM}
      trailing={bond.eyebrow}
      onPress={onOpen}
      accessibilityLabel={`You and ${partnerName}. ${bond.headline}`}
    >
      <View style={styles.who}>
        <View style={styles.pair}>
          <View style={styles.faceRing}>
            <Face uri={myAvatar} name={myName} color={ME} size={40} />
          </View>
          <View style={[styles.faceRing, styles.overlap]}>
            <Face uri={partnerAvatar} name={partnerName} color={THEM} size={40} />
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            You & {partnerFirst}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {streak}-day streak{score ? ` · ${score}` : ''}
          </Text>
        </View>
      </View>

      <View style={styles.week}>
        {week.map((d) => (
          <Day key={d.day} {...d} />
        ))}
      </View>

      <Text style={[styles.headline, risk && { color: '#C2410C' }]} numberOfLines={2}>
        {bond.headline}
      </Text>

      <View style={styles.actions}>
        {bond.cta ? (
          <PressableScale
            onPress={() => onAction(bond.action)}
            accessibilityRole="button"
            accessibilityLabel={bond.cta}
            style={[styles.primary, risk && { backgroundColor: '#FF9500' }]}
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
          <Text style={styles.secondaryText}>Race</Text>
        </PressableScale>
      </View>
    </HealthCard>
  );
}

function Day({
  letter,
  me,
  them,
  isToday,
  isFuture,
}: {
  letter: string;
  me: boolean;
  them: boolean;
  isToday: boolean;
  isFuture: boolean;
}) {
  return (
    <View style={[styles.day, isFuture && { opacity: 0.4 }]}>
      <Text style={[styles.dayLetter, isToday && styles.dayLetterToday]}>{letter}</Text>
      <View style={[styles.dot, isToday && styles.dotToday]}>
        <View style={styles.halves}>
          <View style={[styles.half, me && { backgroundColor: ME }]} />
          <View style={[styles.half, them && { backgroundColor: THEM }]} />
        </View>
      </View>
    </View>
  );
}

const DOT = 26;

const styles = StyleSheet.create({
  who: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  pair: { flexDirection: 'row' },
  faceRing: { borderRadius: 22, borderWidth: 2, borderColor: palette.white },
  overlap: { marginLeft: -12 },
  title: { ...font('bold', 17, { color: IOS.label }), letterSpacing: -0.3 },
  subtitle: font('medium', 13, { color: IOS.secondary, marginTop: 1 }),

  week: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: IOS.separator,
  },
  day: { alignItems: 'center', gap: 6 },
  dayLetter: font('semibold', 11, { color: IOS.secondary }),
  dayLetterToday: font('bold', 11, { color: IOS.label }),
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, overflow: 'hidden', backgroundColor: IOS.fill },
  dotToday: { borderWidth: 2, borderColor: IOS.label },
  halves: { flex: 1, flexDirection: 'row' },
  half: { flex: 1 },

  headline: { ...font('medium', 13.5, { color: IOS.secondary }), marginTop: 12, lineHeight: 18 },

  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  primary: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    backgroundColor: IOS.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: font('bold', 15, { color: palette.white }),
  secondary: {
    height: 42,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,45,85,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: font('bold', 15, { color: THEM }),
});

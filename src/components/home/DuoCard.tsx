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
/* The brand green, not the system one: beside the Train button and the hero
   the brighter iOS green read as a second, slightly-off brand colour. */
const ME = palette.green600;
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
  ritual,
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
  /** Today's ritual, both sides — a row that opens Today, together. */
  ritual?: { me: number; them: number; total: number } | null;
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
            <Face uri={myAvatar} name={myName} color={ME} size={34} />
          </View>
          <View style={[styles.faceRing, styles.overlap]}>
            <Face uri={partnerAvatar} name={partnerName} color={THEM} size={34} />
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            You & {partnerFirst}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {/* A zero streak is not news; the rivalry, when there is one, is. */}
            {[streak > 0 ? `${streak}-day streak` : null, score].filter(Boolean).join(' · ') || 'Start your streak'}
          </Text>
        </View>
        {/* The shared week, inline: each dot split — your half, theirs. */}
        <View style={styles.week} accessibilityElementsHidden>
          {week.map((d) => (
            <Day key={d.day} {...d} />
          ))}
        </View>
      </View>

      <Text style={[styles.headline, risk && { color: '#C2410C' }]} numberOfLines={2}>
        {bond.headline}
      </Text>

      {ritual ? (
        <PressableScale
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel={`Today's ritual: you ${ritual.me} of ${ritual.total}, ${partnerFirst} ${ritual.them} of ${ritual.total}`}
          style={styles.ritual}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.ritualTitle}>Today&rsquo;s ritual</Text>
            <View style={styles.ritualBars}>
              <Bar value={ritual.me} total={ritual.total} color={ME} />
              <Bar value={ritual.them} total={ritual.total} color={THEM} />
            </View>
          </View>
          <Text style={styles.ritualScore}>
            {ritual.me}/{ritual.total} · {ritual.them}/{ritual.total}
          </Text>
          <Text style={styles.chevron}>›</Text>
        </PressableScale>
      ) : null}

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

function Bar({ value, total, color }: { value: number; total: number; color: string }) {
  return (
    <View style={styles.bar}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.seg, i < value && { backgroundColor: color }]} />
      ))}
    </View>
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

const DOT = 11;

const styles = StyleSheet.create({
  who: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  pair: { flexDirection: 'row' },
  faceRing: { borderRadius: 19, borderWidth: 2, borderColor: palette.white },
  overlap: { marginLeft: -10 },
  title: { ...font('bold', 15.5, { color: IOS.label }), letterSpacing: -0.3 },
  subtitle: font('medium', 12, { color: IOS.secondary, marginTop: 1 }),

  week: { flexDirection: 'row', gap: 2 },
  day: { alignItems: 'center', gap: 3 },
  dayLetter: font('semibold', 10, { color: IOS.secondary }),
  dayLetterToday: font('bold', 10, { color: IOS.label }),
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, overflow: 'hidden', backgroundColor: IOS.fill },
  dotToday: { borderWidth: 1.5, borderColor: IOS.label },
  halves: { flex: 1, flexDirection: 'row' },
  half: { flex: 1 },

  headline: { ...font('medium', 12.5, { color: IOS.secondary }), marginTop: 10, lineHeight: 17 },

  ritual: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: IOS.separator,
  },
  ritualTitle: font('semibold', 12.5, { color: IOS.label }),
  ritualBars: { gap: 3, marginTop: 5 },
  bar: { flexDirection: 'row', gap: 3 },
  seg: { flex: 1, height: 4, borderRadius: 3, backgroundColor: IOS.fill },
  ritualScore: font('semibold', 12, { color: IOS.secondary }),
  chevron: font('semibold', 20, { color: IOS.secondary }),

  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  primary: {
    flex: 1,
    height: 38,
    borderRadius: 12,
    backgroundColor: palette.green600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: font('bold', 14, { color: palette.white }),
  secondary: {
    height: 38,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: IOS.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: font('bold', 14, { color: IOS.label }),
});

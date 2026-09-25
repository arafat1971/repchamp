import { useEffect, useMemo } from 'react';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { PressableScale } from '@/components/ui';
import { coupleBondPresentation, type CoupleMember } from '@/domain/couple';
import type { Rivalry } from '@/domain/rivalry';
import { weekStrip } from '@/domain/weekStrip';
import { font } from '@/theme/typography';
import { palette, radius, surfaceShadow } from '@/theme/tokens';

/* Two identities, one pair. Emerald is the brand and it is you; rose is the
   partner. A day you both trained carries both, as one gradient. */
const ME = { solid: '#059669', soft: '#ECFDF5', line: 'rgba(5,150,105,0.22)', ink: '#047857' };
const THEM = { solid: '#E11D48', soft: '#FFF1F2', line: 'rgba(225,29,72,0.20)', ink: '#BE123C' };
const TOGETHER: readonly [string, string] = [ME.solid, THEM.solid];
const RISK = { solid: '#D97706', soft: '#FFFBEB', ink: '#B45309' };

type Tone = typeof ME;

/**
 * The couple, as one card on Home.
 *
 * Built around faces — the one thing that makes this card about two people
 * rather than two numbers — and one question: have we both shown up today?
 * Each of you gets a panel that fills with your colour when you train, so a
 * half-filled card is its own nudge. Below: the week as seven shared days,
 * and the combined-reps milestone from `coupleBondPresentation`.
 *
 * Words and the main action still come from `coupleBondPresentation`, so the
 * nudge, streak-at-risk and first-set logic is unchanged.
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
  myRepsToday = 0,
  partnerRepsToday = 0,
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
  const iTrained = !!me?.trainedDays.includes(today);
  const theyTrained = !!partner?.trainedDays.includes(today);
  const checkedIn = Number(iTrained) + Number(theyTrained);
  const risk = bond.tone === 'risk';

  const score =
    rivalry.played === 0
      ? 'No duels yet'
      : rivalry.wins === rivalry.losses
        ? `Duels level ${rivalry.wins}–${rivalry.losses}`
        : rivalry.wins > rivalry.losses
          ? `You lead ${rivalry.wins}–${rivalry.losses}`
          : `${partnerFirst} leads ${rivalry.losses}–${rivalry.wins}`;

  const week = useMemo(() => {
    const mine = new Set(me?.trainedDays ?? []);
    const theirs = new Set(partner?.trainedDays ?? []);
    return weekStrip([]).map((c) => ({ ...c, me: mine.has(c.day), them: theirs.has(c.day) }));
  }, [me?.trainedDays, partner?.trainedDays]);
  const together = week.filter((d) => d.me && d.them).length;

  return (
    <PressableScale
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`You and ${partnerName}. ${bond.headline}`}
    >
      <View style={[styles.card, risk && styles.cardRisk]}>
        {/* A whisper of both colours across the top edge — the pair's signature. */}
        <LinearGradient
          colors={risk ? [RISK.solid, '#F59E0B'] : TOGETHER}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.topRule}
        />
        <LinearGradient
          colors={risk ? ['#FFF7E6', 'rgba(255,255,255,0)'] : ['#F3FBF7', 'rgba(255,255,255,0)']}
          style={styles.topWash}
          pointerEvents="none"
        />

        {/* Masthead: the two of you, named, with the streak you share. */}
        <View style={styles.head}>
          <View style={styles.pair}>
            <Avatar uri={myAvatar} name={myName} tone={ME} size={52} active={iTrained} />
            <View style={styles.pairOverlap}>
              <Avatar uri={partnerAvatar} name={partnerName} tone={THEM} size={52} active={theyTrained} />
            </View>
            <View style={styles.heart}>
              <Text style={styles.heartText}>♥</Text>
            </View>
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.title} numberOfLines={1}>
              You & {partnerFirst}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {bond.eyebrow} · {score}
            </Text>
          </View>
          <View style={[styles.streakPill, streak > 0 && styles.streakPillOn]}>
            <Text style={styles.streakEmoji}>🔥</Text>
            <Text style={[styles.streakNum, streak > 0 && { color: '#9A3412' }]}>{streak}</Text>
          </View>
        </View>

        {/* Today, side by side. Your panel fills with your colour when you train. */}
        <View style={styles.todayHead}>
          <Text style={styles.sectionLabel}>TODAY</Text>
          <Text style={styles.sectionMeta}>{checkedIn} of 2 checked in</Text>
        </View>
        <View style={styles.todayRow}>
          <TodayPanel name="You" tone={ME} trained={iTrained} reps={myRepsToday} />
          <TodayPanel name={partnerFirst} tone={THEM} trained={theyTrained} reps={partnerRepsToday} />
        </View>

        {/* The hook, in one line. */}
        <View style={[styles.callout, risk && { backgroundColor: RISK.soft }]}>
          <Text style={styles.calloutIcon}>{risk ? '⏳' : checkedIn === 2 ? '✨' : '💞'}</Text>
          <Text style={[styles.calloutText, risk && { color: RISK.ink }]} numberOfLines={2}>
            {checkedIn === 2 ? `You both showed up today${streak > 0 ? ' — streak safe' : ''}.` : bond.headline}
          </Text>
        </View>

        {/* The week together. */}
        <View style={styles.weekHead}>
          <Text style={styles.sectionLabel}>THIS WEEK</Text>
          <Text style={styles.sectionMeta}>
            <Text style={styles.sectionMetaStrong}>{together}</Text> days together
          </Text>
        </View>
        <View style={styles.weekRow}>
          {week.map((d) => (
            <DayDot key={d.day} {...d} />
          ))}
        </View>
        <View style={styles.legend}>
          <LegendDot color={ME.solid} label="You" />
          <LegendDot color={THEM.solid} label={partnerFirst} />
          <LegendDot gradient label="Both" />
        </View>

        {bond.milestoneLabel ? (
          <View style={styles.milestone}>
            <View style={styles.milestoneHead}>
              <Text style={styles.milestoneLabel}>Bond milestone</Text>
              <Text style={styles.milestoneValue}>{bond.milestoneLabel}</Text>
            </View>
            <MilestoneBar fraction={bond.milestoneProgress} />
          </View>
        ) : null}

        <View style={styles.actions}>
          {bond.cta ? (
            <PressableScale
              onPress={() => onAction(bond.action)}
              accessibilityRole="button"
              accessibilityLabel={bond.cta}
              style={[styles.primary, risk && { backgroundColor: RISK.solid }]}
            >
              <Text style={styles.primaryText} numberOfLines={1}>
                {bond.cta}
              </Text>
              <View style={styles.primaryArrow}>
                <Text style={styles.primaryArrowText}>→</Text>
              </View>
            </PressableScale>
          ) : null}
          <PressableScale
            onPress={onRace}
            accessibilityRole="button"
            accessibilityLabel={`Race ${partnerName}`}
            style={[styles.secondary, !bond.cta && { flex: 1 }]}
          >
            <Text style={styles.secondaryText}>⚔️  Race</Text>
          </PressableScale>
        </View>
      </View>
    </PressableScale>
  );
}

function Avatar({
  uri,
  name,
  tone,
  size,
  active,
}: {
  uri: string | null;
  name: string;
  tone: Tone;
  size: number;
  active: boolean;
}) {
  const initial = name.charAt(0).toUpperCase() || '?';
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0);
  useEffect(() => {
    // A seat still to be filled breathes, gently.
    if (active || reduced) {
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [active, reduced, pulse]);
  const ringStyle = useAnimatedStyle(() => ({ opacity: active ? 1 : 0.35 + pulse.value * 0.65 }));
  const outer = size + 8;
  return (
    <View style={{ width: outer, height: outer }}>
      <Animated.View
        style={[
          styles.avatarRing,
          { width: outer, height: outer, borderRadius: outer / 2, borderColor: tone.solid },
          !active && styles.avatarRingIdle,
          ringStyle,
        ]}
      />
      <View style={[styles.avatarInner, { width: size, height: size, borderRadius: size / 2 }]}>
        {uri ? (
          <Image source={{ uri }} style={{ width: size, height: size }} contentFit="cover" transition={200} />
        ) : (
          <LinearGradient
            colors={[tone.solid, tone.ink]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.avatarFallback, { width: size, height: size }]}
          >
            <Text style={font('extrabold', size * 0.4, { color: palette.white })}>{initial}</Text>
          </LinearGradient>
        )}
      </View>
    </View>
  );
}

function TodayPanel({ name, tone, trained, reps }: { name: string; tone: Tone; trained: boolean; reps: number }) {
  return (
    <View
      style={[
        styles.panel,
        trained ? { backgroundColor: tone.soft, borderColor: tone.line } : styles.panelIdle,
      ]}
    >
      <View style={styles.panelTop}>
        <View style={[styles.panelDot, { backgroundColor: trained ? tone.solid : palette.grey400 }]} />
        <Text style={styles.panelName} numberOfLines={1}>
          {name}
        </Text>
        {trained ? (
          <View style={[styles.panelCheck, { backgroundColor: tone.solid }]}>
            <Text style={styles.panelCheckText}>✓</Text>
          </View>
        ) : null}
      </View>
      {trained ? (
        <Text style={[styles.panelValue, { color: tone.ink }]}>
          {reps > 0 ? reps : '✓'}
          {reps > 0 ? <Text style={styles.panelUnit}> reps</Text> : null}
        </Text>
      ) : (
        <Text style={styles.panelWaiting}>Not yet</Text>
      )}
      <Text style={styles.panelCaption}>{trained ? 'Trained today' : 'Waiting on a set'}</Text>
    </View>
  );
}

function DayDot({
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
  const both = me && them;
  return (
    <View style={[styles.dayCell, isFuture && { opacity: 0.45 }]}>
      <View style={[styles.dayDot, isToday && styles.dayDotToday]}>
        {both ? (
          <LinearGradient colors={TOGETHER} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.dayFill}>
            <Text style={styles.dayCheck}>✓</Text>
          </LinearGradient>
        ) : (
          <View style={styles.dayHalves}>
            <View style={[styles.dayHalf, me && { backgroundColor: ME.solid }]} />
            <View style={[styles.dayHalf, them && { backgroundColor: THEM.solid }]} />
          </View>
        )}
      </View>
      <Text style={[styles.dayLetter, isToday && styles.dayLetterToday]}>{letter}</Text>
    </View>
  );
}

function LegendDot({ color, gradient, label }: { color?: string; gradient?: boolean; label: string }) {
  return (
    <View style={styles.legendItem}>
      {gradient ? (
        <LinearGradient colors={TOGETHER} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.legendSwatch} />
      ) : (
        <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      )}
      <Text style={styles.legendText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function MilestoneBar({ fraction }: { fraction: number }) {
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withDelay(
      400,
      withTiming(Math.max(0.03, Math.min(1, fraction)), { duration: 1000, easing: Easing.out(Easing.cubic) }),
    );
  }, [fraction, w]);
  const style = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return (
    <View style={styles.barTrack}>
      <Animated.View style={[styles.barFill, style]}>
        <LinearGradient colors={TOGETHER} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.white,
    borderRadius: radius['4xl'],
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
    padding: 18,
    paddingTop: 20,
    overflow: 'hidden',
    ...surfaceShadow,
  },
  cardRisk: { borderColor: 'rgba(217,119,6,0.35)' },
  topRule: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  topWash: { position: 'absolute', top: 0, left: 0, right: 0, height: 110 },

  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pair: { flexDirection: 'row', alignItems: 'center' },
  pairOverlap: { marginLeft: -16 },
  heart: {
    position: 'absolute',
    bottom: -4,
    left: 38,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  heartText: font('bold', 12, { color: THEM.solid, lineHeight: 15 }),
  avatarRing: { position: 'absolute', top: 0, left: 0, borderWidth: 2.5 },
  avatarRingIdle: { borderStyle: 'dashed', borderColor: palette.grey450 },
  avatarInner: {
    position: 'absolute',
    top: 4,
    left: 4,
    overflow: 'hidden',
    backgroundColor: palette.white,
    borderWidth: 2,
    borderColor: palette.white,
  },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  titleBlock: { flex: 1 },
  title: { ...font('extrabold', 17, { color: palette.ink }), letterSpacing: -0.3 },
  subtitle: font('medium', 12, { color: palette.grey600, marginTop: 2 }),
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: palette.divider,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  streakPillOn: { backgroundColor: '#FFEDD5' },
  streakEmoji: { fontSize: 13 },
  streakNum: { ...font('extrabold', 14, { color: palette.grey600 }), fontVariant: ['tabular-nums'] },

  todayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 18 },
  sectionLabel: { ...font('bold', 10.5, { color: palette.grey500 }), letterSpacing: 1.4 },
  sectionMeta: font('semibold', 11.5, { color: palette.grey600 }),
  sectionMetaStrong: font('extrabold', 11.5, { color: palette.ink }),
  todayRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  panel: { flex: 1, borderRadius: radius.lg, borderWidth: 1, padding: 12 },
  panelIdle: { backgroundColor: '#F7F8F7', borderColor: palette.dividerSoft },
  panelTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  panelDot: { width: 7, height: 7, borderRadius: 4 },
  panelName: { ...font('bold', 12.5, { color: palette.inkSoft }), flex: 1 },
  panelCheck: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  panelCheckText: font('extrabold', 10, { color: palette.white }),
  panelValue: { ...font('extrabold', 22, { marginTop: 8 }), fontVariant: ['tabular-nums'], letterSpacing: -0.4 },
  panelUnit: font('semibold', 12, { color: palette.grey500 }),
  panelWaiting: { ...font('extrabold', 18, { color: palette.grey450, marginTop: 10 }), letterSpacing: -0.3 },
  panelCaption: font('medium', 11, { color: palette.grey500, marginTop: 2 }),

  callout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    backgroundColor: '#FBF7F8',
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  calloutIcon: { fontSize: 15 },
  calloutText: { ...font('semibold', 13, { color: palette.inkSoft }), flex: 1, lineHeight: 18 },

  weekHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 18 },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  dayCell: { alignItems: 'center', gap: 6 },
  dayDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    overflow: 'hidden',
    backgroundColor: '#F1F3F1',
  },
  dayDotToday: { borderWidth: 2, borderColor: palette.ink },
  dayHalves: { flex: 1, flexDirection: 'row' },
  dayHalf: { flex: 1 },
  dayFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dayCheck: font('extrabold', 12, { color: palette.white }),
  dayLetter: font('semibold', 10, { color: palette.grey500 }),
  dayLetterToday: font('extrabold', 10, { color: palette.ink }),
  legend: { flexDirection: 'row', gap: 14, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 },
  legendSwatch: { width: 8, height: 8, borderRadius: 4 },
  legendText: font('medium', 11, { color: palette.grey600 }),

  milestone: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: palette.dividerSoft,
  },
  milestoneHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  milestoneLabel: font('bold', 12.5, { color: palette.inkSoft }),
  milestoneValue: { ...font('semibold', 11.5, { color: palette.grey600 }), fontVariant: ['tabular-nums'] },
  barTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F1F3F1',
    overflow: 'hidden',
    marginTop: 8,
  },
  barFill: { height: '100%', borderRadius: 4, overflow: 'hidden' },

  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  primary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: palette.ink,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingLeft: 20,
    paddingRight: 7,
  },
  primaryText: font('bold', 14.5, { color: palette.white }),
  primaryArrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryArrowText: font('bold', 14, { color: palette.white }),
  secondary: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderRadius: radius.pill,
    backgroundColor: palette.white,
    borderWidth: 1.5,
    borderColor: palette.borderStrong,
  },
  secondaryText: font('bold', 14.5, { color: palette.ink }),
});

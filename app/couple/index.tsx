import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ModalHeader } from '@/components/ModalHeader';
import {
  Card,
  GradientCard,
  PressableScale,
  PrimaryButton,
  ProgressBar,
  Screen,
  SectionLabel,
  StatTile,
} from '@/components/ui';
import { track } from '@/lib/analytics';
import {
  contributionSplit,
  trackerHistory,
  trackerSummary,
  weeklyPace,
  type TrackerDay,
} from '@/domain/coupleTracker';
import { dayKey, weekdayLetter } from '@/domain/progression';
import { useCouple } from '@/state/useCouple';
import { useAuthStore } from '@/state/authStore';
import { useProfileStore } from '@/state/profileStore';
import { font, text } from '@/theme/typography';
import { gradients, palette, radius } from '@/theme/tokens';

/** Four weeks reads as a month of effort without scrolling on a small phone. */
const WINDOW_DAYS = 28;

/**
 * The couple tracker — the bond's own screen.
 *
 * Everything here is derived from what the couple doc already stores, so this
 * screen adds no Firestore writes and no new rules (see `domain/coupleTracker`
 * for why that constraint is deliberate). The weekly target reuses the
 * athlete's own `weeklyGoal` from their profile rather than inventing a shared
 * one two people would have to agree on.
 */
export default function CoupleTrackerScreen() {
  const router = useRouter();
  const { couple, paired, partner, streak, combined, level, loading } = useCouple();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const weeklyGoal = useProfileStore((s) => s.weeklyGoal);
  const displayName = useProfileStore((s) => s.displayName);

  const today = dayKey();
  const viewerUid = uid ?? '';

  const history = useMemo(
    () => trackerHistory(couple, viewerUid, today, WINDOW_DAYS),
    [couple, viewerUid, today],
  );
  const summary = useMemo(
    () => trackerSummary(couple, viewerUid, today, WINDOW_DAYS),
    [couple, viewerUid, today],
  );
  const pace = useMemo(
    () => weeklyPace(couple, viewerUid, today, weeklyGoal),
    [couple, viewerUid, today, weeklyGoal],
  );
  const split = useMemo(
    () => contributionSplit(couple, viewerUid, today, WINDOW_DAYS),
    [couple, viewerUid, today],
  );

  if (loading) {
    return (
      <Screen>
        <ModalHeader title="Your bond" />
        <View style={styles.loading}>
          <ActivityIndicator color={palette.green500} />
        </View>
      </Screen>
    );
  }

  /* Not paired yet — preview the tracker rather than apologising for it.
     `previewDays` is a real 28-day grid with every day empty, rendered muted:
     the shape of what pairing gives them, not a promise in prose. */
  if (!paired || !partner) {
    const previewDays = trackerHistory(null, viewerUid, today, WINDOW_DAYS);
    const myInitial = (displayName?.trim()?.charAt(0) || 'A').toUpperCase();

    return (
      <Screen>
        <ModalHeader title="Your bond" />

        {/* Show the thing rather than describing it. A bare paragraph asking
            someone to go find a partner is the weakest possible pitch; a
            greyed-out preview of their own future calendar, with the two
            avatars that would fill it, makes the empty state the argument. */}
        <Animated.View entering={FadeInDown.duration(380).springify()}>
          <GradientCard colors={gradients.brandDeep} glow="brand" style={styles.emptyHero}>
            <View style={styles.emptyAvatars}>
              <View style={styles.emptyAvatarMe}>
                <Text style={styles.emptyAvatarText}>{myInitial}</Text>
              </View>
              <View style={styles.emptyPlus}>
                <Text style={styles.emptyPlusText}>+</Text>
              </View>
              <View style={styles.emptyAvatarThem}>
                <Text style={styles.emptyAvatarQ}>?</Text>
              </View>
            </View>
            <Text style={styles.emptyHeroTitle}>Train together</Text>
            <Text style={styles.emptyHeroCopy}>
              Your streak only survives on days you both show up. Reps combine into one total.
            </Text>
          </GradientCard>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).duration(320)}>
          <Card style={styles.emptyPreviewCard}>
            <Text style={styles.emptyPreviewLabel}>WHAT YOU&rsquo;LL SEE</Text>
            <Calendar days={previewDays} muted />
            <Text style={[text.caption, styles.emptyPreviewNote]}>
              A month of who trained which day, filled in from your first shared session.
            </Text>
          </Card>
        </Animated.View>

        <PrimaryButton
          label="Invite a partner"
          onPress={() => router.push('/modal/couple-invite')}
          style={styles.emptyButton}
        />

        {/* The QR lives on the invite screen, which owns pair-code creation —
            a code has to exist before there is anything to encode. Offering
            the scanner here covers the other half: the person who was *sent*
            an invite and has the code on someone else's screen in front of
            them. Without it they have to guess that "Invite a partner" is also
            where you accept one. */}
        <PressableScale
          onPress={() => router.push('/modal/couple-scan')}
          accessibilityRole="button"
          accessibilityLabel="Scan a partner's QR code"
          style={styles.emptySecondary}
        >
          <Text style={styles.emptySecondaryText}>Scan their QR code</Text>
        </PressableScale>

        {/* Couple mode is unusable alone, so a screen that only offers pairing
            is a dead end for anyone not ready to invite someone. Training solo
            is always available and is what most people will do first. */}
        <PressableScale
          onPress={() => {
            track('session_started', { exercise: 'push', mode: 'practice' });
            router.replace({ pathname: '/session', params: { exercise: 'push', mode: 'practice' } });
          }}
          accessibilityRole="button"
          accessibilityLabel="Skip and train on your own"
          style={styles.emptySkip}
        >
          <Text style={styles.emptySkipText}>Skip — train on my own</Text>
        </PressableScale>
      </Screen>
    );
  }

  const partnerName = partner.displayName?.trim() || 'Partner';
  const consistencyPct = Math.round(summary.consistency * 100);

  return (
    <Screen>
      <ModalHeader title="Your bond" subtitle={`You & ${partnerName}`} />

      {/* Two tiles per row, matching recap.tsx and friend.tsx. Three across
          leaves ~68dp of text width on a 360dp phone, and `combined` is a
          cumulative all-time count — at 26px extrabold a five-digit total needs
          nearer 78dp, so the third tile would clip as soon as a couple got
          good. Two rows cost nothing and never truncate. */}
      <Animated.View entering={FadeInDown.duration(340).springify()}>
        <View style={styles.statRow}>
          <StatTile label="STREAK" value={streak} />
          <StatTile label="BEST RUN" value={summary.bestRun} />
        </View>
        <View style={[styles.statRow, styles.statRowGap]}>
          <StatTile label="REPS TOGETHER" value={combined.toLocaleString()} />
          <StatTile label="SHARED DAYS" value={summary.bothDays} />
        </View>
      </Animated.View>

      {/* ── Weekly pace ── */}
      <SectionLabel>THIS WEEK</SectionLabel>
      <Animated.View entering={FadeInDown.delay(60).duration(320)}>
        <Card>
          <View style={styles.paceHead}>
            <Text style={styles.paceCount}>
              {pace.bothDays}
              <Text style={styles.paceGoal}> / {pace.goal} days together</Text>
            </Text>
            {pace.met ? <Text style={styles.paceMet}>GOAL MET</Text> : null}
          </View>
          <ProgressBar percent={pace.progress} />
          <Text style={[text.caption, styles.paceHint]}>{paceHint(pace, partnerName)}</Text>
        </Card>
      </Animated.View>

      {/* ── Shared calendar ── */}
      <SectionLabel>LAST 4 WEEKS</SectionLabel>
      <Animated.View entering={FadeInDown.delay(110).duration(320)}>
        <Card>
          <Calendar days={history} />
          <View style={styles.legend}>
            <LegendDot color={palette.green500} label="Both" />
            <LegendDot color={palette.purple500} label="You" />
            <LegendDot color={palette.amber800} label={partnerName} />
            <LegendDot color={palette.grey400} label="Rest" />
          </View>
          <Text style={[text.caption, styles.legendNote]}>
            {summary.bothDays} shared {summary.bothDays === 1 ? 'day' : 'days'} · {consistencyPct}%
            of the last {WINDOW_DAYS} days
          </Text>
        </Card>
      </Animated.View>

      {/* ── Contribution ── */}
      {split ? (
        <>
          <SectionLabel>WHO PUT IN WHAT</SectionLabel>
          <Animated.View entering={FadeInDown.delay(160).duration(320)}>
            <Card>
              <View style={styles.splitBar}>
                <View
                  style={[
                    styles.splitFill,
                    { flex: Math.max(split.mine.share, 0.02), backgroundColor: palette.purple500 },
                  ]}
                />
                <View
                  style={[
                    styles.splitFill,
                    { flex: Math.max(split.theirs.share, 0.02), backgroundColor: palette.amber800 },
                  ]}
                />
              </View>

              <ContributionRow
                color={palette.purple500}
                name="You"
                reps={split.mine.reps}
                days={split.mine.activeDays}
              />
              <ContributionRow
                color={palette.amber800}
                name={partnerName}
                reps={split.theirs.reps}
                days={split.theirs.activeDays}
              />

              {/* Never name a "winner" between two people training together —
                  the balanced case gets its own line for exactly that reason. */}
              <Text style={[text.caption, styles.splitNote]}>
                {split.balanced
                  ? 'Evenly matched — you are carrying this together.'
                  : `${split.mine.share >= 0.5 ? 'You have' : `${partnerName} has`} logged more reps, but every shared day counts the same.`}
              </Text>
            </Card>
          </Animated.View>
        </>
      ) : null}

      {/* ── Level ── */}
      <SectionLabel>BOND LEVEL</SectionLabel>
      <Animated.View entering={FadeInDown.delay(210).duration(320)}>
        <Card>
          <View style={styles.levelRow}>
            <Text style={styles.levelName}>{level.name}</Text>
            <Text style={styles.levelNum}>LVL {level.level}</Text>
          </View>
          <ProgressBar percent={level.progress} />
          <PressableScale
            onPress={() => {
              track('share_opened', { kind: 'couple-card' });
              router.push('/modal/couple-card');
            }}
            accessibilityRole="button"
            accessibilityLabel="Share your bond card"
            style={styles.shareRow}
          >
            <Text style={styles.shareText}>Share your bond card</Text>
          </PressableScale>
        </Card>
      </Animated.View>
    </Screen>
  );
}

/* ------------------------------------------------------------------ *
 * Pieces
 * ------------------------------------------------------------------ */

/** Four-week grid, one column per day, wrapping a week per row. */
function Calendar({ days, muted }: { days: readonly TrackerDay[]; muted?: boolean }) {
  const weeks: TrackerDay[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <View>
      <View style={styles.weekRow}>
        {(weeks[0] ?? []).map((d) => (
          <Text key={`h-${d.day}`} style={styles.dayHeader}>
            {weekdayLetter(d.day)}
          </Text>
        ))}
      </View>
      {weeks.map((week, i) => (
        <View key={`w-${week[0]?.day ?? i}`} style={styles.weekRow}>
          {week.map((d) => (
            <View
              key={d.day}
              accessibilityLabel={`${d.day}: ${describeDay(d)}`}
              style={[
                styles.day,
                { backgroundColor: muted ? palette.border : dayColor(d) },
                d.isToday && styles.dayToday,
                d.isFuture && styles.dayFuture,
              ]}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function ContributionRow({
  color,
  name,
  reps,
  days,
}: {
  color: string;
  name: string;
  reps: number;
  days: number;
}) {
  return (
    <View style={styles.contribRow}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.contribName} numberOfLines={1}>
        {name}
      </Text>
      <Text style={styles.contribStat}>
        {reps} reps · {days} {days === 1 ? 'day' : 'days'}
      </Text>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Copy + colour
 * ------------------------------------------------------------------ */

function dayColor(day: TrackerDay): string {
  if (day.isFuture) return palette.border;
  switch (day.status) {
    case 'both':
      return palette.green500;
    case 'mine':
      return palette.purple500;
    case 'theirs':
      return palette.amber800;
    default:
      return palette.grey400;
  }
}

function describeDay(day: TrackerDay): string {
  if (day.isFuture) return 'upcoming';
  switch (day.status) {
    case 'both':
      return 'you both trained';
    case 'mine':
      return 'only you trained';
    case 'theirs':
      return 'only your partner trained';
    default:
      return 'rest day';
  }
}

function paceHint(
  pace: { met: boolean; outOfReach: boolean; mustTrainDaily: boolean; goal: number; bothDays: number },
  partnerName: string,
): string {
  if (pace.met) return `You have hit your target with ${partnerName}. Anything more is a bonus.`;
  if (pace.outOfReach) {
    return `This week got away from you — the streak is what matters, and it survives a rest day.`;
  }
  if (pace.mustTrainDaily) return `Train together today to stay on pace.`;
  const left = pace.goal - pace.bothDays;
  return `${left} more shared ${left === 1 ? 'day' : 'days'} to hit your weekly target.`;
}

const styles = StyleSheet.create({
  loading: { paddingVertical: 48, alignItems: 'center' },

  /* `GradientCard` only sets borderRadius + overflow — it carries no padding of
     its own, so the horizontal value has to live here or the centred copy runs
     into both gradient edges. 20 matches the paywall hero. */
  emptyHero: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20, gap: 6 },
  emptyAvatars: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  emptyAvatarMe: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyAvatarThem: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -14,
  },
  emptyAvatarText: font('extrabold', 22, { color: palette.white }),
  emptyAvatarQ: font('extrabold', 22, { color: 'rgba(255,255,255,0.6)' }),
  emptyPlus: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -14,
    zIndex: 1,
  },
  emptyPlusText: font('extrabold', 17, { color: palette.green600 }),
  emptyHeroTitle: font('extrabold', 21, { color: palette.white }),
  emptyHeroCopy: {
    ...font('semibold', 13.5, { color: 'rgba(255,255,255,0.88)' }),
    textAlign: 'center',
    lineHeight: 19,
  },

  emptyPreviewCard: { marginTop: 14 },
  emptyPreviewLabel: {
    ...font('extrabold', 10.5, { color: palette.grey600, letterSpacing: 0.7 }),
    marginBottom: 10,
  },
  emptyPreviewNote: { marginTop: 10 },
  emptyButton: { marginTop: 16 },
  emptySecondary: {
    marginTop: 10,
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: palette.green500,
  },
  emptySecondaryText: font('extrabold', 14, { color: palette.green600 }),
  emptySkip: { marginTop: 14, alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 16 },
  emptySkipText: font('bold', 13.5, { color: palette.grey600 }),

  statRow: { flexDirection: 'row', gap: 10 },
  statRowGap: { marginTop: 10 },

  paceHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  paceCount: font('extrabold', 20, { color: palette.ink }),
  paceGoal: font('bold', 14, { color: palette.grey600 }),
  paceMet: font('extrabold', 11, { color: palette.green600, letterSpacing: 0.6 }),
  paceHint: { marginTop: 8 },

  weekRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  dayHeader: {
    flex: 1,
    textAlign: 'center',
    ...font('bold', 10, { color: palette.grey450 }),
  },
  day: { flex: 1, aspectRatio: 1, borderRadius: radius.xs },
  dayToday: { borderWidth: 2, borderColor: palette.ink },
  dayFuture: { opacity: 0.45 },

  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '46%' },
  legendLabel: font('bold', 11, { color: palette.grey600 }),
  legendNote: { marginTop: 8 },

  splitBar: {
    flexDirection: 'row',
    height: 12,
    borderRadius: radius.xs,
    overflow: 'hidden',
    marginBottom: 12,
  },
  splitFill: { height: '100%' },
  contribRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  contribName: { flex: 1, ...font('extrabold', 14, { color: palette.ink }) },
  contribStat: font('bold', 12.5, { color: palette.grey600 }),
  splitNote: { marginTop: 8 },

  dot: { width: 10, height: 10, borderRadius: 5 },

  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  levelName: font('extrabold', 17, { color: palette.ink }),
  levelNum: font('extrabold', 12, { color: palette.grey600, letterSpacing: 0.6 }),
  shareRow: { marginTop: 12, alignSelf: 'flex-start' },
  shareText: font('extrabold', 13, { color: palette.green600 }),
});

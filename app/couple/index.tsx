import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ModalHeader } from '@/components/ModalHeader';
import { Card, PressableScale, ProgressBar, Screen, SectionLabel, StatTile } from '@/components/ui';
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
import { palette, radius } from '@/theme/tokens';

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

  /* Not paired yet — send them to the invite rather than showing an empty
     tracker. A grid of blank days is a worse answer than the one action that
     would fill it. */
  if (!paired || !partner) {
    return (
      <Screen>
        <ModalHeader title="Your bond" />
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No partner yet</Text>
          <Text style={text.caption}>
            Couple mode tracks the days you both train. Invite someone and this fills in from
            your first shared session.
          </Text>
          <PressableScale
            onPress={() => router.push('/modal/couple-invite')}
            accessibilityRole="button"
            accessibilityLabel="Invite a partner"
            style={styles.emptyCta}
          >
            <Text style={styles.emptyCtaText}>Invite a partner</Text>
          </PressableScale>
        </Card>
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
function Calendar({ days }: { days: readonly TrackerDay[] }) {
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
                { backgroundColor: dayColor(d) },
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

  emptyCard: { gap: 12 },
  emptyTitle: font('extrabold', 17, { color: palette.ink }),
  emptyCta: {
    marginTop: 4,
    alignSelf: 'flex-start',
    backgroundColor: palette.green500,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.md,
  },
  emptyCtaText: font('extrabold', 14, { color: palette.white }),

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

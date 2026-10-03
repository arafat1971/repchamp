import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ModalHeader } from '@/components/ModalHeader';
import { PressableScale, Screen } from '@/components/ui';
import { JourneyCard } from '@/components/together/JourneyCard';
import { ActionList, ActionRow, LineIcon, PairPitch, SectionTitle, Surface, TogetherHero } from '@/components/together/kit';
import { ME, THEM } from '@/components/together/RitualCard';
import { HABITS, journey } from '@/domain/ritual';
import { useRitualStore } from '@/state/ritualStore';
import { track } from '@/lib/analytics';
import {
  contributionSplit,
  trackerHistory,
  trackerSummary,
  weeklyPace,
  type TrackerDay,
} from '@/domain/coupleTracker';
import {
  coupleDailyDetail,
  coupleExerciseInsight,
  myExerciseBreakdown,
} from '@/domain/coupleExercises';
import { pluralise } from '@/domain/plural';
import { dayKey, lastNDayKeys, weekdayLetter } from '@/domain/progression';
import { getExercise } from '@/vision/exercises';
import { useCouple } from '@/state/useCouple';
import { useAuthStore } from '@/state/authStore';
import { useProfileStore } from '@/state/profileStore';
import { font, text } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

/** Four weeks reads as a month of effort without scrolling on a small phone. */
const WINDOW_DAYS = 28;

/** Inner padding for every Card here; matches recap.tsx. */
const CARD_PADDING = 16;

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
  const avatarUri = useProfileStore((s) => s.avatarUri);
  const ritualHistory = useRitualStore((s) => s.history);
  const sessions = useProfileStore((s) => s.sessions);

  const today = dayKey();
  const viewerUid = uid ?? '';

  const history = useMemo(
    () => trackerHistory(couple, viewerUid, today, WINDOW_DAYS),
    [couple, viewerUid, today],
  );
  /* My own movements over the same window the rest of the screen uses. Read
     from local sessions rather than the couple doc, which stores only
     `trainedDays` and `totalReps` — see `domain/coupleExercises` for why
     widening that document was the wrong route. */
  const breakdown = useMemo(
    () => myExerciseBreakdown(sessions, new Set(lastNDayKeys(WINDOW_DAYS))),
    [sessions],
  );
  const insight = useMemo(() => coupleExerciseInsight(breakdown), [breakdown]);

  /* Day-by-day, newest first. Two shapes on purpose: my rows carry reps and
     movements, my partner's carry only whether they trained — that is the
     whole of what `couples/{id}` knows about them. */
  const dailyLog = useMemo(() => coupleDailyDetail(history, sessions, 10), [history, sessions]);

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

    return (
      <Screen>
        <ModalHeader title="Your bond" />

        <Animated.View entering={FadeInDown.duration(380).springify()}>
          <PairPitch
            name={displayName?.trim() || 'You'}
            uri={avatarUri}
            title="Train together"
            body="Your streak only survives on days you both show up. Reps combine into one total."
            onInvite={() => router.push('/modal/couple-invite')}
            onScan={() => router.push('/modal/couple-scan')}
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).duration(320)}>
          <Surface style={styles.emptyPreviewCard}>
            <Text style={styles.emptyPreviewLabel}>WHAT YOU&rsquo;LL SEE</Text>
            <Calendar days={previewDays} muted />
            <Text style={[text.caption, styles.emptyPreviewNote]}>
              A month of who trained which day, filled in from your first shared session.
            </Text>
          </Surface>
        </Animated.View>

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
  const myName = displayName?.trim() || 'You';
  const consistencyPct = Math.round(summary.consistency * 100);
  const bondDay = new Map(history.map((h) => [h.day, h.status]));
  const noBondReps = !split || (split.mine.reps === 0 && split.theirs.reps === 0);
  const longView = journey(ritualHistory, today);

  return (
    <Screen>
      <ModalHeader title="Your bond" subtitle={`You and ${partnerName}`} />

      {/* The bond at a glance: who, how long in a row, and what it adds up to.
          The link between the two avatars lights up on a day you both trained,
          so the hero answers "are we good today?" before any number does. */}
      <Animated.View entering={FadeInDown.duration(340)}>
        <TogetherHero
          lit={bondDay.get(today) === 'both'}
          me={{ name: myName, uri: avatarUri, color: ME }}
          them={{ name: partnerName, uri: partner.avatarUrl, color: THEM }}
          streak={streak}
          caption={`Best run ${pluralise(summary.bestRun, 'day')}`}
          stats={[
            { value: combined.toLocaleString(), label: 'reps together' },
            { value: String(summary.bothDays), label: 'shared days' },
            { value: `${consistencyPct}%`, label: `of ${pluralise(WINDOW_DAYS, 'day')}` },
          ]}
          level={{
            label: `Level ${level.level} · ${level.name}`,
            detail: level.nextAt ? `${level.points} / ${level.nextAt} XP` : 'Top level',
            progress: level.progress,
          }}
          footer={
              <PressableScale
                onPress={() => {
                  track('share_opened', { kind: 'couple-card' });
                  router.push('/modal/couple-card');
                }}
                accessibilityRole="button"
                accessibilityLabel="Share your bond card"
                style={styles.heroShare}
              >
                <LineIcon name="share" size={16} color={palette.white} />
                <Text style={styles.heroShareText}>Share your bond card</Text>
              </PressableScale>
          }
        />
      </Animated.View>

      {/* Today lives on its own screen: this one is the bond's history. */}
      <ActionList>
        <ActionRow
          flat
          icon="today"
          title="Today, together"
          sub="The live stage, your daily ritual, and what happened today"
          onPress={() => router.push('/couple/partner')}
        />
        <ActionRow
          flat
          rule
          icon="target"
          tint={palette.amber800}
          title="Daily challenge"
          sub="Today’s set to beat — and whether you both did it"
          onPress={() => router.push('/modal/daily')}
        />
      </ActionList>

      <SectionTitle title="Your ritual" aside={longView.since ? `since ${shortDate(longView.since)}` : undefined} />
      <JourneyCard journey={longView} total={HABITS.length} />

      <SectionTitle title="This week" aside={`${pace.bothDays} of ${pace.goal} days`} />
      <Surface style={styles.pad}>
        <View style={styles.segments}>
          {Array.from({ length: Math.max(1, pace.goal) }, (_, i) => (
            <View key={i} style={[styles.segment, { backgroundColor: i < pace.bothDays ? palette.green500 : palette.track }]} />
          ))}
        </View>
        <Text style={styles.note}>{paceHint(pace, partnerName)}</Text>
      </Surface>

      <SectionTitle title="Last four weeks" aside={`${summary.bothDays} shared`} />
      <Surface style={styles.pad}>
        <Calendar days={history} />
        <View style={styles.legend}>
          <LegendDot color={palette.green500} label="Both" />
          <LegendDot color={ME} label="You" />
          <LegendDot color={THEM} label={partnerName} />
          <LegendDot color={palette.track} label="Rest" />
        </View>
      </Surface>

      <SectionTitle title="Who put in what" />
      <Surface style={styles.pad}>
        {noBondReps || !split ? (
          <Text style={styles.quiet}>
            No reps in the bond yet. Sets you do in Train together mode count here and keep your streak.
          </Text>
        ) : (
          <>
            <View style={styles.splitBar}>
              <View style={[styles.splitFill, { flex: Math.max(split.mine.share, 0.02), backgroundColor: ME }]} />
              <View style={[styles.splitFill, { flex: Math.max(split.theirs.share, 0.02), backgroundColor: THEM }]} />
            </View>
            <ContributionRow color={ME} name="You" reps={split.mine.reps} days={split.mine.activeDays} />
            <ContributionRow color={THEM} name={partnerName} reps={split.theirs.reps} days={split.theirs.activeDays} />
            <Text style={styles.note}>
              {split.balanced
                ? 'Evenly matched.'
                : `${split.mine.share >= 0.5 ? 'You have' : `${partnerName} has`} logged more reps. Every shared day counts the same.`}
            </Text>
          </>
        )}
      </Surface>

      {/* Mine only, and labelled as such: a partner's per-exercise history
          never reaches this device, so this shows my half and says so. */}
      {breakdown.total > 0 ? (
        <>
          <SectionTitle title="Your movements" aside="this month" />
          <Surface style={styles.pad}>
            {breakdown.mine.map((habit, i) => (
              <View key={habit.exercise} style={[styles.moveRow, i > 0 && styles.rule]}>
                <View style={styles.moveHead}>
                  <Text style={styles.moveName}>{getExercise(habit.exercise).label}</Text>
                  <Text style={styles.moveStat}>
                    {habit.reps} {habit.reps === 1 ? 'rep' : 'reps'} · {habit.days} {habit.days === 1 ? 'day' : 'days'}
                  </Text>
                </View>
                <View style={styles.moveTrack}>
                  <View style={[styles.moveFill, { width: `${Math.max(2, Math.round(habit.share * 100))}%` }]} />
                </View>
              </View>
            ))}
            <Text style={styles.note}>
              {insight.kind === 'mine-only'
                ? `Mostly ${getExercise(insight.signature).label.toLowerCase()}, ${Math.round(insight.share * 100)}% of your reps.`
                : 'A good spread across your movements.'}{' '}
              {partnerName}&rsquo;s breakdown stays on their phone.
            </Text>
          </Surface>
        </>
      ) : null}

      {dailyLog.length > 0 ? (
        <>
          <SectionTitle title="Day by day" />
          <Surface style={styles.pad}>
            {dailyLog.map((d, i) => {
              const status = bondDay.get(d.day);
              const credited = status === 'mine' || status === 'both';
              return (
                <View key={d.day} style={[styles.logRow, i > 0 && styles.rule]}>
                  <View style={styles.logDate}>
                    <Text style={styles.logDay}>{weekdayLetter(d.day)}</Text>
                    <Text style={styles.logNum}>{Number(d.day.slice(8, 10))}</Text>
                  </View>
                  <View style={styles.logBody}>
                    <Text style={styles.logMine}>
                      {d.myReps > 0 ? `You, ${d.myReps} ${d.myReps === 1 ? 'rep' : 'reps'}` : 'You rested'}
                      {d.myReps > 0 && !credited ? <Text style={styles.logSolo}>  solo</Text> : null}
                    </Text>
                    {d.myExercises.length > 0 ? (
                      <Text style={styles.logSub}>
                        {d.myExercises.map((e) => `${getExercise(e.exercise).label} ${e.reps}`).join(' · ')}
                      </Text>
                    ) : null}
                    <Text style={styles.logSub}>{d.theyTrained ? `${partnerName} trained` : `${partnerName} rested`}</Text>
                  </View>
                  {d.both ? (
                    <View style={styles.logBoth}>
                      <Text style={styles.logBothText}>Together</Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
            {dailyLog.some((d) => d.myReps > 0 && !(bondDay.get(d.day) === 'mine' || bondDay.get(d.day) === 'both')) ? (
              <Text style={styles.note}>Solo sets are yours; only Train together sets count toward the bond.</Text>
            ) : null}
          </Surface>
        </>
      ) : null}
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
                { backgroundColor: muted ? palette.track : dayColor(d) },
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
        {reps} {reps === 1 ? 'rep' : 'reps'} · {days} {days === 1 ? 'day' : 'days'}
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
  if (day.isFuture) return palette.divider;
  switch (day.status) {
    case 'both':
      return palette.green500;
    case 'mine':
      return ME;
    case 'theirs':
      return THEM;
    default:
      return palette.track;
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

/** "25 Sep" — short, and in the phone's own month names. */
function shortDate(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y as number, (m as number) - 1, d as number).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
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

  emptyPreviewCard: { marginTop: 14, padding: CARD_PADDING },
  emptyPreviewLabel: {
    ...font('extrabold', 10.5, { color: palette.grey600, letterSpacing: 0.7 }),
    marginBottom: 10,
  },
  emptyPreviewNote: { marginTop: 10 },
  emptySkip: { marginTop: 14, alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 16 },
  emptySkipText: font('bold', 13.5, { color: palette.grey600 }),

  pad: { padding: 18 },
  heroShare: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  heroShareText: font('bold', 14, { color: palette.white }),

  segments: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 8, borderRadius: 4 },
  note: { marginTop: 12, ...font('regular', 12.5, { color: palette.slate500 }) },
  quiet: font('regular', 14, { color: palette.slate500 }),

  weekRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  dayHeader: { flex: 1, textAlign: 'center', ...font('semibold', 10.5, { color: palette.grey500 }) },
  day: { flex: 1, aspectRatio: 1, borderRadius: 8 },
  dayToday: { borderWidth: 2, borderColor: palette.ink },
  dayFuture: { opacity: 0.45 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '46%' },
  legendLabel: font('medium', 12, { color: palette.slate500 }),

  splitBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2, marginBottom: 10 },
  splitFill: { height: '100%' },
  contribRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  contribName: { flex: 1, ...font('semibold', 15, { color: palette.ink }) },
  contribStat: font('medium', 13, { color: palette.slate500 }),

  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.divider },
  moveRow: { paddingVertical: 10 },
  moveHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  moveName: font('semibold', 15, { color: palette.ink }),
  moveStat: font('medium', 12, { color: palette.slate500 }),
  moveTrack: { height: 4, borderRadius: 2, backgroundColor: palette.track, overflow: 'hidden', marginTop: 8 },
  moveFill: { height: 4, borderRadius: 2, backgroundColor: ME },

  logRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 },
  logDate: { width: 30, alignItems: 'center' },
  logDay: font('semibold', 10.5, { color: palette.grey500 }),
  logNum: font('extrabold', 17, { color: palette.ink }),
  logBody: { flex: 1 },
  logMine: font('semibold', 15, { color: palette.ink }),
  logSolo: font('medium', 12, { color: palette.grey500 }),
  logSub: { ...font('regular', 12.5, { color: palette.slate500 }), marginTop: 1 },
  logBoth: { backgroundColor: palette.green50, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  logBothText: font('semibold', 12, { color: palette.green700 }),

  dot: { width: 8, height: 8, borderRadius: 4 },
});

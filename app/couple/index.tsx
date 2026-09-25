import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Image } from 'expo-image';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ModalHeader } from '@/components/ModalHeader';
import { Avatar, Card, GradientCard, PressableScale, PrimaryButton, Screen } from '@/components/ui';
import { ME, THEM } from '@/components/together/RitualCard';
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
import { dayKey, lastNDayKeys, weekdayLetter } from '@/domain/progression';
import { getExercise } from '@/vision/exercises';
import { useCouple } from '@/state/useCouple';
import { useAuthStore } from '@/state/authStore';
import { useProfileStore } from '@/state/profileStore';
import { font, text } from '@/theme/typography';
import { gradients, palette, radius } from '@/theme/tokens';

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
              {/* 🫶, matching the invite screen's pitch. A bare "+" said
                  "add a person"; the two couple surfaces should make the same
                  gesture at the same joint. */}
              <View style={styles.emptyPlus}>
                <Text style={styles.emptyJoinGlyph}>🫶</Text>
              </View>
              {/* Same empty seat as the invite screen's pitch, and the same
                  reasoning: a bare "?" reads as an error rather than an
                  invitation. The two couple surfaces must agree. */}
              <View style={styles.emptyAvatarThem}>
                <Image
                  source={require('../../assets/logo.png')}
                  style={styles.emptyPartnerLogo}
                  contentFit="cover"
                  accessibilityLabel="Your partner's empty seat"
                />
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
  const myName = displayName?.trim() || 'You';
  const consistencyPct = Math.round(summary.consistency * 100);
  const bondDay = new Map(history.map((h) => [h.day, h.status]));
  const noBondReps = !split || (split.mine.reps === 0 && split.theirs.reps === 0);

  return (
    <Screen>
      <ModalHeader title="Your bond" subtitle={`You and ${partnerName}`} />

      {/* The bond at a glance: who, how long in a row, and what it adds up to. */}
      <Animated.View entering={FadeInDown.duration(340)}>
        <Card style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.pair}>
              <View style={styles.pairRing}>
                <Avatar initial={myName.charAt(0).toUpperCase()} uri={avatarUri} size={44} background={ME} color={palette.white} />
              </View>
              <View style={[styles.pairRing, styles.pairSecond]}>
                <Avatar initial={partnerName.charAt(0).toUpperCase()} uri={partner.avatarUrl} size={44} background={THEM} color={palette.white} />
              </View>
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.heroStreak}>
                {streak}
                <Text style={styles.heroUnit}> {streak === 1 ? 'day' : 'days'} in a row</Text>
              </Text>
              <Text style={styles.heroSub}>
                Best run {summary.bestRun} · Level {level.level}, {level.name}
              </Text>
            </View>
          </View>
          <View style={styles.levelTrack}>
            <View style={[styles.levelFill, { width: `${Math.max(2, Math.round(level.progress))}%` }]} />
          </View>
          <View style={styles.figures}>
            <Figure value={combined.toLocaleString()} label="reps together" />
            <View style={styles.figureRule} />
            <Figure value={String(summary.bothDays)} label="shared days" />
            <View style={styles.figureRule} />
            <Figure value={`${consistencyPct}%`} label={`of ${WINDOW_DAYS} days`} />
          </View>
          <PressableScale
            onPress={() => {
              track('share_opened', { kind: 'couple-card' });
              router.push('/modal/couple-card');
            }}
            accessibilityRole="button"
            accessibilityLabel="Share your bond card"
            style={styles.heroShare}
          >
            <Text style={styles.heroShareText}>Share your bond card</Text>
          </PressableScale>
        </Card>
      </Animated.View>

      {/* Today lives on its own screen: this one is the bond's history. */}
      <PressableScale
        onPress={() => router.push('/couple/partner')}
        accessibilityRole="button"
        accessibilityLabel={`Open today with ${partnerName}`}
        style={styles.todayRow}
      >
        <View style={styles.todayCopy}>
          <Text style={styles.todayTitle}>Today, together</Text>
          <Text style={styles.todaySub}>The live stage, your daily ritual, and what happened today</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </PressableScale>

      <Heading title="This week" aside={`${pace.bothDays} of ${pace.goal} days`} />
      <Card style={styles.pad}>
        <View style={styles.segments}>
          {Array.from({ length: Math.max(1, pace.goal) }, (_, i) => (
            <View key={i} style={[styles.segment, { backgroundColor: i < pace.bothDays ? palette.green500 : palette.track }]} />
          ))}
        </View>
        <Text style={styles.note}>{paceHint(pace, partnerName)}</Text>
      </Card>

      <Heading title="Last four weeks" aside={`${summary.bothDays} shared`} />
      <Card style={styles.pad}>
        <Calendar days={history} />
        <View style={styles.legend}>
          <LegendDot color={palette.green500} label="Both" />
          <LegendDot color={ME} label="You" />
          <LegendDot color={THEM} label={partnerName} />
          <LegendDot color={palette.track} label="Rest" />
        </View>
      </Card>

      <Heading title="Who put in what" />
      <Card style={styles.pad}>
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
      </Card>

      {/* Mine only, and labelled as such: a partner's per-exercise history
          never reaches this device, so this shows my half and says so. */}
      {breakdown.total > 0 ? (
        <>
          <Heading title="Your movements" aside="this month" />
          <Card style={styles.pad}>
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
          </Card>
        </>
      ) : null}

      {dailyLog.length > 0 ? (
        <>
          <Heading title="Day by day" />
          <Card style={styles.pad}>
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
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

/* ------------------------------------------------------------------ *
 * Pieces
 * ------------------------------------------------------------------ */

/** A section title in sentence case, with an optional quiet fact on the right. */
function Heading({ title, aside }: { title: string; aside?: string }) {
  return (
    <View style={styles.heading}>
      <Text style={styles.headingTitle}>{title}</Text>
      {aside ? <Text style={styles.headingAside}>{aside}</Text> : null}
    </View>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.figure}>
      <Text style={styles.figureValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.figureLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

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
  todayLink: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    backgroundColor: palette.green50,
  },
  todayLinkText: { ...font('bold', 14), color: palette.green700 },
  loading: { paddingVertical: 48, alignItems: 'center' },
  paddedCard: { padding: CARD_PADDING },

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
    // Clips the logo tile to the ring — see couple-invite.tsx.
    overflow: 'hidden',
    marginLeft: -14,
  },
  emptyAvatarText: font('extrabold', 22, { color: palette.white }),
  /* One figure, not a pair — see couple-invite.tsx. Held slightly transparent
     so the filled seat opposite stays the dominant one. */
  /* Same empty seat as the invite pitch — see couple-invite.tsx for why this
     fills and is clipped rather than being inset. */
  emptyPartnerLogo: { width: '100%', height: '100%', opacity: 0.9 },
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
  emptyJoinGlyph: { fontSize: 16 },
  emptyHeroTitle: font('extrabold', 21, { color: palette.white }),
  emptyHeroCopy: {
    ...font('semibold', 13.5, { color: 'rgba(255,255,255,0.88)' }),
    textAlign: 'center',
    lineHeight: 19,
  },

  /* `Card` carries no padding of its own — only background, radius and shadow,
     the same gap `GradientCard` has. Without this the label, grid and note all
     render flush to the card edges and the two-line note spills past the bottom
     rounded corner. 16 matches recap.tsx's chartCard. */
  emptyPreviewCard: { marginTop: 14, padding: CARD_PADDING },
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

  pad: { padding: 18 },
  hero: { padding: 18 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  pair: { flexDirection: 'row' },
  pairRing: { borderRadius: 26, borderWidth: 3, borderColor: palette.white },
  pairSecond: { marginLeft: -14 },
  heroCopy: { flex: 1 },
  heroStreak: font('extrabold', 30, { color: palette.ink }),
  heroUnit: font('semibold', 15, { color: palette.slate500 }),
  heroSub: { ...font('medium', 13, { color: palette.slate500 }), marginTop: 2 },
  levelTrack: { height: 4, borderRadius: 2, backgroundColor: palette.track, overflow: 'hidden', marginTop: 16 },
  levelFill: { height: 4, borderRadius: 2, backgroundColor: palette.ink },
  figures: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  figure: { flex: 1 },
  figureValue: font('extrabold', 20, { color: palette.ink }),
  figureLabel: { ...font('medium', 12, { color: palette.slate500 }), marginTop: 1 },
  figureRule: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: palette.divider, marginHorizontal: 12 },
  heroShare: { marginTop: 16, alignSelf: 'flex-start' },
  heroShareText: font('semibold', 14, { color: palette.ink }),

  todayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: radius.lg,
    backgroundColor: palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.divider,
  },
  todayCopy: { flex: 1 },
  todayTitle: font('semibold', 15, { color: palette.ink }),
  todaySub: { ...font('regular', 12, { color: palette.slate500 }), marginTop: 1 },
  chevron: font('semibold', 22, { color: palette.grey500 }),

  heading: { flexDirection: 'row', alignItems: 'baseline', marginTop: 24, marginBottom: 10, paddingHorizontal: 2 },
  headingTitle: { flex: 1, ...font('extrabold', 20, { color: palette.ink }) },
  headingAside: font('medium', 13, { color: palette.slate500 }),

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

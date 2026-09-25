import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown, FadeInRight, FadeInUp, FadeOutUp, ZoomIn } from 'react-native-reanimated';

import { ModalHeader } from '@/components/ModalHeader';
import { Avatar, Card, GradientCard, PressableScale, Screen, SectionLabel, Toggle } from '@/components/ui';
import { LiveStage } from '@/components/together/LiveStage';
import { RitualCard } from '@/components/together/RitualCard';
import { RitualWeekCard } from '@/components/together/RitualWeekCard';
import { bearLayers } from '@/components/widget/WidgetPreview';
import { track } from '@/lib/analytics';
import { captureError } from '@/lib/crash';
import {
  nudgeAt,
  partnerGoalToday,
  partnerHabitsToday,
  partnerHereAt,
  partnerLastDrinkToday,
  partnerPokeToday,
  partnerRepsToday,
} from '@/domain/couple';
import {
  HABITS,
  HERE_BEAT_MS,
  cleanPoke,
  cleanTicks,
  isHere,
  isNewPoke,
  ritualFor,
  ritualScore,
  ritualWeek,
  type HabitId,
  type Poke,
} from '@/domain/ritual';
import { DEFAULT_DAILY_GOAL_ML, formatMl } from '@/domain/hydration';
import { clockTime, tallyScore, todayMoments, type Moment } from '@/domain/moments';
import {
  partnerToday,
  sharingSummary,
  type SharedMetricKey,
} from '@/domain/partnerSharing';
import { dayKey } from '@/domain/progression';
import { rivalryLine, rivalryNudge, rivalryWith } from '@/domain/rivalry';
import { formatSteps } from '@/domain/steps';
import { nextOutfit, repsOnDay, WARDROBE } from '@/domain/waterWidget';
import { weekSoFar } from '@/domain/week';
import { nudgePartner } from '@/services/coupleService';
import {
  REMINDER_KINDS,
  reminderButton,
  reminderSentLine,
  type ReminderKind,
} from '@/domain/partnerReminder';
import {
  lightImpactHaptic,
  playBoopSound,
  playChimeSound,
  playPopSound,
  playReceiveSound,
  playSparkleSound,
  selectionHaptic,
  successHaptic,
} from '@/lib/feedback';
import { beatHere, sendPoke, syncRitualNow } from '@/services/ritualSync';
import { useRitualStore } from '@/state/ritualStore';
import { setMetricSharing, syncHydrationNow } from '@/services/hydrationSync';
import { useAuthStore } from '@/state/authStore';
import { useDuoStreakStore } from '@/state/duoStreakStore';
import { selectTodayMl, useHydrationStore } from '@/state/hydrationStore';
import { useProfileStore } from '@/state/profileStore';
import { useSharingStore } from '@/state/sharingStore';
import { useCouple } from '@/state/useCouple';
import { showDialog } from '@/state/useDialog';
import { usePartnerTodaySnapshot } from '@/state/usePartnerTodaySnapshot';
import { useStepsToday } from '@/state/useStepsToday';
import { getExercise } from '@/vision/exercises';
import { font, text } from '@/theme/typography';
import { gradients, palette, radius, type Gradient } from '@/theme/tokens';

const ME = palette.purple500;
const THEM = palette.amber500;
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * Today, together — the two of you, live, and one tap from each other.
 *
 * `couple/index` is the bond's history. This screen is today, and it is built
 * to be opened often: it leads with the living scene the home-screen widget
 * draws (same builder, same numbers), with the three things you can do to it
 * right there — splash, react, drink. Below it the day is told three ways:
 * the score (who leads on water, steps and reps), the moments (what happened
 * between you, newest first) and the streak (what you are building and what
 * it earns next). The competitive bits and the privacy switches follow.
 *
 * Everything on their side comes from the couple document, live via
 * `watchMyCouple`. Anything they have not shared renders as "not shared", never
 * as a zero — see `partnerSharing.ts`.
 */
export default function PartnerDashboardScreen() {
  const router = useRouter();
  const { couple, paired, partner } = useCouple();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const displayName = useProfileStore((s) => s.displayName);
  const avatarUrl = useProfileStore((s) => s.avatarUri);
  const sessions = useProfileStore((s) => s.sessions);
  const drinks = useHydrationStore((s) => s.drinks);
  const shareSteps = useSharingStore((s) => s.steps);
  const shareWater = useSharingStore((s) => s.water);
  const drinkUpdates = useSharingStore((s) => s.drinkUpdates);
  const setDrinkUpdates = useSharingStore((s) => s.setDrinkUpdates);
  const duoDays = useDuoStreakStore((s) => s.days);
  const snap = usePartnerTodaySnapshot();
  const { steps: myStepsState } = useStepsToday();
  const { width } = useWindowDimensions();
  const [sending, setSending] = useState<ReminderKind | null>(null);

  const today = dayKey();
  const iTrained = sessions.some((s) => s.day === today);
  const theirs = useMemo(() => partnerToday(partner, iTrained, today), [partner, iTrained, today]);

  const mySteps = myStepsState.status === 'ready' ? myStepsState.steps : null;
  const myWater = selectTodayMl({ drinks }, today);
  const myReps = useMemo(() => repsOnDay(sessions, today).reps, [sessions, today]);
  const theirReps = useMemo(() => partnerRepsToday(partner, today), [partner, today]);

  const partnerName = partner?.displayName?.trim() || 'Partner';
  const myName = displayName?.trim() || 'You';
  const myGoal = useHydrationStore((s) => s.goalMl);

  /* A clock for everything that ages on screen — "here", pokes, the sky —
     ticking every 15 s rather than reading the time mid-render. */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  /* ── Our daily ritual ── */
  const ritualDay = useRitualStore((s) => s.day);
  const storedTicks = useRitualStore((s) => s.ticks);
  const toggleStored = useRitualStore((s) => s.toggle);
  const myTicks = useMemo(() => (ritualDay === today ? storedTicks : []), [ritualDay, storedTicks, today]);
  const theirWaterShown = theirs.water.kind === 'shown' ? theirs.water.value : null;
  const theirStepsShown = theirs.steps.kind === 'shown' ? theirs.steps.value : null;
  const mineRitual = useMemo(
    () => ritualFor({ ml: myWater, goalMl: myGoal, steps: mySteps, reps: myReps, ticks: myTicks }),
    [myWater, myGoal, mySteps, myReps, myTicks],
  );
  const theirTicksKey = JSON.stringify(partnerHabitsToday(partner, today) ?? []);
  const theirRitual = useMemo(
    () =>
      ritualFor({
        ml: theirWaterShown,
        goalMl: partnerGoalToday(partner, today) ?? DEFAULT_DAILY_GOAL_ML,
        steps: theirStepsShown,
        reps: theirReps.reps,
        ticks: cleanTicks(JSON.parse(theirTicksKey)),
      }),
    // theirTicksKey stands in for the partner's tick list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theirWaterShown, theirStepsShown, theirReps.reps, theirTicksKey, today],
  );
  const myScore = ritualScore(mineRitual);
  const theirScore = ritualScore(theirRitual);
  const recordRitual = useRitualStore((s) => s.record);
  const ritualHistory = useRitualStore((s) => s.history);
  useEffect(() => {
    recordRitual(today, { me: myScore, them: theirScore });
  }, [recordRitual, today, myScore, theirScore]);
  const week7 = useMemo(() => ritualWeek(ritualHistory, today), [ritualHistory, today]);

  /* Publish my ticks on arrival, so a tick made offline reaches them. */
  useEffect(() => {
    void syncRitualNow(couple?.id, uid, myTicks);
  }, [couple?.id, uid, myTicks]);

  const onToggle = (id: HabitId) => {
    const ticks = toggleStored(today, id);
    const on = ticks.includes(id);
    if (on) {
      playChimeSound();
      successHaptic();
    } else {
      playBoopSound();
      selectionHaptic();
    }
    track('ritual_tick', { habit: id, on });
    void syncRitualNow(couple?.id, uid, ticks);
  };

  /* A toast for what happens on their side while you watch. */
  const [toast, setToast] = useState<{ key: number; text: string } | null>(null);
  const toastSeq = useRef(0);
  const say = useCallback((text: string) => {
    const key = ++toastSeq.current;
    setToast({ key, text });
    setTimeout(() => setToast((t) => (t?.key === key ? null : t)), 3600);
  }, []);

  /* Their habits, live: a new tick arrives with a sound and a line. */
  const prevTheirs = useRef<Set<string> | null>(null);
  useEffect(() => {
    const done = new Set(theirRitual.filter((h) => h.done).map((h) => h.habit.id));
    const before = prevTheirs.current;
    prevTheirs.current = done;
    if (!before) return;
    const fresh = HABITS.find((h) => done.has(h.id) && !before.has(h.id));
    if (!fresh) return;
    playReceiveSound();
    lightImpactHaptic();
    say(done.size === HABITS.length ? `${partnerName} finished the whole ritual 🏆` : `${partnerName} just did ${fresh.label.toLowerCase()} ${fresh.emoji}`);
  }, [theirRitual, partnerName, say]);

  /* Both perfect: once, with everything. */
  const celebrated = useRef(false);
  useEffect(() => {
    if (myScore === HABITS.length && theirScore === HABITS.length && !celebrated.current) {
      celebrated.current = true;
      playSparkleSound();
      successHaptic();
      say('A perfect day, together 🏆');
    }
  }, [myScore, theirScore, say]);
  const prevMine = useRef(myScore);
  useEffect(() => {
    if (myScore === HABITS.length && prevMine.current < HABITS.length && theirScore < HABITS.length) {
      playSparkleSound();
      say(`Your ritual is done ✨ ${HABITS.length - theirScore} to go for ${partnerName}`);
    }
    prevMine.current = myScore;
  }, [myScore, theirScore, partnerName, say]);

  /* ── Live together ── a heartbeat while this screen is in front. */
  useFocusEffect(
    useCallback(() => {
      void beatHere(couple?.id, uid);
      const id = setInterval(() => void beatHere(couple?.id, uid), HERE_BEAT_MS);
      return () => clearInterval(id);
    }, [couple?.id, uid]),
  );
  const hereAt = partnerHereAt(partner, today);
  const here = isHere(hereAt, now);
  const wasHere = useRef<boolean | null>(null);
  useEffect(() => {
    if (wasHere.current === false && here) {
      playReceiveSound();
      successHaptic();
      say(`${partnerName} just joined you ✨`);
    }
    wasHere.current = here;
  }, [here, partnerName, say]);
  const hereLine = here
    ? `${partnerName} is here with you`
    : hereAt && now - hereAt < 60 * 60_000
      ? `${partnerName} was here ${Math.max(1, Math.round((now - hereAt) / 60_000))} min ago`
      : `Tap ${partnerName}'s bear to send love`;

  /* Their pokes: shown once each, only while fresh, never replayed. */
  const poke = cleanPoke(partnerPokeToday(partner, today));
  const lastPoke = useRef<number | null>(null);
  const [incoming, setIncoming] = useState<{ e: string; at: number } | null>(null);
  useEffect(() => {
    if (lastPoke.current === null) {
      // First look: whatever is there is history, not a live moment.
      lastPoke.current = poke?.at ?? 0;
      return;
    }
    if (!isNewPoke(poke, lastPoke.current, Date.now())) return;
    lastPoke.current = poke!.at;
    setIncoming(poke);
    setTimeout(() => {
      playReceiveSound();
      lightImpactHaptic();
    }, 850);
    // Keyed by the poke's time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poke?.at]);
  const onPoke = (e: Poke) => {
    const ok = sendPoke(couple?.id, uid, e);
    if (ok) {
      playPopSound();
      lightImpactHaptic();
      track('couple_poke', { emoji: e, here });
    }
    return ok;
  };

  const moments = useMemo(() => {
    if (!partner) return [];
    const nudge = couple?.nudge;
    const at = nudge && nudge.fromUid !== uid ? (nudgeAt(couple ?? null) ?? 0) : 0;
    const fromThemToday = at > 0 && dayKey(new Date(at)) === today && (nudge?.emoji || nudge?.kind === 'water');
    const list = todayMoments({
      name: partnerName,
      theirDrink: partnerLastDrinkToday(partner, today),
      theirSet: theirReps.trainedAt > 0 ? { at: theirReps.trainedAt, reps: theirReps.reps, top: theirReps.topEx } : null,
      myDrinks: drinks
        .filter((d) => d.day === today)
        .map((d) => ({ ml: d.ml, at: Date.parse(d.at), kind: d.kind ?? null })),
      mySets: sessions
        .filter((s) => s.day === today)
        .map((s) => ({ reps: s.reps, at: Date.parse(s.completedAt), label: getExercise(s.exercise).label.toLowerCase() })),
      fromThem: fromThemToday ? { at, emoji: nudge?.emoji ?? null } : null,
    });
    const live = cleanPoke(partnerPokeToday(partner, today));
    if (!live) return list;
    return [{ at: live.at, emoji: live.e, text: `${partnerName} sent you ${live.e} live`, who: 'them' as const }, ...list]
      .sort((x, y) => y.at - x.at)
      .slice(0, 8);
  }, [partner, couple, uid, today, partnerName, theirReps, drinks, sessions]);

  useEffect(() => {
    track('couple_partner_dashboard');
  }, []);

  /* Publish my own side on arrival. Otherwise it only goes out from Home, so
     someone who pairs and comes straight here shows up as "not shared" on
     their partner's screen until they happen to pass through Home. Memoised
     and gated on the switch inside, so this is a no-op when nothing moved. */
  useEffect(() => {
    void syncHydrationNow(couple?.id, uid);
  }, [couple?.id, uid]);

  if (!paired || !partner || !couple) {
    return (
      <Screen>
        <ModalHeader title="Partner" />
        <Card style={styles.pad}>
          <Text style={styles.emptyTitle}>Pair up to see each other’s day</Text>
          <Text style={[text.caption, styles.emptyBody]}>
            Once you’re paired, you’ll both see who trained today, and each of you chooses
            whether to share steps and water.
          </Text>
          <PressableScale
            onPress={() => router.replace('/modal/couple-invite')}
            accessibilityRole="button"
            style={styles.linkRow}
          >
            <Text style={styles.linkText}>Invite your partner</Text>
          </PressableScale>
        </Card>
      </Screen>
    );
  }

  const rivalry = rivalryWith(sessions, partner.uid);
  const theirWater = theirs.water.kind === 'shown' ? theirs.water.value : null;
  const theirSteps = theirs.steps.kind === 'shown' ? theirs.steps.value : null;
  const rows: TallyRowData[] = [
    {
      emoji: '💧',
      title: 'Water',
      mine: myWater,
      theirs: theirWater,
      mineLabel: formatMl(myWater),
      theirLabel: theirWater == null ? 'Not shared' : formatMl(theirWater),
    },
    {
      emoji: '👟',
      title: 'Steps',
      mine: mySteps,
      theirs: theirSteps,
      mineLabel: mySteps == null ? '—' : formatSteps(mySteps),
      theirLabel: theirSteps == null ? 'Not shared' : formatSteps(theirSteps),
    },
    {
      emoji: '💪',
      title: 'Reps',
      mine: myReps,
      theirs: theirReps.reps,
      mineLabel: String(myReps),
      theirLabel: String(theirReps.reps),
    },
  ];
  const score = tallyScore(
    rows.map((r) => ({ a: r.theirs ?? 0, b: r.mine ?? 0, known: r.mine != null && r.theirs != null && (r.mine > 0 || r.theirs > 0) })),
  );
  const scoreLine =
    score.mine === 0 && score.theirs === 0
      ? 'All square. First to move takes the lead.'
      : score.mine > score.theirs
        ? `You lead ${score.mine}–${score.theirs}. ${partnerName} can still turn it.`
        : score.theirs > score.mine
          ? `${partnerName} leads ${score.theirs}–${score.mine}. One glass could swing it.`
          : `Level at ${score.mine}–${score.theirs}. Anyone’s day.`;

  const streak = snap.streak;
  const next = nextOutfit(streak);
  const prevDays = [...WARDROBE].reverse().find((w) => streak >= w.days)?.days ?? 0;
  const week = weekSoFar(today);
  const stageWidth = Math.min(width - 40, 420);

  const toggle = (key: SharedMetricKey, on: boolean) => {
    track('couple_sharing_changed', { metric: key, on });
    void setMetricSharing(couple.id, uid, key, on);
  };

  const go = (path: '/splash' | '/react' | '/drink') => {
    lightImpactHaptic();
    router.push(path === '/drink' ? { pathname: '/drink', params: { ml: '250' } } : path);
  };

  const sendReminder = async (kind: ReminderKind) => {
    if (!uid || sending) return;
    setSending(kind);
    try {
      await nudgePartner(couple.id, uid, myName, kind);
      track('couple_nudge_sent');
      successHaptic();
      showDialog({
        title: 'Reminder sent',
        message: reminderSentLine(kind, partnerName),
        tone: 'success',
        actions: [{ label: 'Got it', variant: 'primary' }],
      });
    } catch (error) {
      captureError(error);
      showDialog({
        title: 'Reminder not sent',
        message:
          error instanceof Error
            ? error.message
            : "We couldn't send that reminder. Check your connection and try again.",
        tone: 'danger',
        actions: [{ label: 'OK', variant: 'primary' }],
      });
    } finally {
      setSending(null);
    }
  };

  const openDuel = (kind: 'duel' | 'train') =>
    router.push({
      pathname: '/duel/new',
      params: {
        role: 'host',
        kind,
        target: partner.uid,
        name: partnerName,
        ...(partner.avatarUrl ? { avatar: partner.avatarUrl } : {}),
      },
    });

  return (
    <Screen>
      <ModalHeader title="Today, together" subtitle={`You & ${partnerName}`} />

      {/* ── Live stage ── both bears, and the two of you, right now. */}
      <Animated.View entering={FadeInDown.duration(380).springify()} style={styles.block}>
        <LiveStage
          width={stageWidth}
          hour={new Date(now).getHours() + new Date(now).getMinutes() / 60}
          total={HABITS.length}
          here={here}
          hereLine={hereLine}
          incoming={incoming}
          onPoke={onPoke}
          them={{
            name: partnerName,
            pct: snap.pct,
            met: snap.met,
            layers: bearLayers(snap.layers),
            amount: theirWaterShown == null ? '—' : formatMl(theirWaterShown),
            score: theirScore,
          }}
          me={{
            name: myName,
            pct: snap.hasMe ? snap.mePct : 0,
            met: snap.hasMe && snap.meMet,
            layers: snap.hasMe ? bearLayers(snap.meLayers) : [],
            amount: formatMl(myWater),
            score: myScore,
          }}
        />
        <View style={styles.stageActions}>
          <StageButton emoji="💦" label="Splash" hint="To their phone" onPress={() => go('/splash')} delay={120} />
          <StageButton emoji="🫶" label="React" hint="Push an emoji" onPress={() => go('/react')} delay={180} />
          <StageButton emoji="💧" label="+250" hint="Log a glass" onPress={() => go('/drink')} delay={240} primary />
        </View>
      </Animated.View>

      {toast ? (
        <Animated.View key={toast.key} entering={FadeInUp.springify()} exiting={FadeOutUp} style={styles.toast}>
          <Text style={styles.toastText}>{toast.text}</Text>
        </Animated.View>
      ) : null}

      {/* ── Our daily ritual ── */}
      <SectionLabel>OUR DAILY RITUAL</SectionLabel>
      <Animated.View entering={FadeInDown.delay(60).duration(320)} style={styles.block}>
        <RitualCard mine={mineRitual} theirs={theirRitual} name={partnerName} onToggle={onToggle} />
      </Animated.View>

      {/* ── Better, week on week ── */}
      <SectionLabel>OUR WEEK OF HABITS</SectionLabel>
      <Animated.View entering={FadeInDown.delay(80).duration(320)} style={styles.block}>
        <RitualWeekCard week={week7} total={HABITS.length} name={partnerName} />
      </Animated.View>

      {/* ── Today's tally ── */}
      <SectionLabel>TODAY’S SCORE</SectionLabel>
      <Animated.View entering={FadeInDown.delay(80).duration(320)} style={styles.block}>
        <Card style={styles.pad}>
          <View style={styles.scoreRow}>
            <Side name="You" uri={avatarUrl} initial={myName} color={ME} score={score.mine} lead={score.mine > score.theirs} />
            <View style={styles.scoreMid}>
              <Text style={styles.scoreBig}>
                <Text style={{ color: ME }}>{score.mine}</Text>
                <Text style={styles.scoreDash}> – </Text>
                <Text style={{ color: THEM }}>{score.theirs}</Text>
              </Text>
            </View>
            <Side name={partnerName} uri={partner.avatarUrl} initial={partnerName} color={THEM} score={score.theirs} lead={score.theirs > score.mine} />
          </View>
          <Text style={styles.scoreLine}>{scoreLine}</Text>
          <View style={styles.tally}>
            {rows.map((r, i) => (
              <TallyRow key={r.title} row={r} delay={140 + i * 70} />
            ))}
          </View>
        </Card>
      </Animated.View>

      {/* ── Today's moments ── */}
      <SectionLabel>TODAY’S MOMENTS</SectionLabel>
      <Animated.View entering={FadeInDown.delay(120).duration(320)} style={styles.block}>
        <Card style={styles.pad}>
          {moments.length === 0 ? (
            <View style={styles.quiet}>
              <Text style={styles.quietEmoji}>🌱</Text>
              <Text style={styles.quietTitle}>A quiet day so far</Text>
              <Text style={[text.caption, styles.quietBody]}>
                Every drink, set and splash between you lands here. Start it off.
              </Text>
            </View>
          ) : (
            moments.map((m, i) => <MomentRow key={`${m.at}-${i}`} m={m} last={i === moments.length - 1} delay={160 + i * 50} />)
          )}
        </Card>
      </Animated.View>

      {/* ── Our streak ── both bears full, day after day. */}
      <SectionLabel>OUR STREAK</SectionLabel>
      <Animated.View entering={FadeInDown.delay(150).duration(320)} style={styles.block}>
        <GradientCard colors={gradients.amber} style={styles.streak}>
          <View style={styles.streakTop}>
            <Text style={styles.streakFlame}>{streak > 0 ? '🔥' : '🫧'}</Text>
            <View style={styles.streakCopy}>
              <Text style={styles.streakNum}>
                {streak} {streak === 1 ? 'day' : 'days'}
              </Text>
              <Text style={styles.streakSub}>
                {streak > 0 ? 'both bottles full, back to back' : 'fill both bottles today to start one'}
              </Text>
            </View>
          </View>
          <View style={styles.weekRow}>
            {DAY_LETTERS.map((letter, i) => {
              const day = week[i];
              const done = !!day && duoDays.includes(day);
              const isToday = day === today;
              return (
                <View key={i} style={styles.weekCell}>
                  <View style={[styles.weekDot, done && styles.weekDone, isToday && !done && styles.weekToday, !day && styles.weekFuture]}>
                    {done ? <Text style={styles.weekTick}>✓</Text> : null}
                  </View>
                  <Text style={[styles.weekLetter, isToday && styles.weekLetterToday]}>{letter}</Text>
                </View>
              );
            })}
          </View>
          {next ? (
            <View style={styles.unlock}>
              <Text style={styles.unlockText}>
                {next.emoji} {next.label} for both bears in {next.days - streak} {next.days - streak === 1 ? 'day' : 'days'}
              </Text>
              <View style={styles.unlockTrack}>
                <View
                  style={[
                    styles.unlockFill,
                    { width: `${Math.max(6, Math.round(((streak - prevDays) / (next.days - prevDays)) * 100))}%` },
                  ]}
                />
              </View>
            </View>
          ) : (
            <Text style={styles.unlockText}>🪽 Every outfit earned. Legends.</Text>
          )}
        </GradientCard>
      </Animated.View>

      {/* ── Head to head ── the running series, from duels already banked on
          this phone (each live duel records the other seat's uid). */}
      <SectionLabel>HEAD TO HEAD</SectionLabel>
      <Animated.View entering={FadeInDown.delay(180).duration(320)} style={styles.block}>
        <GradientCard colors={gradients.ink} style={styles.h2h}>
          <View style={styles.h2hRow}>
            <View style={styles.h2hSide}>
              <Text style={[styles.h2hScore, { color: palette.purple400 }]}>{rivalry.wins}</Text>
              <Text style={styles.h2hName} numberOfLines={1}>
                YOU
              </Text>
            </View>
            <View style={styles.h2hMid}>
              <Text style={styles.h2hSwords}>⚔️</Text>
              <Text style={styles.h2hPlayed}>{rivalry.played} played</Text>
            </View>
            <View style={styles.h2hSide}>
              <Text style={[styles.h2hScore, { color: palette.amber400 }]}>{rivalry.losses}</Text>
              <Text style={styles.h2hName} numberOfLines={1}>
                {partnerName.toUpperCase()}
              </Text>
            </View>
          </View>
          <Text style={styles.h2hLine}>
            {rivalry.played > 0 ? rivalryLine(rivalry, partnerName) : rivalryNudge(rivalry, partnerName)}
          </Text>
          <View style={styles.actions}>
            <ActionTile
              emoji="⚔️"
              label={rivalry.played > 0 ? 'Rematch' : 'Race live'}
              hint="Rep for rep"
              colors={gradients.squat}
              onPress={() => openDuel('duel')}
            />
            <ActionTile
              emoji="🤝"
              label="Train together"
              hint="One shared score"
              colors={gradients.brandStrong}
              onPress={() => openDuel('train')}
            />
          </View>
        </GradientCard>
      </Animated.View>

      {/* ── Reminders ── the nudge, for more than training: one push each. */}
      <SectionLabel>SEND A REMINDER</SectionLabel>
      <Animated.View entering={FadeInDown.delay(200).duration(320)} style={styles.block}>
        <Card style={styles.pad}>
          <View style={styles.reminderRow}>
            {REMINDER_KINDS.map((kind) => {
              const b = reminderButton(kind);
              const busy = sending === kind;
              return (
                <PressableScale
                  key={kind}
                  onPress={() => void sendReminder(kind)}
                  disabled={sending !== null}
                  accessibilityRole="button"
                  accessibilityLabel={`Remind ${partnerName}: ${b.label}`}
                  style={styles.reminder}
                >
                  <View style={[styles.reminderBubble, busy && styles.reminderBusy]}>
                    <Text style={styles.reminderEmoji}>{busy ? '…' : b.emoji}</Text>
                  </View>
                  <Text style={styles.reminderLabel}>{b.label}</Text>
                </PressableScale>
              );
            })}
          </View>
          <Text style={[text.caption, styles.reminderNote]}>
            {partnerName} gets a push, even with the app closed.
          </Text>
        </Card>
      </Animated.View>

      {/* ── What I share ── */}
      <SectionLabel>WHAT YOU SHARE</SectionLabel>
      <Animated.View entering={FadeInDown.delay(200).duration(320)} style={styles.block}>
        <Card style={styles.pad}>
          <ShareRow
            label="Steps today"
            detail="Your daily step count"
            value={shareSteps}
            onChange={(v) => toggle('steps', v)}
          />
          <View style={styles.divider} />
          <ShareRow
            label="Water today"
            detail="How much you've drunk"
            value={shareWater}
            onChange={(v) => toggle('water', v)}
          />
          <View style={styles.divider} />
          <ShareRow
            label={`Tell ${partnerName} when I drink`}
            detail="They get “just drank 250 ml” — at most once every 90 minutes"
            value={shareWater && drinkUpdates}
            onChange={(v) => setDrinkUpdates(v)}
          />
          <View style={styles.divider} />
          <View style={styles.shareRow}>
            <View style={styles.shareCopy}>
              <Text style={styles.shareLabel}>Workouts</Text>
              <Text style={[text.caption, styles.shareDetail]}>
                Always shared: your streak together counts the days you both train
              </Text>
            </View>
            <Text style={styles.alwaysOn}>ON</Text>
          </View>
          <Text style={[text.caption, styles.summary]}>
            {sharingSummary({ steps: shareSteps, water: shareWater }, partnerName)} Turning one
            off removes today’s number from their screen right away.
          </Text>
        </Card>
      </Animated.View>

      <PressableScale
        onPress={() => router.push('/couple')}
        accessibilityRole="button"
        style={styles.linkRow}
      >
        <Text style={styles.linkText}>See your bond’s history ›</Text>
      </PressableScale>
    </Screen>
  );
}

/* ------------------------------------------------------------------ *
 * Pieces
 * ------------------------------------------------------------------ */

function StageButton({
  emoji,
  label,
  hint,
  onPress,
  delay,
  primary,
}: {
  emoji: string;
  label: string;
  hint: string;
  onPress: () => void;
  delay: number;
  primary?: boolean;
}) {
  return (
    <Animated.View entering={ZoomIn.delay(delay).springify().damping(13)} style={styles.stageBtnWrap}>
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${hint}`}
        style={[styles.stageBtn, primary && styles.stageBtnPrimary]}
      >
        <Text style={styles.stageEmoji}>{emoji}</Text>
        <Text style={[styles.stageLabel, primary && styles.stageLabelPrimary]}>{label}</Text>
        <Text style={[styles.stageHint, primary && styles.stageHintPrimary]} numberOfLines={1}>
          {hint}
        </Text>
      </PressableScale>
    </Animated.View>
  );
}

function Side({
  name,
  uri,
  initial,
  color,
  lead,
}: {
  name: string;
  uri: string | null | undefined;
  initial: string;
  color: string;
  score: number;
  lead: boolean;
}) {
  return (
    <View style={styles.side}>
      <View style={styles.crownSlot}>
        {lead ? (
          <Animated.Text entering={ZoomIn.springify()} style={styles.crown}>
            👑
          </Animated.Text>
        ) : null}
      </View>
      <View style={[styles.sideRing, { borderColor: lead ? color : palette.divider }]}>
        <Avatar
          initial={(initial.charAt(0) || '?').toUpperCase()}
          uri={uri}
          size={46}
          background={color}
          color={palette.white}
        />
      </View>
      <Text style={styles.sideName} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}

interface TallyRowData {
  emoji: string;
  title: string;
  mine: number | null;
  theirs: number | null;
  mineLabel: string;
  theirLabel: string;
}

/**
 * A tug of war: my share of the pair's total from the left, theirs from the
 * right, so the split point is the picture. Unknown on either side draws an
 * even, muted rope rather than pretending someone is winning.
 */
function TallyRow({ row, delay }: { row: TallyRowData; delay: number }) {
  const total = (row.mine ?? 0) + (row.theirs ?? 0);
  const known = row.mine != null && row.theirs != null && total > 0;
  const minePart = known && total > 0 ? (row.mine as number) / total : 0.5;
  const mineWins = known && (row.mine as number) > (row.theirs as number);
  const theyWin = known && (row.theirs as number) > (row.mine as number);
  return (
    <Animated.View entering={FadeInRight.delay(delay).duration(320)} style={styles.tallyRow}>
      <View style={styles.tallyHead}>
        <Text style={[styles.tallyValue, mineWins && { color: ME }]} numberOfLines={1}>
          {mineWins ? '👑 ' : ''}
          {row.mineLabel}
        </Text>
        <Text style={styles.tallyTitle}>
          {row.emoji} {row.title}
        </Text>
        <Text style={[styles.tallyValue, styles.tallyRight, theyWin && { color: THEM }, row.theirs == null && styles.muted]} numberOfLines={1}>
          {row.theirLabel}
          {theyWin ? ' 👑' : ''}
        </Text>
      </View>
      <View style={styles.rope}>
        <View style={[styles.ropeMine, { flex: Math.max(0.04, minePart) }, !known && styles.ropeMuted]} />
        <View style={styles.ropeKnot} />
        <View style={[styles.ropeTheirs, { flex: Math.max(0.04, 1 - minePart) }, !known && styles.ropeMuted]} />
      </View>
    </Animated.View>
  );
}

function MomentRow({ m, last, delay }: { m: Moment; last: boolean; delay: number }) {
  const tint = m.who === 'me' ? ME : m.who === 'them' ? THEM : palette.green500;
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(280)} style={styles.moment}>
      <View style={styles.momentRail}>
        <View style={[styles.momentBubble, { backgroundColor: `${tint}22`, borderColor: tint }]}>
          <Text style={styles.momentEmoji}>{m.emoji}</Text>
        </View>
        {!last ? <View style={styles.momentLine} /> : null}
      </View>
      <View style={[styles.momentBody, !last && styles.momentGap]}>
        <Text style={[styles.momentText, m.who === 'us' && styles.momentUs]}>{m.text}</Text>
        <Text style={styles.momentTime}>{clockTime(m.at)}</Text>
      </View>
    </Animated.View>
  );
}

function ActionTile({
  emoji,
  label,
  hint,
  colors,
  onPress,
}: {
  emoji: string;
  label: string;
  hint: string;
  colors: Gradient;
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.actionWrap}>
      <GradientCard colors={colors} style={styles.action}>
        <Text style={styles.actionEmoji}>{emoji}</Text>
        <Text style={styles.actionLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.actionHint} numberOfLines={2}>
          {hint}
        </Text>
      </GradientCard>
    </PressableScale>
  );
}

function ShareRow({
  label,
  detail,
  value,
  onChange,
}: {
  label: string;
  detail: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <View style={styles.shareRow}>
      <View style={styles.shareCopy}>
        <Text style={styles.shareLabel}>{label}</Text>
        <Text style={[text.caption, styles.shareDetail]}>{detail}</Text>
      </View>
      <Toggle value={value} onChange={onChange} label={`Share ${label.toLowerCase()}`} />
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 16 },
  block: { marginBottom: 14 },
  toast: {
    alignSelf: 'center',
    marginTop: -4,
    marginBottom: 10,
    backgroundColor: palette.ink,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  toastText: font('bold', 14, { color: palette.white }),
  muted: { color: palette.grey500 },

  stageActions: { flexDirection: 'row', gap: 8, marginTop: 14, alignSelf: 'stretch' },
  stageBtnWrap: { flex: 1 },
  stageBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.divider,
  },
  stageBtnPrimary: { backgroundColor: palette.green500, borderColor: palette.green500 },
  stageEmoji: { fontSize: 22 },
  stageLabel: { marginTop: 2, ...font('extrabold', 14, { color: palette.ink }) },
  stageLabelPrimary: { color: palette.white },
  stageHint: { ...font('medium', 11, { color: palette.slate500 }), paddingHorizontal: 4 },
  stageHintPrimary: { color: 'rgba(255,255,255,0.9)' },

  scoreRow: { flexDirection: 'row', alignItems: 'flex-end' },
  side: { flex: 1, alignItems: 'center' },
  crownSlot: { height: 22, justifyContent: 'flex-end' },
  crown: { fontSize: 18 },
  sideRing: { borderWidth: 2.5, borderRadius: 30, padding: 2 },
  sideName: { marginTop: 6, ...font('bold', 13, { color: palette.ink }), maxWidth: 110 },
  scoreMid: { alignItems: 'center', paddingBottom: 18 },
  scoreBig: { ...font('extrabold', 40), lineHeight: 46 },
  scoreDash: { color: palette.grey500 },
  scoreLine: { marginTop: 10, textAlign: 'center', ...font('bold', 14, { color: palette.slate500 }) },
  tally: { marginTop: 14, gap: 14 },
  tallyRow: {},
  tallyHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  tallyValue: { flex: 1, ...font('extrabold', 14, { color: palette.ink }) },
  tallyRight: { textAlign: 'right' },
  tallyTitle: { ...font('bold', 12, { color: palette.slate500 }), paddingHorizontal: 8 },
  rope: { flexDirection: 'row', alignItems: 'center', height: 12 },
  ropeMine: { height: 10, borderTopLeftRadius: 5, borderBottomLeftRadius: 5, backgroundColor: ME },
  ropeTheirs: { height: 10, borderTopRightRadius: 5, borderBottomRightRadius: 5, backgroundColor: THEM },
  ropeMuted: { backgroundColor: palette.track },
  ropeKnot: { width: 12, height: 12, borderRadius: 6, backgroundColor: palette.white, borderWidth: 2, borderColor: palette.ink, marginHorizontal: -6, zIndex: 1 },

  quiet: { alignItems: 'center', paddingVertical: 8 },
  quietEmoji: { fontSize: 30 },
  quietTitle: { marginTop: 6, ...font('bold', 15, { color: palette.ink }) },
  quietBody: { marginTop: 4, color: palette.slate500, textAlign: 'center' },
  moment: { flexDirection: 'row', gap: 12 },
  momentRail: { alignItems: 'center', width: 36 },
  momentBubble: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  momentEmoji: { fontSize: 17 },
  momentLine: { flex: 1, width: 2, backgroundColor: palette.divider, marginVertical: 3 },
  momentBody: { flex: 1, paddingTop: 2 },
  momentGap: { paddingBottom: 14 },
  momentText: { ...font('bold', 14, { color: palette.ink }) },
  momentUs: { color: palette.green700 },
  momentTime: { marginTop: 1, ...font('medium', 12, { color: palette.grey500 }) },

  streak: { padding: 16, borderRadius: radius.lg },
  streakTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  streakFlame: { fontSize: 40 },
  streakCopy: { flex: 1 },
  streakNum: { ...font('extrabold', 28, { color: palette.white }), lineHeight: 32 },
  streakSub: { ...font('medium', 13, { color: 'rgba(255,255,255,0.9)' }) },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  weekCell: { alignItems: 'center', gap: 4 },
  weekDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDone: { backgroundColor: palette.white },
  weekToday: { borderWidth: 2, borderColor: palette.white, borderStyle: 'dashed' },
  weekFuture: { backgroundColor: 'rgba(255,255,255,0.1)' },
  weekTick: { ...font('extrabold', 14, { color: palette.amber500 }) },
  weekLetter: { ...font('bold', 11, { color: 'rgba(255,255,255,0.75)' }) },
  weekLetterToday: { color: palette.white },
  unlock: { marginTop: 14 },
  unlockText: { marginTop: 14, ...font('bold', 13, { color: palette.white }) },
  unlockTrack: { marginTop: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.15)', overflow: 'hidden' },
  unlockFill: { height: 8, borderRadius: 4, backgroundColor: palette.white },

  h2h: { padding: 16, borderRadius: radius.lg },
  h2hRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  h2hSide: { alignItems: 'center', flex: 1 },
  h2hMid: { alignItems: 'center' },
  h2hSwords: { fontSize: 22 },
  h2hPlayed: { ...font('bold', 11, { color: 'rgba(255,255,255,0.5)' }), marginTop: 2 },
  h2hScore: { ...font('extrabold', 40), lineHeight: 44 },
  h2hName: { ...font('extrabold', 11, { color: 'rgba(255,255,255,0.6)' }), letterSpacing: 1.2, maxWidth: 110 },
  h2hLine: { ...font('bold', 14, { color: palette.white }), marginTop: 10, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actionWrap: { flex: 1 },
  action: { paddingVertical: 12, paddingHorizontal: 10, minHeight: 92, borderRadius: radius.md },
  actionEmoji: { fontSize: 22 },
  actionLabel: { marginTop: 4, color: palette.white, ...font('extrabold', 14) },
  actionHint: { marginTop: 2, color: 'rgba(255,255,255,0.85)', ...font('medium', 11) },

  reminderRow: { flexDirection: 'row', justifyContent: 'space-between' },
  reminder: { alignItems: 'center', width: 58 },
  reminderBubble: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: palette.green50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reminderBusy: { backgroundColor: palette.green100 },
  reminderEmoji: { fontSize: 22 },
  reminderLabel: { ...font('bold', 12, { color: palette.ink }), marginTop: 6 },
  reminderNote: { color: palette.slate500, marginTop: 12, textAlign: 'center' },

  divider: { height: 1, backgroundColor: palette.divider, marginVertical: 12 },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  shareCopy: { flex: 1 },
  shareLabel: { ...font('bold', 15), color: palette.ink },
  shareDetail: { marginTop: 2, color: palette.slate500 },
  alwaysOn: { ...font('extrabold', 12), color: palette.green600, letterSpacing: 1 },
  summary: { marginTop: 14, color: palette.slate500 },
  emptyTitle: { ...font('bold', 17), color: palette.ink },
  emptyBody: { marginTop: 6, color: palette.slate500 },
  linkRow: { alignItems: 'center', paddingVertical: 18 },
  linkText: { ...font('bold', 14), color: palette.green700 },
});

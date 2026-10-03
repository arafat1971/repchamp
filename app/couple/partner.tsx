import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp, FadeOutUp } from 'react-native-reanimated';

import { ModalHeader } from '@/components/ModalHeader';
import { PressableScale, Screen, Toggle } from '@/components/ui';
import { HabitIcon } from '@/components/together/HabitIcon';
import { LiveStage } from '@/components/together/LiveStage';
import { ME, RitualCard, THEM } from '@/components/together/RitualCard';
import { RitualWeekCard } from '@/components/together/RitualWeekCard';
import { CheckIcon, DuelIcon, FlameIcon } from '@/components/home/Icons';
import { ActionList, ActionRow, PairPitch, SectionTitle, Surface } from '@/components/together/kit';
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
  effectivePlan,
  isHere,
  planHabits,
  windDownDue,
  isNewPoke,
  ritualFor,
  ritualScore,
  ritualWeek,
  type HabitId,
  type Poke,
} from '@/domain/ritual';
import { DEFAULT_DAILY_GOAL_ML, formatMl } from '@/domain/hydration';
import { clockTime, todayMoments, type Moment } from '@/domain/moments';
import {
  partnerToday,
  sharingSummary,
  type SharedMetricKey,
} from '@/domain/partnerSharing';
import { pluralise } from '@/domain/plural';
import { dayKey } from '@/domain/progression';
import { rivalryLine, rivalryNudge, rivalryWith } from '@/domain/rivalry';
import { repsOnDay } from '@/domain/waterWidget';
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
import { selectTodayMl, useHydrationStore } from '@/state/hydrationStore';
import { useProfileStore } from '@/state/profileStore';
import { useSharingStore } from '@/state/sharingStore';
import { useCouple } from '@/state/useCouple';
import { showDialog } from '@/state/useDialog';
import { usePartnerTodaySnapshot } from '@/state/usePartnerTodaySnapshot';
import { useStepsToday } from '@/state/useStepsToday';
import { getExercise } from '@/vision/exercises';
import { font } from '@/theme/typography';
import { palette } from '@/theme/tokens';


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
  const { couple, paired, partner, loading, streak } = useCouple();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const displayName = useProfileStore((s) => s.displayName);
  const avatarUri = useProfileStore((s) => s.avatarUri);
  const sessions = useProfileStore((s) => s.sessions);
  const drinks = useHydrationStore((s) => s.drinks);
  const shareSteps = useSharingStore((s) => s.steps);
  const shareWater = useSharingStore((s) => s.water);
  const drinkUpdates = useSharingStore((s) => s.drinkUpdates);
  const setDrinkUpdates = useSharingStore((s) => s.setDrinkUpdates);
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
  const meMember = couple?.members.find((m) => m.uid === uid) ?? null;
  const planKey = JSON.stringify(effectivePlan(meMember?.ritualPlan, partner?.ritualPlan));
  const plan = useMemo(() => JSON.parse(planKey) as ReturnType<typeof effectivePlan>, [planKey]);
  const planList = useMemo(() => planHabits(plan), [plan]);
  const mineRitual = useMemo(
    () => ritualFor({ ml: myWater, goalMl: myGoal, steps: mySteps, reps: myReps, ticks: myTicks }, plan),
    [myWater, myGoal, mySteps, myReps, myTicks, plan],
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
      }, plan),
    // theirTicksKey stands in for the partner's tick list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theirWaterShown, theirStepsShown, theirReps.reps, theirTicksKey, today, plan],
  );
  const myScore = ritualScore(mineRitual);
  const theirScore = ritualScore(theirRitual);
  const introSeen = useRitualStore((s) => s.introSeen);
  const dismissIntro = useRitualStore((s) => s.dismissIntro);
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
    const fresh = planList.find((h) => done.has(h.id) && !before.has(h.id));
    if (!fresh) return;
    playReceiveSound();
    lightImpactHaptic();
    say(done.size === HABITS.length ? `${partnerName} finished all ${HABITS.length}` : `${partnerName} ticked ${fresh.label.toLowerCase()}`);
  }, [theirRitual, partnerName, say, planList]);

  /* Both perfect: once, with everything — confetti, jumping bears, a sound —
     and a ribbon that stays on the stage for the rest of the day. */
  const perfect = myScore === HABITS.length && theirScore === HABITS.length;
  const [party, setParty] = useState(0);
  const celebrated = useRef(false);
  const celebrate = useCallback(() => {
    setParty((n) => n + 1);
    playSparkleSound();
    successHaptic();
  }, []);
  useEffect(() => {
    if (perfect && !celebrated.current) {
      celebrated.current = true;
      celebrate();
      track('ritual_perfect_day');
    }
  }, [perfect, celebrate]);
  const prevMine = useRef(myScore);
  useEffect(() => {
    if (myScore === HABITS.length && prevMine.current < HABITS.length && theirScore < HABITS.length) {
      playSparkleSound();
      say(`All ${HABITS.length} done. ${HABITS.length - theirScore} to go for ${partnerName}`);
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
      say(`${partnerName} is here`);
    }
    wasHere.current = here;
  }, [here, partnerName, say]);
  const hereLine = here
    ? `${partnerName} is here with you`
    : hereAt && now - hereAt < 60 * 60_000
      ? `${partnerName} was here ${Math.max(1, Math.round((now - hereAt) / 60_000))} min ago`
      : `Tap ${partnerName}'s bear to send a heart`;

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

  /* Still reading the pairing: a quiet placeholder, never a flash of the
     "pair up" pitch at someone who is already paired. */
  if (loading && !paired) {
    return (
      <Screen>
        <ModalHeader title="Today, together" />
        <View style={styles.loading}>
          <ActivityIndicator color={palette.slate500} />
        </View>
      </Screen>
    );
  }

  if (!paired || !partner || !couple) {
    return (
      <Screen>
        <ModalHeader title="Today, together" />
        <PairPitch
          name={myName}
          uri={avatarUri}
          title="See each other’s day"
          body="Once you’re paired you both see who trained, and each of you chooses whether to share steps and water."
          onInvite={() => router.replace('/modal/couple-invite')}
          onScan={() => router.push('/modal/scan')}
        />
      </Screen>
    );
  }

  const rivalry = rivalryWith(sessions, partner.uid);
  /* The snapshot hook falls back to a sample pair until its own read of the
     couple lands; only draw its jars once it is about this partner, today. */
  const snapReal = snap.day === today && snap.name === partnerName;
  const stageWidth = Math.min(width - 40, 420);

  const toggle = (key: SharedMetricKey, on: boolean) => {
    track('couple_sharing_changed', { metric: key, on });
    void setMetricSharing(couple.id, uid, key, on);
  };

  const go = (path: '/splash' | '/drink') => {
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
      <ModalHeader title="Today, together" subtitle={`You and ${partnerName}`} />

      {!introSeen ? (
        <Animated.View entering={FadeInDown.duration(300)} exiting={FadeOutUp} style={styles.introWrap}>
          <Surface style={styles.intro}>
            <Text style={styles.introTitle}>How today works</Text>
            {[
              `Tap ${partnerName}'s bear to send a heart. It lands on their screen while you're both here.`,
              'Tick your habits. Water, walking and exercise fill in by themselves.',
              'Finish all six together and the island celebrates.',
            ].map((line, i) => (
              <View key={i} style={styles.introRow}>
                <Text style={styles.introNum}>{i + 1}</Text>
                <Text style={styles.introText}>{line}</Text>
              </View>
            ))}
            <PressableScale onPress={dismissIntro} accessibilityRole="button" style={styles.introBtn}>
              <Text style={styles.introBtnText}>Got it</Text>
            </PressableScale>
          </Surface>
        </Animated.View>
      ) : null}

      {/* The stage: the one expressive thing on the screen. */}
      <Animated.View entering={FadeInDown.duration(360)} style={styles.block}>
        <LiveStage
          width={stageWidth}
          hour={new Date(now).getHours() + new Date(now).getMinutes() / 60}
          total={HABITS.length}
          here={here}
          hereLine={hereLine}
          incoming={incoming}
          onPoke={onPoke}
          perfect={perfect}
          party={party}
          onReplay={celebrate}
          them={{
            name: partnerName,
            pct: snapReal ? snap.pct : 0,
            met: snapReal && snap.met,
            layers: snapReal ? bearLayers(snap.layers) : [],
            amount: theirWaterShown == null ? '—' : formatMl(theirWaterShown),
            score: theirScore,
          }}
          me={{
            name: myName,
            pct: snapReal && snap.hasMe ? snap.mePct : 0,
            met: snapReal && snap.hasMe && snap.meMet,
            layers: snapReal && snap.hasMe ? bearLayers(snap.meLayers) : [],
            amount: formatMl(myWater),
            score: myScore,
          }}
        />
        <View style={styles.pills}>
          <Pill icon="plus" label="250 ml" onPress={() => go('/drink')} primary />
          <Pill icon="splash" label={partnerName.length > 10 ? 'Splash' : `Splash ${partnerName}`} onPress={() => go('/splash')} />
        </View>
      </Animated.View>

      {/* The day in three numbers, before the detail below. */}
      <Animated.View entering={FadeInDown.delay(80).duration(320)}>
        <Surface style={styles.strip}>
          <Stat icon={<FlameIcon size={14} color={palette.amber600} />} value={String(streak)} label="day streak" />
          <Stat
            rule
            icon={<CheckIcon size={14} color={palette.green600} />}
            value={`${myScore + theirScore}/${HABITS.length * 2}`}
            label="ritual today"
          />
          <Stat rule icon={<DuelIcon size={14} color={ME} />} value={`${rivalry.wins}–${rivalry.losses}`} label="duels" />
        </Surface>
      </Animated.View>

      {toast ? (
        <Animated.View key={toast.key} entering={FadeInUp.springify()} exiting={FadeOutUp} style={styles.toast}>
          <Text style={styles.toastText}>{toast.text}</Text>
        </Animated.View>
      ) : null}

      {windDownDue(mineRitual, new Date(now).getHours() + new Date(now).getMinutes() / 60) ? (
        <Animated.View entering={FadeInDown.duration(300)} style={styles.windWrap}>
          <PressableScale
            onPress={() => router.push({ pathname: '/modal/breathe', params: { habit: 'rest' } })}
            accessibilityRole="button"
            accessibilityLabel="Start winding down, three minutes"
            style={styles.wind}
          >
            <View style={styles.windCopy}>
              <Text style={styles.windTitle}>Wind down together</Text>
              <Text style={styles.windSub}>
                Three slow minutes, then screens off.{here ? ` ${partnerName} is here too.` : ''}
              </Text>
            </View>
            <Text style={styles.windGo}>Start</Text>
          </PressableScale>
        </Animated.View>
      ) : null}

      <SectionTitle title="Today" aside={`${myScore + theirScore} of ${HABITS.length * 2} done`} />
      <View style={styles.block}>
        <RitualCard mine={mineRitual} theirs={theirRitual} name={partnerName} onToggle={onToggle} onEdit={() => router.push('/modal/ritual-plan')}
          onGuide={(id) => router.push({ pathname: '/modal/breathe', params: { habit: id } })}
        />
      </View>

      <SectionTitle title="This week" aside={week7.perfectDays > 0 ? `${week7.perfectDays} perfect ${week7.perfectDays === 1 ? 'day' : 'days'}` : undefined} />
      <View style={styles.block}>
        <RitualWeekCard week={week7} total={HABITS.length} name={partnerName} streak={snapReal ? snap.streak : 0} />
      </View>

      <SectionTitle title="Moments" />
      <Surface style={[styles.pad, styles.block]}>
        {moments.length === 0 ? (
          <Text style={styles.quiet}>Nothing yet today. Drinks, sets and splashes between you show up here.</Text>
        ) : (
          moments.map((m, i) => <MomentRow key={`${m.at}-${i}`} m={m} first={i === 0} />)
        )}
      </Surface>

      <SectionTitle title="Duels" aside={rivalry.played > 0 ? `${rivalry.played} played` : undefined} />
      <Surface style={[styles.pad, styles.block]}>
        {/* A face-off: you on the left, them on the right, wins under each. */}
        <View style={styles.faceoff}>
          <FaceoffSide name="You" initial={myName} wins={rivalry.wins} color={ME} lead={rivalry.wins > rivalry.losses} />
          <View style={styles.vs}>
            <Text style={styles.vsText}>VS</Text>
          </View>
          <FaceoffSide name={partnerName} initial={partnerName} wins={rivalry.losses} color={THEM} lead={rivalry.losses > rivalry.wins} />
        </View>
        <Text style={styles.duelLine}>
          {rivalry.played > 0 ? rivalryLine(rivalry, partnerName) : rivalryNudge(rivalry, partnerName)}
        </Text>
        <View style={styles.duelActions}>
          <TextButton label={rivalry.played > 0 ? 'Rematch' : 'Race live'} onPress={() => openDuel('duel')} primary />
          <TextButton label="Train together" onPress={() => openDuel('train')} />
        </View>
      </Surface>

      <SectionTitle title={`Nudge ${partnerName}`} />
      <Surface style={[styles.pad, styles.block]}>
        <View style={styles.chips}>
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
                style={[styles.chip, busy && styles.chipBusy]}
              >
                <Text style={styles.chipText} numberOfLines={1}>
                  {busy ? 'Sending…' : b.label}
                </Text>
              </PressableScale>
            );
          })}
        </View>
        <Text style={styles.note}>{partnerName} gets a notification, even with the app closed.</Text>
      </Surface>

      <SectionTitle title="What you share" />
      <Surface style={[styles.pad, styles.block]}>
        <ShareRow label="Steps today" detail="Your daily step count" value={shareSteps} onChange={(v) => toggle('steps', v)} />
        <View style={styles.divider} />
        <ShareRow label="Water today" detail="How much you've drunk" value={shareWater} onChange={(v) => toggle('water', v)} />
        <View style={styles.divider} />
        <ShareRow
          label={`Tell ${partnerName} when I drink`}
          detail="At most once every 90 minutes"
          value={shareWater && drinkUpdates}
          onChange={(v) => setDrinkUpdates(v)}
        />
        <View style={styles.divider} />
        <View style={styles.shareRow}>
          <View style={styles.shareCopy}>
            <Text style={styles.shareLabel}>Workouts</Text>
            <Text style={styles.shareDetail}>Always shared — your streak counts the days you both train</Text>
          </View>
          <Text style={styles.alwaysOn}>On</Text>
        </View>
        <Text style={styles.summary}>
          {sharingSummary({ steps: shareSteps, water: shareWater }, partnerName)} Turning one off removes today’s number
          from their screen right away.
        </Text>
      </Surface>

      <SectionTitle title="More together" />
      <ActionList style={styles.moreList}>
        <ActionRow
          flat
          icon="calendar"
          title="Your history together"
          sub="Streak, calendar and who put in what"
          badge={streak > 0 ? pluralise(streak, 'day') : undefined}
          onPress={() => router.push('/couple')}
        />
        <ActionRow
          flat
          rule
          icon="share"
          tint={ME}
          title="Share your bond card"
          sub="An image of your streak, for stories and chats"
          onPress={() => {
            track('share_opened', { kind: 'couple-card' });
            router.push('/modal/couple-card');
          }}
        />
      </ActionList>
    </Screen>
  );
}

/* ------------------------------------------------------------------ *
 * Pieces
 * ------------------------------------------------------------------ */

/** One of the three numbers under the stage: a column in one shared surface. */
function Stat({ icon, value, label, rule }: { icon: ReactNode; value: string; label: string; rule?: boolean }) {
  return (
    <View style={[styles.stat, rule && styles.statRule]}>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <View style={styles.statFoot}>
        {icon}
        <Text style={styles.statLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
  );
}

/** One half of the duel face-off. */
function FaceoffSide({ name, initial, wins, color, lead }: { name: string; initial: string; wins: number; color: string; lead: boolean }) {
  return (
    <View style={styles.side}>
      <View style={[styles.sideFace, { backgroundColor: color }, lead && styles.sideLead]}>
        <Text style={styles.sideInitial}>{(initial.charAt(0) || '?').toUpperCase()}</Text>
      </View>
      <Text style={[styles.sideWins, { color }]}>{wins}</Text>
      <Text style={styles.sideName} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}

function Pill({ icon, label, onPress, primary }: { icon: 'plus' | 'splash'; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={[styles.pill, primary && styles.pillPrimary]}>
      <HabitIcon id={icon} size={18} color={primary ? palette.white : palette.ink} />
      <Text style={[styles.pillText, primary && styles.pillTextPrimary]} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

function TextButton({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" style={[styles.textBtn, primary && styles.textBtnPrimary]}>
      <Text style={[styles.textBtnLabel, primary && styles.textBtnLabelPrimary]}>{label}</Text>
    </PressableScale>
  );
}

/** One moment: whose it was (a dot in their colour), what, and when. */
function MomentRow({ m, first }: { m: Moment; first: boolean }) {
  const tint = m.who === 'me' ? ME : m.who === 'them' ? THEM : palette.green500;
  return (
    <View style={[styles.moment, !first && styles.momentRule]}>
      <View style={[styles.momentDot, { backgroundColor: tint }]} />
      <Text style={styles.momentText} numberOfLines={2}>
        {m.text}
      </Text>
      <Text style={styles.momentTime}>{clockTime(m.at)}</Text>
    </View>
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
        <Text style={styles.shareDetail}>{detail}</Text>
      </View>
      <Toggle value={value} onChange={onChange} label={`Share ${label.toLowerCase()}`} />
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 18 },
  loading: { paddingVertical: 64, alignItems: 'center' },
  introWrap: { marginBottom: 18 },
  windWrap: { marginTop: 14 },
  wind: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 20, backgroundColor: '#1E1B4B' },
  windCopy: { flex: 1 },
  windTitle: font('bold', 16, { color: palette.white }),
  windSub: { marginTop: 2, ...font('regular', 13, { color: 'rgba(255,255,255,0.75)' }) },
  windGo: { ...font('semibold', 14, { color: '#1E1B4B' }), backgroundColor: palette.white, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, overflow: 'hidden' },
  intro: { padding: 18 },
  introTitle: { ...font('extrabold', 17, { color: palette.ink }), marginBottom: 10 },
  introRow: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  introNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: palette.ink,
    textAlign: 'center',
    lineHeight: 22,
    overflow: 'hidden',
    ...font('bold', 12, { color: palette.white }),
  },
  introText: { flex: 1, ...font('regular', 14, { color: palette.ink }) },
  introBtn: { alignSelf: 'flex-end', marginTop: 4, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 18, backgroundColor: palette.track },
  introBtnText: font('semibold', 14, { color: palette.ink }),
  block: { marginBottom: 8 },

  pills: { flexDirection: 'row', gap: 10, marginTop: 12 },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 24,
    backgroundColor: palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.divider,
  },
  pillPrimary: { backgroundColor: palette.ink, borderColor: palette.ink },
  pillText: { ...font('semibold', 15, { color: palette.ink }), flexShrink: 1 },
  pillTextPrimary: { color: palette.white },

  toast: {
    alignSelf: 'center',
    marginTop: 4,
    backgroundColor: palette.ink,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  toastText: font('semibold', 14, { color: palette.white }),

  strip: { flexDirection: 'row', marginTop: 14, paddingVertical: 14, borderRadius: 20 },
  stat: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  statRule: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: palette.border },
  statValue: { ...font('extrabold', 22, { color: palette.ink }), fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
  statFoot: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  statLabel: { ...font('semibold', 11.5, { color: palette.grey700 }), flexShrink: 1 },
  moreList: { marginTop: 0 },
  faceoff: { flexDirection: 'row', alignItems: 'center' },
  side: { flex: 1, alignItems: 'center' },
  sideFace: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  sideLead: { borderWidth: 3, borderColor: palette.amber300 },
  sideInitial: font('extrabold', 19, { color: palette.white }),
  sideWins: { ...font('extrabold', 34), marginTop: 6, fontVariant: ['tabular-nums'], letterSpacing: -1 },
  sideName: { ...font('semibold', 12.5, { color: palette.grey600 }), maxWidth: '90%' },
  vs: { width: 40, height: 40, borderRadius: 20, backgroundColor: palette.ink, alignItems: 'center', justifyContent: 'center' },
  vsText: { ...font('extrabold', 12, { color: palette.white }), letterSpacing: 0.5 },

  quiet: font('regular', 14, { color: palette.slate500 }),
  moment: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  momentRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.divider },
  momentDot: { width: 8, height: 8, borderRadius: 4 },
  momentText: { flex: 1, ...font('medium', 14, { color: palette.ink }) },
  momentTime: font('medium', 12, { color: palette.grey500 }),

  duelLine: { ...font('medium', 13.5, { color: palette.slate500 }), textAlign: 'center', marginTop: 12 },
  duelActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  textBtn: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.divider,
    backgroundColor: palette.white,
  },
  textBtnPrimary: { backgroundColor: palette.ink, borderColor: palette.ink },
  textBtnLabel: font('semibold', 14, { color: palette.ink }),
  textBtnLabelPrimary: { color: palette.white },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    minHeight: 40,
    borderRadius: 20,
    justifyContent: 'center',
    backgroundColor: palette.green50,
    borderWidth: 1,
    borderColor: palette.green200,
  },
  chipBusy: { opacity: 0.6 },
  chipText: font('bold', 13.5, { color: palette.green700 }),
  note: { marginTop: 12, ...font('regular', 12, { color: palette.slate500 }) },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.divider, marginVertical: 12 },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  shareCopy: { flex: 1 },
  shareLabel: font('semibold', 15, { color: palette.ink }),
  shareDetail: { marginTop: 2, ...font('regular', 12, { color: palette.slate500 }) },
  alwaysOn: font('semibold', 13, { color: palette.slate500 }),
  summary: { marginTop: 14, ...font('regular', 12, { color: palette.slate500 }) },
});

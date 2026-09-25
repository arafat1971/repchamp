import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { track } from '@/lib/analytics';
import { ArrowIcon, BellIcon, DuelIcon, FlameIcon, LockIcon } from '@/components/home/Icons';
import { HeroCard } from '@/components/home/HeroCard';
import { ActiveNowRail } from '@/components/home/ActiveNowRail';
import { HomeSectionHeader, homeSectionLink } from '@/components/home/HomeSectionHeader';
import { DuoCard } from '@/components/home/DuoCard';
import { HydrationCard } from '@/components/home/HydrationCard';
import { StepsCard } from '@/components/home/StepsCard';
import { TodayRings } from '@/components/home/TodayRings';
import { CountUp, PopOnChange, StaggerIn } from '@/components/motion';
import { PressableScale, Screen } from '@/components/ui';
import { exerciseHomeStats } from '@/domain/exerciseHomeStats';
import { firstNameOf, selectHomeGreeting } from '@/domain/homeGreeting';
import { dailyChallengeProgress } from '@/domain/dailyChallenge';
import { myExerciseBreakdown, partnerWidget } from '@/domain/coupleExercises';
import {
  partnerGoalToday,
  partnerLastDrinkToday,
  nudgeAt,
  partnerLayersToday,
  partnerRepsToday,
  partnerWaterRevToday,
  partnerHabitsToday,
  partnerStepsToday,
  partnerWaterToday,
} from '@/domain/couple';
import { drinksOnDay, hydrationProgress, stepGoalMl } from '@/domain/hydration';
import { lightImpactHaptic, selectionHaptic } from '@/lib/feedback';
import { shareDrink, syncHydrationNow, syncRepsNow, syncStepsNow } from '@/services/hydrationSync';
import { useStepsToday } from '@/state/useStepsToday';
import { buildDashboardSnapshot } from '@/domain/dashboardSnapshot';
import { buildWidgetSnapshot } from '@/domain/widgetSnapshot';
import { buildWaterWidgetSnapshot, repsOnDay } from '@/domain/waterWidget';
import { drinkLayers } from '@/domain/drinkKinds';
import { useWidgetStyleStore } from '@/state/widgetStyleStore';
import { useDuoStreakStore } from '@/state/duoStreakStore';
import { useRitualStore } from '@/state/ritualStore';
import { useWeatherStore } from '@/state/weatherStore';
import { refreshWeather } from '@/services/weather';
import { meadow, weekWrap, wrapLine } from '@/domain/week';
import { bondMonths, occasionFor, seasonFor } from '@/domain/season';
import { duoStreak } from '@/domain/duoStreak';
import { DEFAULT_DAILY_GOAL_ML } from '@/domain/hydration';
import { HABITS, cleanTicks, effectivePlan, ritualFor, ritualScore } from '@/domain/ritual';
import { getExercise } from '@/vision/exercises';
import { clearWidgetSnapshot, publishWidgetSnapshot } from '@/services/partnerWidget';
import { trackerHistory } from '@/domain/coupleTracker';
import { selectHomeFocus, type HomeFocus } from '@/domain/homeFocus';
import { leagueProgressFromWeeklyXp } from '@/domain/leagueProgress';
import { liveActivity } from '@/domain/liveActivity';
import { usePhantomSeed } from '@/domain/seedPhantoms';
import { rivalryWith } from '@/domain/rivalry';
import { weekStrip } from '@/domain/weekStrip';
import { dayKey } from '@/domain/progression';
import {
  useProfileStore,
  selectDaysTrainedThisWeek,
  selectLevel,
  selectStreak,
  selectTotalReps,
  selectWeeklyXp,
} from '@/state/profileStore';
import { selectTodayMl, useHydrationStore } from '@/state/hydrationStore';
import { useEffectivePro } from '@/state/proStore';
import { isPurchasesConfigured } from '@/services/purchases';
import { isWalled } from '@/domain/hardPaywall';
import { useCouple } from '@/state/useCouple';
import { usePublicAvatar } from '@/state/usePublicAvatar';
import { useIncomingDuelCount } from '@/state/useIncomingDuelCount';
import { useLiveActivityCount } from '@/state/useLiveActivityCount';
import { useSelfPlayer } from '@/state/useSelfPlayer';
import { font, scaleForRole } from '@/theme/typography';
import { palette, radius, surfaceShadow } from '@/theme/tokens';

/** Push-ups is the featured daily challenge; mirrors `app/modal/daily.tsx`. */
/* The challenge itself lives in `domain/dailyChallenge`, which Home, the tab
   layout's FAB and the daily modal all read — it used to be declared once in
   each of the three, so changing the target left them contradicting one
   another about whether it was cleared. */

const MEDAL_BRONZE = require('../../assets/medal-bronze.png');
const TROPHY_BRONZE = require('../../assets/trophy-bronze.png');
const IC_PUSHUP = require('../../assets/ic-pushup.png');
const IC_SQUAT = require('../../assets/ic-squat.png');

export default function HomeScreen() {
  const router = useRouter();
  const profile = useProfileStore();
  const couple = useCouple();
  const self = useSelfPlayer();

  const level = selectLevel(profile);
  const weeklyXp = selectWeeklyXp(profile);
  const leagueProgress = useMemo(() => leagueProgressFromWeeklyXp(weeklyXp), [weeklyXp]);
  const streak = selectStreak(profile);
  /* Whether solo training is out of free reps. Couple mode is exempt, so this
     is deliberately asked without `isCoupleMode` — it governs the solo tiles
     and the hero's solo cases only. */
  const isPro = useEffectivePro();
  const soloWalled = isWalled({
    isPro,
    repsSoFar: selectTotalReps(profile),
    billingReady: isPurchasesConfigured(),
  });
  const daysTrained = selectDaysTrainedThisWeek(profile);
  const week = useMemo(
    () => weekStrip(profile.sessions.map((x) => x.day)),
    [profile.sessions],
  );
  const goal = profile.weeklyGoal;
  const initial = (profile.username || 'C').charAt(0).toUpperCase();
  const pendingDuels = useIncomingDuelCount();
  const firstName = firstNameOf(profile.displayName || profile.username);

  const seed = usePhantomSeed();
  const realActive = useLiveActivityCount();
  const activity = liveActivity(realActive, seed.phantomOnline.length, seed.isSeeding);

  const today = dayKey();
  const trainedToday = profile.sessions.some((s) => s.day === today);
  const daily = useMemo(
    () => dailyChallengeProgress(profile.sessions, today),
    [profile.sessions, today],
  );

  /* The partner's live week. `watchMyCouple` holds an `onSnapshot` on the
     couple document, so these numbers move when they finish a set — no
     polling, no refresh. Their *days* sync; their reps never leave their
     phone, which is why the widget counts days on their side and reps on
     mine. */
  const partnerPulse = useMemo(() => {
    const uid = couple.me?.uid;
    if (!couple.paired || !couple.partner || !uid) return null;
    const history = trackerHistory(couple.couple, uid, today, 7);
    const week = new Set(history.filter((h) => !h.isFuture).map((h) => h.day));
    return {
      widget: partnerWidget(history, profile.sessions, today),
      mine: myExerciseBreakdown(profile.sessions, week).mine,
    };
  }, [couple.paired, couple.partner, couple.couple, couple.me?.uid, profile.sessions, today]);

  /* Today's own water, for the partner widget's water line — read straight
     from the store so the widget effect can sit here, above the card's
     fuller hydration progress. */
  const todayMl = useHydrationStore((st) => selectTodayMl(st, today));

  /* Mirror the partner card into the OS widget's SharedPreferences whenever it
     changes. No-op on iOS and on builds without the widget plugin, so this is
     safe to call unconditionally. */
  useEffect(() => {
    if (!partnerPulse) return;
    publishWidgetSnapshot(
      buildWidgetSnapshot(couple.partner?.displayName ?? 'Your partner', partnerPulse.widget, Date.now(), {
        theirMl: partnerWaterToday(couple.partner, today),
        myMl: todayMl,
      }),
    );
  }, [partnerPulse, couple.partner, today, todayMl]);

  /* Water. The store is the source of truth; the card is presentational, so
     every decision about what counts stays in `domain/hydration`. */
  const drinks = useHydrationStore((s) => s.drinks);
  const goalMl = useHydrationStore((s) => s.goalMl);
  const water = useMemo(
    () => hydrationProgress(drinks, goalMl, today),
    [drinks, goalMl, today],
  );
  const todayDrinks = useMemo(() => drinksOnDay(drinks, today), [drinks, today]);

  /* The partner's intake, only when their phone stamped today. Null hides the
     line entirely rather than showing a zero they never earned. */
  const partnerWater = useMemo(() => {
    const name = couple.partner?.displayName;
    const ml = partnerWaterToday(couple.partner, today);
    return ml == null || !name ? null : { name, ml };
  }, [couple.partner, today]);

  /* The partner's glass on the Today card: present whenever paired, with
     `ml` null until they share water today — so the toast does not vanish
     every morning and reappear once they drink. */
  const partnerGlass = useMemo(() => {
    const name = couple.partner?.displayName;
    if (!couple.paired || !name) return null;
    return {
      name,
      ml: partnerWaterToday(couple.partner, today),
      goalMl: partnerGoalToday(couple.partner, today),
      layers: partnerLayersToday(couple.partner, today),
    };
  }, [couple.paired, couple.partner, today]);

  /* The partner's photo as their profile has it now — the couple doc's copy is
     a pairing-time snapshot, often empty or a path on their phone. */
  const partnerAvatar = usePublicAvatar(couple.partner?.uid, couple.partner?.avatarUrl);

  const coupleId = couple.couple?.id ?? null;
  const myUid = couple.me?.uid ?? null;

  /* Today's steps. Read on mount and on foreground — the count cannot move
     while the app is backgrounded, but it will have moved by the time they
     come back, which is when the ring is about to be read. */
  const { steps: stepsToday, openSettings: openStepSettings } = useStepsToday();

  /* Publish the count to the bond whenever a read lands. `syncStepsNow`
     no-ops when it has not moved, so a foreground read that finds the same
     number costs nothing. */
  useEffect(() => {
    if (stepsToday.status !== 'ready') return;
    void syncStepsNow(coupleId, myUid, stepsToday.steps);
  }, [stepsToday, coupleId, myUid]);

  /* My reps today, for my partner's rings. Re-published whenever the session
     log changes, which is the moment a set finishes and Home comes back. */
  const myReps = useMemo(() => repsOnDay(profile.sessions, today), [profile.sessions, today]);
  useEffect(() => {
    void syncRepsNow(coupleId, myUid, {
      reps: myReps.reps,
      topEx: myReps.top ? getExercise(myReps.top).label : null,
      trainedAt: myReps.trainedAt,
    });
  }, [myReps, coupleId, myUid]);

  /* The partner's day on the home screen: water bear inside three rings, each
     beside mine. Their own phone also pushes it straight to the widget as it
     moves; this keeps it right whenever this app is open, from the same
     builder, so the two can never disagree. */
  const myStepsCount = stepsToday.status === 'ready' ? stepsToday.steps : null;
  /* My own bear on the duo widget: my goal and today's drinks as bands. */
  const myGoalMl = useHydrationStore((st) => st.goalMl);
  const ritualDay = useRitualStore((st) => st.day);
  const ritualTicks = useRitualStore((st) => st.ticks);
  const myRitualTicks = useMemo(() => (ritualDay === today ? ritualTicks : []), [ritualDay, ritualTicks, today]);
  const allDrinks = useHydrationStore((st) => st.drinks);
  const myLayers = useMemo(
    () => drinkLayers(allDrinks.filter((d) => d.day === today)).map((l) => ({ k: l.kind, ml: l.ml })),
    [allDrinks, today],
  );
  /* My latest drink today — for the "sipped together" moment. */
  const myLastAt = useMemo(() => {
    let latest = 0;
    for (const d of allDrinks) {
      if (d.day !== today) continue;
      const at = Date.parse(d.at);
      if (Number.isFinite(at) && at > latest) latest = at;
    }
    return latest;
  }, [allDrinks, today]);
  const layout = useWidgetStyleStore((st) => st.layout);
  const theme = useWidgetStyleStore((st) => st.theme);
  /* The duo streak: a day counts once both bears are full, as seen here. */
  const streakDays = useDuoStreakStore((st) => st.days);
  const partnerFull =
    !!partnerGlass &&
    (partnerGlass.ml ?? 0) >= (partnerGlass.goalMl ?? DEFAULT_DAILY_GOAL_ML);
  const bothFull = partnerFull && todayMl >= myGoalMl;
  useEffect(() => {
    if (bothFull) useDuoStreakStore.getState().record(today);
  }, [bothFull, today]);
  const duoDays = duoStreak(streakDays, today);
  /* A splash from them: their latest water nudge, aimed at me. */
  const lastNudge = couple.couple?.nudge;
  const fromThem = !!lastNudge && lastNudge.fromUid !== couple.me?.uid;
  const splashAt =
    fromThem && lastNudge?.kind === 'water' && !lastNudge.emoji ? (nudgeAt(couple.couple ?? null) ?? 0) : 0;
  /* A reaction from them: a nudge carrying an emoji. */
  const reactAt = fromThem && lastNudge?.emoji ? (nudgeAt(couple.couple ?? null) ?? 0) : 0;
  const reactEmoji = fromThem ? (lastNudge?.emoji ?? '') : '';

  /* The week together: today's totals for both, kept for the meadow and
     the Sunday wrap. */
  const weekHistory = useDuoStreakStore((st) => st.week);
  const theirMlToday = partnerGlass?.ml ?? 0;
  useEffect(() => {
    if (!partnerGlass) return;
    useDuoStreakStore.getState().recordTotals(today, { them: theirMlToday, me: todayMl });
  }, [partnerGlass, theirMlToday, todayMl, today]);
  /* The calendar: the season (hemisphere from the weather reading when on)
     and today's occasion — New Year, Valentine's, or our monthly bond. */
  const pairedAtMs = (couple.couple as { pairedAt?: { toMillis?: () => number } } | null)?.pairedAt?.toMillis?.() ?? 0;
  const weatherOn = useWidgetStyleStore((st) => st.weather);
  const south = useWeatherStore((st) => !!(weatherOn && st.now?.south));
  const calendar = useMemo(() => {
    const [y, m, d] = today.split('-').map(Number);
    const date = new Date(y as number, (m as number) - 1, d as number, 12);
    const bond = bondMonths(pairedAtMs, date);
    return { season: seasonFor(date, south), occasion: occasionFor(date, bond), bond };
  }, [today, pairedAtMs, south]);

  const weekInfo = useMemo(() => {
    const name = partnerGlass?.name ?? 'Partner';
    return {
      meadow: meadow(weekHistory, today),
      wrap: wrapLine(weekWrap(weekHistory, streakDays, today), name, today),
    };
  }, [weekHistory, streakDays, today, partnerGlass?.name]);
  const showSteps = useWidgetStyleStore((st) => st.showSteps);
  const showReps = useWidgetStyleStore((st) => st.showReps);
  const showMine = useWidgetStyleStore((st) => st.showMine);
  const motion = useWidgetStyleStore((st) => st.motion);
  const realWeather = useWidgetStyleStore((st) => st.weather);
  const surface = useWidgetStyleStore((st) => st.surface);
  const weatherNow = useWeatherStore((st) => st.now);
  /* Real weather, when switched on: refreshed on focus, at most half-hourly. */
  useFocusEffect(
    useCallback(() => {
      void refreshWeather();
    }, []),
  );
  /* Our daily ritual, both sides, from the same data the widget shows — for
     the widget below and for the Duo card's ritual row. */
  const ritualScores = useMemo(() => {
    if (!partnerGlass) return null;
    const plan = effectivePlan(couple.me?.ritualPlan, couple.partner?.ritualPlan);
    return {
      them: ritualScore(
        ritualFor({
          ml: partnerGlass.ml,
          goalMl: partnerGlass.goalMl ?? DEFAULT_DAILY_GOAL_ML,
          steps: partnerStepsToday(couple.partner, today),
          reps: partnerRepsToday(couple.partner, today).reps,
          ticks: cleanTicks(partnerHabitsToday(couple.partner, today)),
        }, plan),
      ),
      me: ritualScore(ritualFor({ ml: todayMl, goalMl: myGoalMl, steps: myStepsCount, reps: myReps.reps, ticks: myRitualTicks }, plan)),
      total: HABITS.length,
    };
  }, [partnerGlass, couple.me?.ritualPlan, couple.partner, today, todayMl, myGoalMl, myStepsCount, myReps.reps, myRitualTicks]);

  useEffect(() => {
    if (!partnerGlass) {
      // Unpaired: an old partner's day must not linger on the home screen.
      if (!couple.loading) clearWidgetSnapshot('water');
      return;
    }
    const theirReps = partnerRepsToday(couple.partner, today);
    const ritual = ritualScores ?? { them: 0, me: 0, total: HABITS.length };
    useRitualStore.getState().record(today, { me: ritual.me, them: ritual.them });
    publishWidgetSnapshot(
      buildWaterWidgetSnapshot({
        name: partnerGlass.name,
        day: today,
        ml: partnerGlass.ml ?? 0,
        goalMl: partnerGlass.goalMl,
        layers: partnerGlass.layers,
        last: partnerLastDrinkToday(couple.partner, today),
        steps: partnerStepsToday(couple.partner, today),
        reps: theirReps.reps,
        topExercise: theirReps.topEx,
        trainedAt: theirReps.trainedAt,
        me: {
          ml: todayMl,
          steps: myStepsCount,
          reps: myReps.reps,
          goalMl: myGoalMl,
          layers: myLayers,
          lastAt: myLastAt,
        },
        rev: partnerWaterRevToday(couple.partner, today),
        style: { layout, theme, showSteps, showReps, showMine, motion, weather: realWeather, surface },
        calendar,
        streak: duoDays,
        cheerAt: splashAt,
        react: reactAt > 0 ? { at: reactAt, emoji: reactEmoji } : null,
        week: weekInfo,
        weather: realWeather ? weatherNow : null,
        ritual,
      }),
      'water',
    );
  }, [
    partnerGlass,
    couple.partner,
    couple.loading,
    today,
    todayMl,
    myStepsCount,
    myReps.reps,
    myGoalMl,
    myLayers,
    myLastAt,
    duoDays,
    splashAt,
    reactAt,
    reactEmoji,
    weekInfo,
    realWeather,
    weatherNow,
    surface,
    calendar,
    layout,
    theme,
    showSteps,
    showReps,
    showMine,
    motion,
    ritualScores,
  ]);

  /* Mirror the same numbers into the daily dashboard widget. A no-op on any
     build without the extension, so this is safe to call unconditionally —
     on Android the bridge resolves the id to null and publishes nowhere. */
  useEffect(() => {
    publishWidgetSnapshot(
      buildDashboardSnapshot(drinks, goalMl, stepsToday, partnerWater, today),
      'dashboard',
    );
  }, [drinks, goalMl, stepsToday, partnerWater, today]);

  const logWater = useCallback(
    (ml: number, kind?: string) => {
      const before = selectTodayMl(useHydrationStore.getState(), dayKey());
      const entry = useHydrationStore.getState().logDrink(ml, kind);
      // A refused tap gets no haptic: the confirmation must mean something.
      if (!entry) return;
      lightImpactHaptic();
      track('water_logged', { ml: entry.ml, source: 'home' });
      // Set-to-value, so this publishes the day's total rather than the tap.
      void syncHydrationNow(coupleId, myUid).then(() =>
        /* "Just drank 250 ml — your turn" to the partner, when it is useful
           and not throttled; see `shareDrink`. After the sync, so their
           card already shows the new total when the push lands. */
        shareDrink({
          coupleId,
          uid: myUid,
          senderName: profile.displayName || profile.username || 'Your partner',
          ml: entry.ml,
          kind,
          beforeMl: before,
          goalMl: useHydrationStore.getState().goalMl,
        }),
      );
    },
    [coupleId, myUid, profile.displayName, profile.username],
  );

  const undoWater = useCallback(() => {
    useHydrationStore.getState().undoLast();
    /* Sync sees the total fell below what this phone published and sends
       the undone amount as a subtraction, so the partner's view walks back
       too (see `syncHydrationNow`). */
    void syncHydrationNow(coupleId, myUid);
  }, [coupleId, myUid]);

  const stepWaterGoal = useCallback((direction: 1 | -1) => {
    const current = useHydrationStore.getState().goalMl;
    const next = stepGoalMl(current, direction);
    // Silent at the ends of the band — a tick that fires when nothing moved
    // says the control worked when it did not.
    if (next === current) return;
    selectionHaptic();
    useHydrationStore.getState().setGoalMl(next);
    // The partner's jar of mine fills against this goal — tell them it moved.
    void syncHydrationNow(coupleId, myUid);
    track('water_goal_set', { goalMl: next });
  }, [coupleId, myUid]);

  const insets = useSafeAreaInsets();

  const greetingCopy = useMemo(
    () => selectHomeGreeting({ streak, trainedToday, firstName }),
    [streak, trainedToday, firstName],
  );

  const pushStats = useMemo(
    () => exerciseHomeStats(profile.sessions, 'push', today),
    [profile.sessions, today],
  );
  const squatStats = useMemo(
    () => exerciseHomeStats(profile.sessions, 'squat', today),
    [profile.sessions, today],
  );

  const focus = useMemo<HomeFocus>(
    () =>
      selectHomeFocus({
        hasTrained: profile.sessions.length > 0,
        trainedToday,
        daysThisWeek: daysTrained,
        weeklyGoal: goal,
        couple: {
          paired: couple.paired,
          partnerName: couple.partner?.displayName ?? null,
          streak: couple.streak,
          atRisk: couple.atRisk,
          partnerTrainedToday: couple.partner?.trainedDays.includes(today) ?? false,
        },
        dailyChallenge: {
          exercise: daily.exercise,
          target: daily.target,
          done: daily.cleared,
        },
      }),
    [profile.sessions.length, trainedToday, daysTrained, goal, couple, today, daily],
  );

  useEffect(() => {
    track('home_hero_shown', { kind: focus.kind });
  }, [focus.kind]);

  const rivalry = useMemo(
    () => rivalryWith(profile.sessions, couple.partner?.uid),
    [profile.sessions, couple.partner?.uid],
  );

  /** A live duel with the partner, from the Duo card's Race button. */
  const startCoupleRace = () => {
    if (!couple.partner) return;
    router.push({
      pathname: '/duel/new',
      params: {
        role: 'host',
        kind: 'duel',
        target: couple.partner.uid,
        name: couple.partner.displayName,
        ...(couple.partner.avatarUrl ? { avatar: couple.partner.avatarUrl } : {}),
      },
    });
  };

  /** Route the adaptive hero's single CTA when an urgent focus wins over the carousel. */
  const startCoupleTrain = () => {
    if (!couple.paired || !couple.partner || !self) {
      router.push('/modal/couple-invite');
      return;
    }
    router.push({
      pathname: '/duel/new',
      params: {
        role: 'host',
        kind: 'train',
        target: couple.partner.uid,
        name: couple.partner.displayName,
        ...(couple.partner.avatarUrl ? { avatar: couple.partner.avatarUrl } : {}),
      },
    });
  };

  /* Every solo route into a set goes through here.
   *
   * The session redirects a walled athlete to the paywall on its own, so this
   * is not what enforces the wall — it is what stops Home pretending the wall
   * is not there. Without it the tiles look normal, tapping one bounces
   * through a session that immediately unmounts, and dismissing lands back on
   * an unchanged Home: the obvious next move is to tap the same tile again.
   *
   * Couple mode deliberately does not call this. Together-sets are never
   * walled, and routing them through a Pro check would wall the invite loop. */
  const startSolo = (exercise: 'push' | 'squat') => {
    if (soloWalled) {
      router.push({ pathname: '/modal/paywall', params: { source: 'rep-limit', hard: '1' } });
      return;
    }
    router.push({ pathname: '/session', params: { exercise, mode: 'practice' } });
  };

  const onHeroPress = () => {
    track('home_hero_tapped', { kind: focus.kind });
    switch (focus.kind) {
      case 'first-session':
        return startSolo('push');
      case 'streak-at-risk':
      case 'partner-trained':
        // Same path as the Duo card's "Train together" — invite modal has no train CTA.
        return startCoupleTrain();
      case 'invite-partner':
        return router.push('/modal/couple-invite');
      case 'daily-challenge':
        return router.push('/modal/daily');
      case 'goal-met':
        return startSolo('push');
      case 'recovery':
        return router.push('/modal/rest');
    }
  };

  const onCoupleAction = async (action: 'train' | 'nudge' | 'open') => {
    track('home_couple_strip', { action });
    /* `open` is the celebrate / default tap, and it now lands on the bond's own
       tracker rather than the invite modal — the invite is the wrong
       destination for two people already paired, and every number the strip
       teases (streak, combined reps, who trained which day) is there in full.
       `nudge` still goes to the invite modal, which owns the poke controls. */
    if (action === 'open') {
      router.push('/couple');
      return;
    }
    if (action === 'nudge') {
      router.push('/modal/couple-invite');
      return;
    }
    startCoupleTrain();
  };

  /* Named for the goal, not for a reward. This was `daysToReward`, and the
     caption below promised one — but nothing in the app pays out for hitting a
     weekly goal: the only XP grant is `xpForSession` on a finished set. The
     bar itself is honest (real days against a target the athlete chose in
     onboarding); the promise underneath it was not, and a progress indicator
     that pays nothing teaches the athlete to discount the next one. */
  const daysToGoal = Math.max(0, goal - daysTrained);

  return (
    <View style={{ flex: 1, backgroundColor: palette.canvas }}>
      <Screen style={{ backgroundColor: 'transparent' }}>
      {/* Masthead: the date as an eyebrow, then the greeting in display type
          with the name on its own line — a long name wraps instead of being the
          word that gets cut. Profile and alerts sit square in the corner. */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.dateEyebrow} {...scaleForRole('control')}>
            {dateEyebrow(today)}
          </Text>
          <Text style={styles.greetingLine} {...scaleForRole('heading')}>
            {greetingCopy.timeOfDay},
          </Text>
          <Text style={styles.greetingName} numberOfLines={2} {...scaleForRole('heading')}>
            {firstName}
          </Text>
        </View>

        <View style={styles.headerActions}>
          <BellButton
            pendingDuels={pendingDuels}
            onPress={() => router.push('/modal/notifications')}
          />
          <PressableScale
            onPress={() => router.push('/(tabs)/profile')}
            accessibilityRole="button"
            accessibilityLabel="Your profile"
          >
            <View style={styles.avatarRing}>
              <View style={styles.avatar}>
                {profile.avatarUri ? (
                  <Image
                    source={{ uri: profile.avatarUri }}
                    style={styles.avatarImage}
                    contentFit="cover"
                    accessibilityLabel={profile.displayName}
                  />
                ) : (
                  <Text style={font('bold', 17, { color: palette.green600 })}>{initial}</Text>
                )}
              </View>
            </View>
            <View style={styles.levelBadge} accessibilityLabel={`Level ${level.level}`}>
              <Text style={font('extrabold', 9.5, { color: palette.white })}>{level.level}</Text>
            </View>
          </PressableScale>
        </View>
      </View>

      {/* Status: streak and who's live (the level rides on the avatar), then
          the one line of coaching. */}
      <View style={styles.statusRow}>
        <PopOnChange trigger={streak} style={[styles.chip, streak > 0 ? styles.chipStreak : null]}>
          <FlameIcon size={14} color={streak > 0 ? palette.amber800 : palette.grey500} />
          <Text
            style={font('bold', 12, { color: streak > 0 ? palette.amber800 : palette.grey600 })}
            {...scaleForRole('control')}
          >
            {streak > 0 ? `${streak} day streak` : 'No streak yet'}
          </Text>
        </PopOnChange>
        <View style={styles.chip}>
          <View style={styles.liveDotSmall} />
          <Text style={font('semibold', 12, { color: palette.grey600 })} numberOfLines={1}>
            {activity.count} {activity.label}
          </Text>
        </View>
      </View>
      <Text style={styles.coachLine} numberOfLines={2}>
        {greetingCopy.hook}
        {greetingCopy.bonus ? <Text style={styles.coachBonus}>{`  ·  ${greetingCopy.bonus}`}</Text> : null}
      </Text>

      <StaggerIn index={0}>
        {/* One card, always, chosen by `selectHomeFocus`. It used to appear
            only for a dying streak or a partner who had already trained, with a
            five-slide carousel filling the slot the rest of the time — so five
            of HeroCard's seven states were written, styled and unreachable, and
            Home showed the same rotating menu to everyone. */}
        <HeroCard
          focus={focus}
          onPress={onHeroPress}
          progress={{ value: daily.best, target: daily.target }}
        />
      </StaggerIn>

      {/* The day's three loops, one glance under the hero. */}
      <StaggerIn index={1}>
        <TodayRings
          challenge={daily}
          water={water}
          steps={stepsToday}
          onChallenge={() => router.push('/modal/daily')}
          onSteps={openStepSettings}
        />
      </StaggerIn>

      {/* The action people open the app for, straight under the hero rather
          than below every scoreboard. */}
      <HomeSectionHeader
        title="Quick start"
        right={
          <PressableScale
            onPress={() => router.push('/(tabs)/train')}
            accessibilityRole="button"
            accessibilityLabel="View all exercises"
          >
            <Text style={homeSectionLink}>View all ›</Text>
          </PressableScale>
        }
      />
      <StaggerIn index={1} style={styles.quickGrid}>
        <QuickTile
          label="Push-Ups"
          locked={soloWalled}
          image={IC_PUSHUP}
          accent={palette.green600}
          stats={pushStats}
          onPress={() => startSolo('push')}
        />
        <QuickTile
          label="Squats"
          locked={soloWalled}
          image={IC_SQUAT}
          accent={palette.purple600}
          stats={squatStats}
          onPress={() => startSolo('squat')}
        />
      </StaggerIn>

      {/* Faces to race, one tap from Home rather than a tab away. */}
      <StaggerIn index={2}>
        <ActiveNowRail />
      </StaggerIn>

      {/* The couple as one face-off — replaces the bond strip and the partner
          card, which told the same story twice. */}
      {/* The day's vitals as one set of Health-style cards under a single
          heading: the duo, water, steps. */}
      <HomeSectionHeader title="Summary" />
      {couple.paired && couple.partner ? (
        <StaggerIn index={3} style={styles.summaryGap}>
          <DuoCard
            me={couple.me}
            partner={couple.partner}
            myAvatar={profile.avatarUri ?? null}
            partnerAvatar={partnerAvatar}
            streak={couple.streak}
            combined={couple.combined}
            atRisk={couple.atRisk}
            levelName={couple.level.name}
            today={today}
            rivalry={rivalry}
            myRepsToday={myReps.reps}
            partnerRepsToday={partnerRepsToday(couple.partner, today).reps}
            onAction={(action) => void onCoupleAction(action)}
            onRace={startCoupleRace}
            onOpen={() => router.push('/couple/partner')}
            ritual={ritualScores}
          />
        </StaggerIn>
      ) : null}

      {/* Today's water as a filling glass and steps as a footprint trail, with
          drinks a tap away. */}
      <StaggerIn index={4} style={styles.summaryGap}>
        <HydrationCard
          water={water}
          drinks={todayDrinks}
          me={{ name: firstName || 'You', avatar: profile.avatarUri }}
          partner={
            partnerGlass
              ? { name: partnerGlass.name, avatar: partnerAvatar }
              : null
          }
          partnerMl={partnerGlass?.ml ?? null}
          partnerGoalMl={partnerGlass?.goalMl ?? null}
          partnerLayers={partnerGlass?.layers}
          onLogWater={logWater}
          onUndoWater={todayDrinks.length > 0 ? undoWater : undefined}
          onStepWaterGoal={stepWaterGoal}
        />
      </StaggerIn>
      <StaggerIn index={4}>
        <StepsCard
          steps={stepsToday}
          onFixSteps={openStepSettings}
          me={{ name: firstName || 'You', avatar: profile.avatarUri }}
          partner={
            couple.paired && couple.partner
              ? {
                  name: couple.partner.displayName,
                  avatar: partnerAvatar,
                  steps: partnerStepsToday(couple.partner, today),
                }
              : null
          }
        />
      </StaggerIn>

      <HomeSectionHeader title="Your progress" />
      <StaggerIn index={5} style={styles.row}>
        <PressableScale
          onPress={() => router.push('/modal/recap')}
          accessibilityRole="button"
          accessibilityLabel="Weekly streak progress"
          style={{ flex: 1 }}
        >
          <View style={[styles.statCard, styles.weekCard]}>
            <View style={styles.statCardInner}>
              <View style={styles.miniHeader}>
                <Text style={styles.miniTitle}>This week</Text>
                <Text style={font('bold', 12, { color: palette.green700 })}>
                  {daysTrained}/{goal}
                </Text>
              </View>
              <Text style={font('extrabold', 17, { color: palette.ink, marginTop: 10, letterSpacing: -0.3 })}>
                {streak > 0 ? `${streak} day streak` : 'Start a streak'}
              </Text>
              {/* This calendar week, Monday to Sunday: a flame for every day
                  trained, today outlined, the rest of the week still ahead. */}
              <View style={styles.weekStrip}>
                {week.map((cell) => (
                  <View key={cell.day} style={styles.weekCell}>
                    <View
                      style={[
                        styles.weekDot,
                        cell.trained && styles.weekDotTrained,
                        !cell.trained && cell.isToday && styles.weekDotToday,
                        cell.isFuture && styles.weekDotFuture,
                      ]}
                    >
                      {cell.trained ? <View style={styles.weekTick} /> : null}
                    </View>
                    <Text style={[styles.weekLetter, cell.isToday && styles.weekLetterToday]}>
                      {cell.letter}
                    </Text>
                  </View>
                ))}
              </View>
              <Text style={font('medium', 11, { color: palette.grey600, marginTop: 10 })} numberOfLines={1}>
                {daysToGoal === 0
                  ? `Weekly goal met — ${daysTrained} of ${goal} days`
                  : `${daysToGoal} day${daysToGoal === 1 ? '' : 's'} to your weekly goal`}
              </Text>
            </View>
          </View>
        </PressableScale>

        <PressableScale
          onPress={() => router.push('/modal/leaderboard')}
          accessibilityRole="button"
          accessibilityLabel="League standings"
          style={{ flex: 1 }}
        >
          <View style={[styles.statCard, styles.leagueCard]}>
            <View style={styles.statCardInner}>
              <View style={styles.miniHeader}>
                <Text style={styles.miniTitle}>League</Text>
                <Image source={TROPHY_BRONZE} style={styles.trophyMini} contentFit="contain" />
              </View>
              <View style={styles.leagueRow}>
                <Image source={MEDAL_BRONZE} style={styles.medalIconSmall} contentFit="contain" />
                <Text style={font('extrabold', 17, { color: palette.ink, letterSpacing: -0.3 })}>
                  {leagueProgress.title}
                </Text>
              </View>
              <Text style={[font('bold', 13, { color: palette.amber800, marginTop: 6 }), styles.tabular]}>
                <CountUp value={weeklyXp} style={[font('bold', 13, { color: palette.amber800 }), styles.tabular]} /> XP this week
              </Text>
              <LeagueXpBar fill={leagueProgress.fill} />
              <Text style={font('medium', 11, { color: palette.grey600, marginTop: 8 })} numberOfLines={1}>
                {leagueProgress.nextLeague
                  ? `${leagueProgress.xpToNext.toLocaleString()} XP to ${leagueProgress.nextLeague.name}`
                  : 'Top league — hold the crown'}
              </Text>
            </View>
          </View>
        </PressableScale>
      </StaggerIn>

      </Screen>
      {/* Cards scrolling under the clock and battery read as a collision.
          A short fade from the canvas behind the status bar lets them slip
          away instead. */}
      <LinearGradient
        pointerEvents="none"
        colors={[palette.canvas, 'rgba(246,247,245,0.85)', 'rgba(246,247,245,0)']}
        locations={[0, 0.6, 1]}
        style={[styles.statusFade, { height: insets.top + 18 }]}
      />
    </View>
  );
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Thursday, 25 Sep" from a day key — built by hand so it never depends on Intl. */
function dateEyebrow(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y as number, (m as number) - 1, d as number, 12);
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** Notification bell — wiggles when rivals are waiting. */
function BellButton({ pendingDuels, onPress }: { pendingDuels: number; onPress: () => void }) {
  const rotate = useSharedValue(0);

  useEffect(() => {
    if (pendingDuels <= 0) {
      rotate.value = 0;
      return;
    }
    rotate.value = withRepeat(
      withSequence(
        withTiming(-12, { duration: 90 }),
        withTiming(12, { duration: 90 }),
        withTiming(-8, { duration: 80 }),
        withTiming(8, { duration: 80 }),
        withTiming(0, { duration: 70 }),
        withDelay(2200, withTiming(0, { duration: 0 })),
      ),
      -1,
      false,
    );
  }, [pendingDuels, rotate]);

  const wiggleStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotate.value}deg` }],
  }));

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        pendingDuels > 0
          ? `${pendingDuels} ${pendingDuels === 1 ? 'rival' : 'rivals'} waiting on you`
          : 'Notifications'
      }
      style={[styles.iconButton, pendingDuels > 0 && styles.iconButtonAlert]}
    >
      <Animated.View style={wiggleStyle}>
        {pendingDuels > 0 ? (
          <DuelIcon size={19} color={palette.green700} />
        ) : (
          <BellIcon size={19} color={palette.ink} />
        )}
      </Animated.View>
      {pendingDuels > 0 ? (
        <PopOnChange trigger={pendingDuels} style={styles.bellDot}>
          <Text style={font('bold', 9.5, { color: palette.white })}>
            {pendingDuels > 9 ? '9+' : pendingDuels}
          </Text>
        </PopOnChange>
      ) : null}
    </PressableScale>
  );
}


function LeagueXpBar({ fill }: { fill: number }) {
  const width = useSharedValue(0);
  useEffect(() => {
    width.value = withDelay(
      300,
      withTiming(Math.max(0.04, Math.min(1, fill)), { duration: 900, easing: Easing.out(Easing.cubic) }),
    );
  }, [fill, width]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${Math.round(width.value * 100)}%` }));
  return (
    <View style={styles.leagueXpTrack}>
      <Animated.View style={[styles.leagueXpFill, fillStyle]} />
    </View>
  );
}


function QuickTile({
  label,
  image,
  emoji,
  accent,
  stats,
  onPress,
  locked = false,
}: {
  label: string;
  image?: number;
  emoji?: string;
  accent: string;
  stats: { todayBest: number; lastBest: number; delta: number };
  onPress: () => void;
  /** Free reps are spent. The tile still taps — straight to the paywall. */
  locked?: boolean;
}) {
  /*
   * A day that has not been trained yet is not a regression.
   *
   * The delta is today's best minus the last training day's, so opening the
   * app before training shows the whole of yesterday as a loss — a red "-32"
   * for having not started. Worse, it kept counting *up* toward zero as reps
   * came in, so the number shrank while the athlete improved.
   *
   * Only compare once today has reps to compare with. Until then the tile
   * invites a set, which is the action the card exists to prompt.
   */
  const notStartedToday = stats.todayBest === 0;
  /*
   * A day still in progress is not a worse day.
   *
   * Today's best only becomes a fair comparison once the athlete has had a
   * real go at it. One rep in against a finished six-rep day is not a 5-rep
   * regression, but that is what a bare subtraction says — and it says it in
   * red, on the tile whose job is to get them to start. Worse, the number
   * climbs toward zero as they train, so it shrinks while they improve.
   *
   * Below half of the last day's best, the tile shows how far there is left
   * to go instead. That is the same information stated as a target rather
   * than a deficit, and it turns back into a real +/- delta as soon as the
   * comparison is worth making.
   */
  const chasing = !notStartedToday && stats.lastBest > 0 && stats.todayBest * 2 < stats.lastBest;
  const deltaLabel = notStartedToday
    ? 'Start set'
    : chasing
      ? `${stats.lastBest - stats.todayBest} to go`
      : stats.delta > 0
        ? `+${stats.delta}`
        : stats.delta < 0
          ? `${stats.delta}`
          : 'Even';
  // Red is earned only by a genuine shortfall on a day with a real attempt in
  // it — not by having barely started.
  const deltaPositive = notStartedToday || chasing || stats.delta >= 0;

  /* A locked tile says so instead of inviting a set it cannot deliver. It stays
     pressable, because the paywall is where the tap should go — what it must
     not do is look like a normal "Start set" and bounce off a session that
     unmounts itself. */
  const pillLabel = locked ? 'Free reps used' : deltaLabel;

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={locked ? `${label} — free reps used, see Pro` : `Practice ${label}`}
      style={styles.quickTileWrap}
    >
      <View style={styles.quickTile}>
        <View style={styles.quickTileTop}>
          <View style={[styles.quickIconBubble, { borderColor: `${accent}26` }]}>
            {image ? (
              <Image source={image} style={styles.quickIconImg} contentFit="contain" />
            ) : (
              <Text style={{ fontSize: 22 }}>{emoji}</Text>
            )}
          </View>
          <View
            style={[
              styles.deltaPill,
              {
                backgroundColor: locked
                  ? palette.divider
                  : deltaPositive
                    ? `${accent}14`
                    : palette.tintDangerBg,
              },
            ]}
          >
            <Text
              style={font('bold', 11, {
                color: locked ? palette.grey600 : deltaPositive ? accent : '#b91c1c',
              })}
            >
              {pillLabel}
            </Text>
          </View>
        </View>
        <Text style={font('bold', 15, { color: palette.ink, marginTop: 14 })} numberOfLines={1}>
          {label}
        </Text>
        <View style={styles.quickBestRow}>
          <CountUp
            value={stats.todayBest}
            duration={800}
            style={[font('extrabold', 30, { color: palette.ink }), styles.tabular]}
          />
          <Text style={font('semibold', 12, { color: palette.grey500 })}>reps today</Text>
        </View>
        <View style={styles.quickFooter}>
          {/* "Last 0 reps" said nothing — there was no last session to beat. */}
          <Text style={font('medium', 11.5, { color: palette.grey600, flex: 1 })} numberOfLines={1}>
            {stats.lastBest > 0
              ? `Last best ${stats.lastBest}`
              : stats.todayBest > 0
                ? 'Beat it next time'
                : 'Set your first best'}
          </Text>
          <View style={[styles.quickGo, { backgroundColor: locked ? palette.grey500 : accent }]}>
            {locked ? <LockIcon size={14} color={palette.white} /> : <ArrowIcon size={14} color={palette.white} strokeWidth={2.4} />}
          </View>
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  tabular: { fontVariant: ['tabular-nums'] },
  summaryGap: { marginBottom: 12 },
  statusFade: { position: 'absolute', top: 0, left: 0, right: 0 },

  // Masthead
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: 12,
    gap: 12,
  },
  dateEyebrow: { ...font('semibold', 13, { color: palette.grey600 }) },
  greetingLine: {
    ...font('medium', 22, { color: palette.grey600, marginTop: 8 }),
    letterSpacing: -0.4,
    lineHeight: 27,
  },
  greetingName: {
    ...font('extrabold', 30, { color: palette.ink }),
    letterSpacing: -0.9,
    lineHeight: 35,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  avatarRing: { width: 46, height: 46, borderRadius: 23, padding: 2, backgroundColor: palette.borderStrong },
  avatar: {
    flex: 1,
    borderRadius: 21,
    backgroundColor: palette.white,
    borderWidth: 2,
    borderColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  /* The level rides on the avatar like a badge on an app icon: always there,
     never a third chip competing with the name. */
  levelBadge: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: palette.ink,
    borderWidth: 2,
    borderColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.07)',
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  chipStreak: { backgroundColor: '#FFF6E5', borderColor: 'rgba(180,83,9,0.18)' },
  coachLine: {
    ...font('medium', 12.5, { color: palette.grey600, marginTop: 12, marginBottom: 18 }),
    lineHeight: 18,
  },
  coachBonus: font('bold', 12.5, { color: palette.green700 }),
  /**
   * Single-purpose circular control — one icon, one action. The border is
   * deliberately stronger than `palette.border`, which vanished on the canvas.
   */
  iconButton: {
    position: 'relative',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    ...surfaceShadow,
  },
  /** Raised state — rivals are waiting, so the control itself signals it. */
  iconButtonAlert: {
    backgroundColor: palette.green50,
    borderColor: palette.green500,
    shadowColor: palette.green600,
    shadowOpacity: 0.28,
    shadowRadius: 10,
  },
  bellDot: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: palette.red500,
    borderWidth: 2,
    borderColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDotSmall: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.green500 },

  // Progress pair — one surface language with every other card on Home.
  row: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  statCard: {
    flex: 1,
    minHeight: 164,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
    borderRadius: radius['2xl'],
    overflow: 'hidden',
    ...surfaceShadow,
  },
  weekCard: {},
  leagueCard: {},
  statCardInner: { flex: 1, padding: 16 },
  miniHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  miniTitle: font('semibold', 13, { color: palette.grey600 }),
  weekStrip: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  weekCell: { alignItems: 'center', gap: 4 },
  weekDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: palette.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDotTrained: { backgroundColor: palette.green600 },
  weekDotToday: { borderWidth: 2, borderColor: palette.green500, backgroundColor: palette.white },
  weekDotFuture: { opacity: 0.45 },
  weekTick: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.white },
  weekLetter: font('semibold', 9.5, { color: palette.grey500 }),
  weekLetterToday: font('extrabold', 9.5, { color: palette.green700 }),
  leagueRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  medalIconSmall: { width: 30, height: 26, marginLeft: -4, marginRight: 2 },
  trophyMini: { width: 26, height: 26 },
  leagueXpTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(146,64,14,0.10)',
    overflow: 'hidden',
    marginTop: 10,
  },
  leagueXpFill: { height: '100%', borderRadius: 3, backgroundColor: '#d97706' },

  // Quick tiles
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  quickTileWrap: { width: '47%', flexGrow: 1 },
  quickTile: {
    borderRadius: radius['2xl'],
    padding: 14,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
    overflow: 'hidden',
    ...surfaceShadow,
  },
  quickTileTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  quickIconBubble: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  quickIconImg: { width: 46, height: 46 },
  deltaPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill },
  quickBestRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 2 },
  quickFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: palette.dividerSoft,
  },
  quickGo: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

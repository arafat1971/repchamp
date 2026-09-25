import { useMemo } from 'react';

import { SAMPLE_SNAPSHOT } from '@/components/widget/WidgetPreview';
import {
  nudgeAt,
  partnerGoalToday,
  partnerHabitsToday,
  partnerLastDrinkToday,
  partnerLayersToday,
  partnerRepsToday,
  partnerStepsToday,
  partnerWaterToday,
} from '@/domain/couple';
import { partnerWidget } from '@/domain/coupleExercises';
import { trackerHistory } from '@/domain/coupleTracker';
import { drinkLayers } from '@/domain/drinkKinds';
import { duoStreak } from '@/domain/duoStreak';
import { dayKey } from '@/domain/progression';
import { HABITS, cleanTicks, ritualFor, ritualScore } from '@/domain/ritual';
import { bondMonths, occasionFor, seasonFor } from '@/domain/season';
import { buildWaterWidgetSnapshot, repsOnDay, type WaterWidgetSnapshot } from '@/domain/waterWidget';
import { meadow, weekWrap, wrapLine } from '@/domain/week';
import { buildWidgetSnapshot, type WidgetSnapshot } from '@/domain/widgetSnapshot';
import { useDuoStreakStore } from '@/state/duoStreakStore';
import { selectTodayMl, useHydrationStore } from '@/state/hydrationStore';
import { useProfileStore } from '@/state/profileStore';
import { useRitualStore } from '@/state/ritualStore';
import { useCouple } from '@/state/useCouple';
import { useStepsToday } from '@/state/useStepsToday';
import { useWeatherStore } from '@/state/weatherStore';
import { useWidgetStyleStore } from '@/state/widgetStyleStore';

/**
 * The partner's day and mine, as one widget snapshot — the same builder the
 * home-screen widget uses, so every in-app picture of "today together" (the
 * studio's preview, the partner screen's stage) agrees with the widget.
 * Falls back to the sample when there is no partner yet.
 */
export function usePartnerTodaySnapshot(): WaterWidgetSnapshot {
  const couple = useCouple();
  const today = dayKey();
  const myMl = useHydrationStore((s) => selectTodayMl(s, today));
  const myGoal = useHydrationStore((s) => s.goalMl);
  const drinks = useHydrationStore((s) => s.drinks);
  const sessions = useProfileStore((s) => s.sessions);
  const streakDays = useDuoStreakStore((s) => s.days);
  const week = useDuoStreakStore((s) => s.week);
  const weatherOn = useWidgetStyleStore((s) => s.weather);
  const weatherNow = useWeatherStore((s) => s.now);
  const ritualDay = useRitualStore((s) => s.day);
  const ritualTicks = useRitualStore((s) => s.ticks);
  const { steps } = useStepsToday();
  const mySteps = steps.status === 'ready' ? steps.steps : null;

  return useMemo(() => {
    const partner = couple.partner;
    const name = partner?.displayName?.trim();
    if (!couple.paired || !partner || !name) return SAMPLE_SNAPSHOT;
    const reps = partnerRepsToday(partner, today);
    const mine = drinks.filter((d) => d.day === today);
    let myLastAt = 0;
    for (const d of mine) {
      const at = Date.parse(d.at);
      if (Number.isFinite(at) && at > myLastAt) myLastAt = at;
    }
    const nudge = couple.couple?.nudge;
    const fromThem = !!nudge && nudge.fromUid !== couple.me?.uid;
    const nudgeTime = fromThem ? (nudgeAt(couple.couple ?? null) ?? 0) : 0;
    const [y, m, d] = today.split('-').map(Number);
    const date = new Date(y as number, (m as number) - 1, d as number, 12);
    const pairedAt =
      (couple.couple as { pairedAt?: { toMillis?: () => number } } | null)?.pairedAt?.toMillis?.() ?? 0;
    const bond = bondMonths(pairedAt, date);
    const theirWater = partnerWaterToday(partner, today);
    const theirSteps = partnerStepsToday(partner, today);
    const ritual = {
      them: ritualScore(
        ritualFor({
          ml: theirWater,
          goalMl: partnerGoalToday(partner, today) ?? myGoal,
          steps: theirSteps,
          reps: reps.reps,
          ticks: cleanTicks(partnerHabitsToday(partner, today)),
        }),
      ),
      me: ritualScore(
        ritualFor({ ml: myMl, goalMl: myGoal, steps: mySteps, reps: repsOnDay(sessions, today).reps, ticks: ritualDay === today ? ritualTicks : [] }),
      ),
      total: HABITS.length,
    };
    return buildWaterWidgetSnapshot({
      ritual,
      name,
      day: today,
      ml: partnerWaterToday(partner, today) ?? 0,
      goalMl: partnerGoalToday(partner, today),
      layers: partnerLayersToday(partner, today),
      last: partnerLastDrinkToday(partner, today),
      steps: partnerStepsToday(partner, today),
      reps: reps.reps,
      topExercise: reps.topEx,
      trainedAt: reps.trainedAt,
      streak: duoStreak(streakDays, today),
      cheerAt: fromThem && nudge?.kind === 'water' && !nudge.emoji ? nudgeTime : 0,
      react: fromThem && nudge?.emoji ? { at: nudgeTime, emoji: nudge.emoji } : null,
      week: { meadow: meadow(week, today), wrap: wrapLine(weekWrap(week, streakDays, today), name, today) },
      weather: weatherOn ? weatherNow : null,
      calendar: { season: seasonFor(date, !!(weatherOn && weatherNow?.south)), occasion: occasionFor(date, bond), bond },
      me: {
        ml: myMl,
        steps: mySteps,
        reps: repsOnDay(sessions, today).reps,
        goalMl: myGoal,
        layers: drinkLayers(mine).map((l) => ({ k: l.kind, ml: l.ml })),
        lastAt: myLastAt,
      },
    });
  }, [couple.paired, couple.partner, couple.couple, couple.me?.uid, today, myMl, myGoal, drinks, sessions, mySteps, streakDays, week, weatherOn, weatherNow, ritualDay, ritualTicks]);
}

/**
 * The Partner's-week widget's payload, built exactly as Home publishes it —
 * so the studio's preview of that widget shows the real week. Null unpaired.
 */
export function usePartnerWeekSnapshot(): WidgetSnapshot | null {
  const couple = useCouple();
  const today = dayKey();
  const sessions = useProfileStore((s) => s.sessions);
  const myMl = useHydrationStore((s) => selectTodayMl(s, today));
  return useMemo(() => {
    const uid = couple.me?.uid;
    if (!couple.paired || !couple.partner || !uid) return null;
    const widget = partnerWidget(trackerHistory(couple.couple, uid, today, 7), sessions, today);
    return buildWidgetSnapshot(couple.partner.displayName ?? 'Your partner', widget, 0, {
      theirMl: partnerWaterToday(couple.partner, today),
      myMl,
    });
  }, [couple.paired, couple.partner, couple.couple, couple.me?.uid, sessions, today, myMl]);
}

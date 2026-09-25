/**
 * Keeps local notification schedules in sync with training + couple state.
 *
 * One place so Home, Settings, couple, and session finish all share the same
 * low-volume policy (see `syncLocalReminders` in lib/notifications.ts).
 */

import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { daysSinceLastSession } from '@/domain/dormantReminder';
import { dayKey } from '@/domain/progression';
import { reminderHourFor } from '@/domain/reminderSchedule';
import { partnerGoalToday, partnerHabitsToday, partnerRepsToday, partnerStepsToday, partnerWaterToday } from '@/domain/couple';
import { buildRitualReminder, cleanTicks, ritualFor, ritualScore, ritualWeek } from '@/domain/ritual';
import { repsOnDay } from '@/domain/waterWidget';
import { useDuoStreakStore } from '@/state/duoStreakStore';
import { useRitualStore } from '@/state/ritualStore';
import { DEFAULT_STEP_GOAL } from '@/domain/steps';
import { readStepsToday } from '@/services/pedometer';
import { syncHydrationReminders, syncLocalReminders, syncRitualReminder } from '@/lib/notifications';
import { selectTodayMl, useHydrationStore } from '@/state/hydrationStore';
import { useCouple } from '@/state/useCouple';
import { selectStreak, useProfileStore } from '@/state/profileStore';
import { useSettingsStore } from '@/state/settingsStore';

export function useNotificationSync(): void {
  const dailyReminder = useSettingsStore((s) => s.dailyReminder);
  const hydrationReminder = useSettingsStore((s) => s.hydrationReminder);
  const sessions = useProfileStore((s) => s.sessions);
  const couple = useCouple();

  /* Tie the on-phone couple history to this pairing: a new partner starts
     clean rather than inheriting the last one's week. Lives here because this
     hook is mounted once, app-wide, for the whole session. */
  const pairedId = couple.paired ? (couple.couple?.id ?? '') : '';
  useEffect(() => {
    if (!pairedId) return;
    useDuoStreakStore.getState().bind(pairedId);
    useRitualStore.getState().bind(pairedId);
  }, [pairedId]);

  const today = dayKey();
  const trainedToday = sessions.some((s) => s.day === today);
  /* The athlete's own streak, which the evening reminder names. Derived here
     rather than subscribed as a selector so it recomputes with `sessions`. */
  const streak = selectStreak({ sessions }, today);
  /* Days since the last recorded session, for the dormant slot. Max rather than
     last-element: `sessions` is not guaranteed sorted, and reading the wrong end
     of it would either fire a win-back push at an active athlete or never fire
     one at all. Null with no history — never-started is not dormant. */
  const lastDay = sessions.reduce((latest, s) => (s.day > latest ? s.day : latest), '') || null;
  const daysAway = daysSinceLastSession(lastDay, today);
  /* The hour the evening slots fire at, learned from the hours in `sessions`.
     Reduced to a number here so the effect below can depend on it: the schedule
     must follow a routine that moves, and nothing else in the dependency list
     changes when it does. */
  const reminderHour = reminderHourFor(sessions);

  /**
   * Bumped whenever the app returns to the foreground, to force a re-sync.
   *
   * `expo-notifications` bakes a notification's text in at *schedule* time, so
   * the weekly recap carries whatever `buildWeeklyRecap` returned on the last
   * sync — and that claim is a fact about training ("your best set has gone
   * from 8 to 14"), not a static string. Nothing below re-runs on its own while
   * the app sits closed, so a recap scheduled early in the week could fire on
   * Monday describing a week that had barely started. That is a stale progress
   * claim delivered as current, which is the fabrication `progressProof` exists
   * to refuse, arriving through the one channel nothing was checking.
   *
   * Re-syncing on foreground bounds the staleness to "since you last opened the
   * app" instead of "since you last trained". It cannot close the gap entirely
   * — nothing can, while the OS owns the pending notification — but an athlete
   * who never opens the app all week is not the one whose recap is wrong.
   *
   * Costs nothing when nothing changed: `syncLocalReminders` cancels and
   * rewrites the same identifiers, so a re-sync is idempotent.
   */
  const [foregroundTick, setForegroundTick] = useState(0);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setForegroundTick((n) => n + 1);
    });
    return () => sub.remove();
  }, []);

  /* `today` is read at render time, and `daysAway` is derived from it, so a day
     boundary only reaches the schedule when something re-renders this hook. Its
     other triggers are all user actions — training, a settings change, pairing
     — plus the foreground tick above, which covers the usual case of the app
     being backgrounded overnight.

     What none of them cover is the app left open and untouched across midnight:
     `AppState` stays 'active', nothing re-renders, and an athlete who crossed
     into day three stays scheduled as day two — the dormant slot never takes
     over from the daily one. Narrow, but it is exactly the lapsing athlete the
     dormant slot exists for.

     One timer, aligned to the next local midnight rather than polling. */
  useEffect(() => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 5, 0); // five seconds past, so `dayKey()` has rolled
    const ms = midnight.getTime() - now.getTime();
    const id = setTimeout(() => setForegroundTick((n) => n + 1), ms);
    return () => clearTimeout(id);
    /* Re-armed after each tick, so a session left open for days keeps rolling. */
  }, [foregroundTick]);

  /* Water reminders, synced separately from the training slots.
     
     Its own effect because its inputs are different and it must re-run on a
     trigger the other deliberately ignores: logging a drink. The training
     sync excludes `drinks`-like churn for good reason (see its dependency
     note below), but a hydration reminder that does not react to drinking is
     the one thing it cannot afford — it would keep telling an athlete who
     just hit their goal that they are behind.
     
     `todayMl` rather than the `drinks` array: the array is new on every write,
     while the millilitre total is the only part of it this schedule reads. */
  const hydrationGoalMl = useHydrationStore((s) => s.goalMl);
  const drinks = useHydrationStore((s) => s.drinks);
  const todayMl = selectTodayMl({ drinks }, today);

  useEffect(() => {
    void syncHydrationReminders({
      enabled: hydrationReminder,
      drinks: useHydrationStore.getState().drinks,
      goalMl: hydrationGoalMl,
      day: today,
    });
    /* `todayMl` stands in for `drinks`, which the body reads fresh from the
       store: the array identity changes on every write, the total does not.
       `foregroundTick` forces a re-sync on reopen, because the copy is baked
       in at schedule time like every other slot here. */
  }, [hydrationReminder, hydrationGoalMl, todayMl, today, foregroundTick]);

  /* Tonight's ritual reminder: one-shot, rebuilt on every tick, drink, step
     read and partner change, so what it names is what is actually left. Only
     for a pair — the ritual lives on their shared screen. */
  const ritualReminder = useSettingsStore((s) => s.ritualReminder);
  const ritualDay = useRitualStore((s) => s.day);
  const ritualTicks = useRitualStore((s) => s.ticks);
  const myReps = repsOnDay(sessions, today).reps;
  const partner = couple.paired ? couple.partner : null;
  const partnerName = partner?.displayName?.trim() || null;
  const partnerKey = partner
    ? JSON.stringify([
        partnerWaterToday(partner, today),
        partnerGoalToday(partner, today),
        partnerStepsToday(partner, today),
        partnerRepsToday(partner, today).reps,
        partnerHabitsToday(partner, today) ?? null,
      ])
    : null;

  useEffect(() => {
    /* Steps are read here, once per sync, rather than through `useStepsToday`:
       this hook mounts before anything else, and that hook's state update
       landed before mount ("can't perform a React state update…"). A read
       with no component state has nothing to update too early. */
    let alive = true;
    void readStepsToday(DEFAULT_STEP_GOAL)
      .catch(() => null)
      .then((read) => {
        if (!alive) return;
        const mySteps = read && read.status === 'ready' ? read.steps : null;
        const ticks = ritualDay === today ? ritualTicks : [];
        const mine = ritualFor({ ml: todayMl, goalMl: hydrationGoalMl, steps: mySteps, reps: myReps, ticks });
        let theirs: { name: string; score: number } | null = null;
        if (partnerKey && partnerName) {
          const [ml, goal, steps, reps, habits] = JSON.parse(partnerKey) as [number | null, number | null, number | null, number, unknown];
          theirs = {
            name: partnerName,
            score: ritualScore(ritualFor({ ml, goalMl: goal ?? hydrationGoalMl, steps, reps, ticks: cleanTicks(habits) })),
          };
        }
        void syncRitualReminder({
          enabled: ritualReminder && !!partnerKey,
          copy: buildRitualReminder({ mine, theirs }),
        });
      });
    return () => {
      alive = false;
    };
    // `partnerKey` stands in for the partner's day.
  }, [ritualReminder, ritualDay, ritualTicks, today, todayMl, hydrationGoalMl, myReps, partnerKey, partnerName, foregroundTick]);

  /* The ritual week for the Monday recap, reduced to a key so the effect
     re-runs when perfect days or the trend move, not on every history write. */
  const ritualHistory = useRitualStore((s) => s.history);
  const week = ritualWeek(ritualHistory, today);
  const togetherWeek = couple.paired && partnerName ? { name: partnerName, perfectDays: week.perfectDays, trend: week.trend } : null;
  const togetherKey = JSON.stringify(togetherWeek);

  useEffect(() => {
    void syncLocalReminders({
      dailyReminderEnabled: dailyReminder,
      trainedToday,
      coupleAtRisk: couple.paired && couple.atRisk,
      partnerName: couple.partner?.displayName ?? null,
      streak,
      sessions,
      daysSinceLastSession: daysAway,
      together: togetherWeek,
    });
    /* `sessions` itself is intentionally not a dependency: it is a new array on
       every profile write, which would re-sync the schedules on each finished
       rep. Instead every part of it this sync reads is listed as a primitive.

       `trainedToday` and `streak` used to be that whole list, and the comment
       here said so. They stopped being it when the schedule started reading a
       third thing out of `sessions` — the *hours* the athlete trains at. Those
       move independently of both: someone who shifts from an evening routine to
       a 07:00 one breaks no streak and flips `trainedToday` exactly as before,
       so neither primitive changes and the effect never re-runs. The learned
       hour would then follow a moved routine only by accident, whenever a streak
       break happened to re-fire this — defeating the `recentLimit` window in
       `learnTrainingHour` that exists precisely to follow such a move.

       `reminderHour` is that third reading, reduced to a number, so it belongs
       here on the same terms as the other two.

       `foregroundTick` is not read by the sync at all — it is here purely to
       re-run it when the app is reopened, so the weekly recap's baked-in copy
       is rebuilt from current history. See its declaration above. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dailyReminder,
    trainedToday,
    streak,
    reminderHour,
    daysAway,
    foregroundTick,
    togetherKey,
    couple.paired,
    couple.atRisk,
    couple.partner?.displayName,
  ]);
}

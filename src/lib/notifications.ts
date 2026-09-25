/**
 * Notifications — carefully paced local reminders + Expo push for social events.
 *
 * ## Cadence policy (avoid notification fatigue)
 *
 * | Kind                    | Frequency              | When it fires                          |
 * |-------------------------|------------------------|----------------------------------------|
 * | Workout reminder        | ≤1 / day               | Learned hour, only if not trained today|
 * | Couple streak reminder  | ≤1 / day               | Learned hour, only if streak at risk   |
 * | Dormant reminder        | ≤1 / day (replaces ↑)  | Learned hour, only after 3 days away   |
 * | Weekly summary          | 1 / week (Monday 18:00)| Always (low-frequency payoff)          |
 * | Challenge invitation    | Event-driven           | When a friend challenges you (push)    |
 * | Couple nudge            | Event-driven           | Partner taps Nudge (push + in-app)     |
 * | Rival passed you        | ≤1 / week              | Soft alert if a rival overtakes weekly |
 *
 * The workout reminder and the weekly summary say what is actually at stake —
 * the solo streak by number, and a real claim off `progressProof` — rather than
 * the generic lines they carried before. Copy lives in `domain/reminderCopy`.
 * That changed the wording of two existing slots and nothing about this table:
 * no new kind, no new frequency. Volume is the thing this policy protects.
 *
 * The dormant slot is the one addition, and it *replaces* the workout reminder
 * rather than joining it — an athlete three days gone was already getting the
 * evening nag daily, and the same words that failed on days one and two are not
 * improved by a third repetition. Net volume is unchanged: still at most one
 * evening reminder. Copy lives in `domain/dormantReminder`, which states what
 * the athlete has built rather than what they are losing, and stays silent
 * when `progressProof` has no honest claim to make.
 *
 * Workout and streak reminders never stack on the same day — streak-at-risk
 * wins (more urgent). Turning "Daily reminders" off cancels the workout slot;
 * streak-at-risk still schedules while paired (protecting the bond).
 *
 * ## Why "learned hour" rather than a fixed evening
 *
 * These slots all fired at 19:00/20:00 regardless of when the athlete trains,
 * so the 07:00 athlete was reminded twelve hours after the moment that would
 * have worked — a nag that cannot be acted on without rearranging the day.
 * `domain/reminderSchedule` reads the hours already recorded on every session
 * and returns the one they reliably train at, clamped to waking hours and
 * offset an hour early. It returns the old 19:00 whenever history has not
 * earned anything else, so this changes nothing for an athlete whose routine is
 * genuinely scattered. Again: same slots, same volume, same words.
 *
 * Two transports: local (`expo-notifications`) for schedules, Expo Push for
 * remote social events. Never throws — refused permission is a quiet no-op.
 */

import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { buildDormantReminder } from '@/domain/dormantReminder';
import {
  HYDRATION_SLOTS,
  buildHydrationReminder,
} from '@/domain/hydrationReminder';
import type { DrinkEntry } from '@/domain/hydration';
import { buildInviteNotification } from '@/domain/inviteNotification';
import { isDuplicateNudge } from '@/domain/nudgeDedupe';
import { reminderNotification, type ReminderKind } from '@/domain/partnerReminder';
import { parseInviteKind } from '@/domain/presence';
import { buildDailyReminder, buildWeeklyRecap } from '@/domain/reminderCopy';
import {
  DEFAULT_REMINDER_HOUR,
  LATEST_REMINDER_HOUR,
  reminderHourFor,
} from '@/domain/reminderSchedule';
import { storage } from '@/lib/storage';
import type { SessionSummary } from '@/state/profileStore';
import { syncMyCouplePushToken } from '@/services/coupleService';
import { saveExpoPushToken } from '@/services/userService';

/** Habit / streak reminders — quieter. */
const CHANNEL_REMINDERS = 'reminders';
/** Challenge invites, nudges, rival alerts — higher priority. */
const CHANNEL_SOCIAL = 'social';

/**
 * Accept / Decline straight from the shade.
 *
 * An invite is a yes-or-no question, and making someone unlock, wait for a
 * cold start and find the button to answer it is why invites go stale. Accept
 * opens the duel as guest — the same route a tap already takes; Decline is
 * marked destructive so iOS renders it red, and carries no foreground flag so
 * it resolves without opening the app.
 */
const CHALLENGE_CATEGORY = 'challenge-invite';
export const CHALLENGE_ACTION_ACCEPT = 'challenge-accept';
export const CHALLENGE_ACTION_DECLINE = 'challenge-decline';

let challengeCategoryReady: Promise<void> | null = null;

/** Registered lazily and only once — re-registering on every invite is wasted work. */
function ensureChallengeCategory(): Promise<void> {
  challengeCategoryReady ??= Notifications.setNotificationCategoryAsync(CHALLENGE_CATEGORY, [
    {
      identifier: CHALLENGE_ACTION_ACCEPT,
      buttonTitle: 'Accept',
      options: { opensAppToForeground: true },
    },
    {
      identifier: CHALLENGE_ACTION_DECLINE,
      buttonTitle: 'Decline',
      options: { opensAppToForeground: false, isDestructive: true },
    },
  ])
    .then(() => {})
    .catch(() => {
      // Older OS or unsupported surface — the banner still works without buttons.
      challengeCategoryReady = null;
    });
  return challengeCategoryReady;
}

/** Legacy ids cancelled on every sync so older installs stop multi-nagging. */
const LEGACY_IDS = [
  'couple-streak-reminder',
  'couple-streak-reminder-am',
  'couple-streak-reminder-noon',
  'couple-streak-reminder-pm',
  'daily-train-am',
  'daily-train-noon',
  'daily-train-pm',
] as const;

const WORKOUT_REMINDER_ID = 'workout-reminder-daily';
const STREAK_REMINDER_ID = 'couple-streak-reminder-eve';
const DORMANT_REMINDER_ID = 'dormant-reminder-eve';
const WEEKLY_RECAP_ID = 'weekly-recap';
/* One id per hydration slot, so each can be cancelled independently the
   moment its own condition stops holding. */
const HYDRATION_REMINDER_IDS = HYDRATION_SLOTS.map((h) => `hydration-reminder-${h}`);
const RIVAL_PASSED_ID = 'rival-passed-weekly';

const RIVAL_PASSED_KEY = 'repchamp.notif.rivalPassedWeek';

/**
 * Fallback hour for the couple streak-at-risk slot.
 *
 * An hour later than the solo default, which is how this slot has always been
 * scheduled: it is the last call of the day for a streak that dies at midnight,
 * so it sits behind the reminder that merely suggests training. Used when
 * `reminderHourFor` has learned nothing; a learned hour shifts this slot too.
 *
 * The one-hour gap cannot always be honoured. A late-night athlete — a 22:00 or
 * 23:00 routine — learns the hour 21, which is `LATEST_REMINDER_HOUR`, and
 * there is no 22 to shift to: the waking-window ceiling exists precisely so the
 * app is never the reason a phone lights up late. The gap yields to it rather
 * than the other way round, so at the ceiling both slots would name 21:00.
 *
 * That costs nothing in practice, because the two never coexist —
 * `syncLocalReminders` cancels the workout slot before arming this one and
 * returns — but the arithmetic is written to say so explicitly rather than
 * leave a reader to derive it. See `streakReminderHour`.
 */
const STREAK_REMINDER_HOUR = 20;

/**
 * The hour the couple streak-at-risk slot fires at, given the learned hour.
 *
 * Named rather than inlined because the rule has an exception worth stating:
 * the slot trails the daily one by the same gap it has always had, *except* at
 * `LATEST_REMINDER_HOUR`, where there is nowhere later to go and it lands on
 * the ceiling instead. The ceiling wins because it is the promise that the app
 * never wakes anyone; the gap is only a preference about ordering.
 */
export function streakReminderHour(reminderHour: number): number {
  if (reminderHour === DEFAULT_REMINDER_HOUR) return STREAK_REMINDER_HOUR;
  const gap = STREAK_REMINDER_HOUR - DEFAULT_REMINDER_HOUR;
  return Math.min(reminderHour + gap, LATEST_REMINDER_HOUR);
}

/**
 * When the weekly recap fires — Monday 18:00.
 *
 * `expo-notifications` numbers weekdays 1–7 with **1 = Sunday**, so the old
 * `weekday: 1` genuinely was Sunday, exactly as the cadence table claimed. That
 * was the bug: this app's week is Monday–Sunday everywhere else (`isoWeekKey`,
 * `currentWeekDayKeys`, `selectWeekSessions`, `daysLeftInWeek` returning 1 on
 * Sunday). A summary titled "Your week in reps" sent Sunday at 18:00 reports on
 * a week with six hours still to run, and any set trained Sunday evening lands
 * in the very week the recap just finished summarising.
 *
 * Monday (`2`) is the first moment the week being described is actually over.
 * It also reads better: a recap on Monday evening is a week closed and the next
 * one already begun, rather than a verdict delivered before the final whistle.
 *
 * ## Why this slot keeps a fixed hour when every other slot learned one
 *
 * `reminderHourFor` moves the daily, dormant and streak slots to the hour the
 * athlete trains, because each of those asks them to *train today* and a
 * prompt that lands after the moment has passed cannot be acted on. `LEAD_HOURS`
 * exists for exactly that: arrive an hour early, while the choice is still open.
 *
 * The recap asks for nothing. It is a report on a finished week, and there is no
 * moment it must beat. Applying the training hour would put a 07:00 athlete's
 * weekly summary at 06:00 on a Monday — worse than 18:00, for no benefit anyone
 * can name. So this is a decision rather than an oversight: the recap is the one
 * slot where the learned hour is the wrong input, and it stays where it is.
 */
const WEEKLY_RECAP_WEEKDAY = 2;
const WEEKLY_RECAP_HOUR = 18;

let configured = false;
let suppressCoupleNudgeInForeground = false;
/** Wall-clock of the last in-app `presentNudge` — used to dedupe FCM only briefly. */
let lastInAppNudgeAt = 0;

function easProjectId(): string | undefined {
  const id =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  if (!id || /^0+(-0+)*$/.test(String(id).replace(/-/g, '0'))) return undefined;
  return String(id);
}

function channelIdFor(kind: 'reminders' | 'social'): string {
  return kind === 'social' ? CHANNEL_SOCIAL : CHANNEL_REMINDERS;
}

export function registerForPushNudges(uid: string): () => void {
  const projectId = easProjectId();
  if (!projectId) return () => {};

  let cancelled = false;

  void (async () => {
    try {
      /*
       * Register only if permission already exists — never ask for it here.
       *
       * This runs from the root layout on every launch, so asking meant the
       * OS prompt fired over the welcome screen before the athlete had seen
       * anything the app does. A cold prompt is the one you get declined, and
       * on iOS a decline is close to permanent: `canAskAgain` goes false and
       * the only route back is Settings.
       *
       * The ask now lives on the Reminders step in onboarding, after a plan
       * the athlete chose. If they allow it there, this picks the token up on
       * the next launch; if they decline, nothing here nags them again.
       */
      const existing = await Notifications.getPermissionsAsync();
      if (!existing.granted || cancelled) return;

      const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
      if (token && !cancelled) {
        await saveExpoPushToken(uid, token);
        await syncMyCouplePushToken(uid, token);
      }
    } catch {
      // No Play Services / APNs — remote pushes just won't arrive.
    }
  })();

  return () => {
    cancelled = true;
  };
}

export function installForegroundNudgeSuppressor(): () => void {
  suppressCoupleNudgeInForeground = true;
  return () => {
    suppressCoupleNudgeInForeground = false;
  };
}

function configureHandler(): void {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content.data;
      const type = data?.type;
      /* The partner-water widget push is data for the home-screen widget,
         never a banner. The native messaging service normally keeps it from
         reaching here at all; this is the backstop. */
      if (type === 'partner-water') {
        return { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };
      }
      // Only suppress the remote twin when we *just* showed the Firestore
      // in-app nudge — and never the in-app one itself (see `isDuplicateNudge`).
      // Blanket foreground suppress dropped pushes when Firestore was
      // slow/offline and the partner got neither banner nor presentNudge.
      const isForegroundDuplicate = isDuplicateNudge({
        type,
        local: data?.local,
        suppressing: suppressCoupleNudgeInForeground,
        msSinceInApp: Date.now() - lastInAppNudgeAt,
      });
      return {
        shouldShowBanner: !isForegroundDuplicate,
        shouldShowList: !isForegroundDuplicate,
        shouldPlaySound: type === 'challenge' || type === 'couple-nudge',
        shouldSetBadge: false,
      };
    },
  });
}

export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    configureHandler();

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_REMINDERS, {
        name: 'Training reminders',
        importance: Notifications.AndroidImportance.DEFAULT,
        description: 'At most one gentle reminder per day',
      });
      await Notifications.setNotificationChannelAsync(CHANNEL_SOCIAL, {
        name: 'Challenges & friends',
        importance: Notifications.AndroidImportance.HIGH,
        description: 'Duel invites, partner nudges, and rival alerts',
      });
      // Keep legacy channel so old pushes still deliver.
      await Notifications.setNotificationChannelAsync('couple', {
        name: 'Couple',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) return true;
    if (!existing.canAskAgain) return false;

    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch {
    return false;
  }
}

async function cancelIds(ids: readonly string[]): Promise<void> {
  await Promise.all(
    ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})),
  );
}

export interface ReminderContext {
  /** Settings → Daily reminders. */
  dailyReminderEnabled: boolean;
  /** True once this athlete logged a session today. */
  trainedToday: boolean;
  /** Couple shared streak dies tonight unless both train. */
  coupleAtRisk: boolean;
  partnerName?: string | null;
  /**
   * The athlete's own solo streak, so the evening reminder can say what is
   * actually at stake. `coupleAtRisk` only ever covered paired athletes, which
   * left a solo athlete on a long streak getting the same generic nag as
   * someone on day zero.
   */
  streak?: number;
  /**
   * Session history, for the weekly recap's headline. Read only to build copy
   * — the recap claims nothing `progressProof` will not stand behind.
   */
  sessions?: readonly SessionSummary[];
  /**
   * Whole days since the last recorded session, or null with no history.
   * Past `DORMANT_AFTER_DAYS` the dormant slot replaces the evening nag.
   */
  daysSinceLastSession?: number | null;
}

/**
 * Single entry point for local schedules. Call on launch, after a session, and
 * when couple risk / settings change. Idempotent via fixed identifiers.
 */
export async function syncLocalReminders(ctx: ReminderContext): Promise<void> {
  if (!(await ensureNotificationPermission())) return;

  try {
    await cancelIds(LEGACY_IDS);

    /* When the evening slot fires, learned from the hours this athlete actually
       trains at. Computed once and threaded into every slot below so the three
       of them cannot drift apart. `reminderHourFor` returns the hour the app
       has always used whenever history has not earned anything else, so an
       athlete with no clear routine sees exactly the schedule they saw before. */
    const reminderHour = reminderHourFor(ctx.sessions ?? []);

    /* Weekly summary — always one quiet ping (not gated by daily toggle).
       Monday rather than Sunday, and deliberately NOT the learned hour: see
       `scheduleWeeklyRecap`. Re-scheduled on every sync so the claim it carries
       is as fresh as the last time the app was open. */
    await scheduleWeeklyRecap(WEEKLY_RECAP_WEEKDAY, WEEKLY_RECAP_HOUR, {
      sessions: ctx.sessions ?? [],
      streak: ctx.streak ?? 0,
    });

    if (ctx.trainedToday) {
      // Back in the app — a win-back push aimed at someone training today is
      // both wrong and the fastest way to teach them the slot means nothing.
      await cancelIds([WORKOUT_REMINDER_ID, STREAK_REMINDER_ID, DORMANT_REMINDER_ID]);
      return;
    }

    if (ctx.coupleAtRisk) {
      // Streak protection beats a generic workout nag — never both.
      await cancelIds([WORKOUT_REMINDER_ID, DORMANT_REMINDER_ID]);
      await scheduleStreakReminder(
        ctx.partnerName ?? 'your partner',
        streakReminderHour(reminderHour),
      );
      return;
    }

    await cancelIds([STREAK_REMINDER_ID]);

    if (!ctx.dailyReminderEnabled) {
      // The toggle is off: it governs the evening slot whichever copy fills it.
      await cancelIds([WORKOUT_REMINDER_ID, DORMANT_REMINDER_ID]);
      return;
    }

    /* Dormant replaces the evening nag rather than joining it. Three days in,
       the athlete has already had this slot twice in the words that did not
       work; a third identical nag is the one that gets notifications disabled.
       Scheduling is all-or-nothing — when `buildDormantReminder` declines
       (no history, or no honest claim), fall through to the daily line. */
    if (await scheduleDormantReminder(ctx, reminderHour)) {
      await cancelIds([WORKOUT_REMINDER_ID]);
      return;
    }

    await cancelIds([DORMANT_REMINDER_ID]);
    await scheduleDailyTrainingReminder(
      ctx.streak ?? 0,
      reminderHour,
      ctx.daysSinceLastSession ?? null,
    );
  } catch {
    // Best-effort.
  }
}

/** @deprecated Prefer syncLocalReminders — kept for couple-invite call sites. */
export async function scheduleStreakReminder(
  partnerName: string,
  hour = STREAK_REMINDER_HOUR,
): Promise<void> {
  if (!(await ensureNotificationPermission())) return;
  try {
    await cancelIds([STREAK_REMINDER_ID, ...LEGACY_IDS.filter((id) => id.includes('streak'))]);
    await Notifications.scheduleNotificationAsync({
      identifier: STREAK_REMINDER_ID,
      content: {
        title: 'Shared streak needs you',
        body: `You and ${partnerName} both need a set today to keep it alive.`,
        data: { type: 'streak-reminder' },
      },
      trigger: {
        ...(Platform.OS === 'android' ? { channelId: channelIdFor('reminders') } : {}),
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute: 0,
      },
    });
  } catch {
    // Best-effort.
  }
}

/**
 * @deprecated Prefer syncLocalReminders.
 *
 * `streak` is optional because the deprecated call sites do not have one —
 * without it the copy is exactly what it always was, so an older caller
 * schedules the same reminder it used to.
 */
export async function scheduleDailyTrainingReminder(
  streak = 0,
  hour = DEFAULT_REMINDER_HOUR,
  daysAway: number | null = null,
): Promise<void> {
  if (!(await ensureNotificationPermission())) return;
  try {
    await cancelIds([WORKOUT_REMINDER_ID, ...LEGACY_IDS.filter((id) => id.startsWith('daily-'))]);
    /* `daysAway` distinguishes an ordinary evening from the last night of a
       streak that has already spent its rest day. Optional and defaulted to
       null, so the deprecated call sites below send exactly what they did. */
    const copy = buildDailyReminder({ streak, daysAway });
    await Notifications.scheduleNotificationAsync({
      identifier: WORKOUT_REMINDER_ID,
      content: {
        title: copy.title,
        body: copy.body,
        data: { type: 'workout-reminder' },
      },
      trigger: {
        ...(Platform.OS === 'android' ? { channelId: channelIdFor('reminders') } : {}),
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute: 0,
      },
    });
  } catch {
    // Best-effort.
  }
}

/**
 * The three-days-away slot.
 *
 * Returns whether anything was scheduled, so the caller knows if the evening
 * slot is filled — `buildDormantReminder` returns null both for an athlete who
 * is not dormant and for one with no honest claim on record, and in the second
 * case the generic daily line is still the right thing to send.
 *
 * Same evening hour as the workout reminder it replaces: this is a different
 * sentence in the existing slot, not an extra ping.
 */
async function scheduleDormantReminder(ctx: ReminderContext, hour: number): Promise<boolean> {
  const copy = buildDormantReminder({
    daysAway: ctx.daysSinceLastSession ?? null,
    sessions: ctx.sessions ?? [],
    streak: ctx.streak ?? 0,
  });
  if (!copy) return false;

  try {
    await Notifications.cancelScheduledNotificationAsync(DORMANT_REMINDER_ID).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: DORMANT_REMINDER_ID,
      content: {
        title: copy.title,
        body: copy.body,
        data: { type: 'dormant-reminder' },
      },
      trigger: {
        ...(Platform.OS === 'android' ? { channelId: channelIdFor('reminders') } : {}),
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute: 0,
      },
    });
    return true;
  } catch {
    // Best-effort — report failure so the daily line still gets its chance.
    return false;
  }
}

export async function cancelDailyTrainingReminder(): Promise<void> {
  try {
    await cancelIds([WORKOUT_REMINDER_ID, ...LEGACY_IDS.filter((id) => id.startsWith('daily-'))]);
  } catch {
    // Nothing scheduled.
  }
}

/**
 * The Monday recap.
 *
 * `proof` carries the athlete's history so the banner can state a fact rather
 * than invite them to go and look. Optional for the same reason as
 * `scheduleDailyTrainingReminder`'s streak: absent it, the copy is the generic
 * line this always sent.
 *
 * The defaults are the named constants rather than bare numbers: they used to
 * be `weekday = 1, hour = 18`, and `1` is Sunday, which is the bug
 * `WEEKLY_RECAP_WEEKDAY` documents. A default spelled as a literal is how that
 * would come back — a caller omitting the argument would quietly reinstate it.
 *
 * Note the copy is built HERE, at schedule time, and handed to the OS as a
 * fixed string: `expo-notifications` has no way to compute content at delivery.
 * So the freshness of the claim is exactly the freshness of the last sync,
 * which is why `useNotificationSync` re-syncs when the app is foregrounded.
 */
/**
 * The hydration slots — two at most, and only when there is something true to
 * say at that hour.
 *
 * Its own slots rather than the evening one, because a reminder to drink at
 * 19:00 arrives when the day is over and the only honest line left is that
 * the goal was missed. Each slot is cancelled rather than filled when
 * `buildHydrationReminder` declines, so an athlete on pace hears nothing at
 * all — the same all-or-nothing rule the dormant slot follows.
 *
 * Note this schedules against *today's* state on a DAILY trigger. A slot set
 * while behind will fire again tomorrow with the same words, which is why
 * every caller of `syncLocalReminders` re-runs this: the next sync corrects
 * the copy, and logging a drink re-syncs immediately.
 */
export async function syncHydrationReminders(ctx: {
  enabled: boolean;
  drinks: readonly DrinkEntry[];
  goalMl: number;
  day: string;
}): Promise<void> {
  if (!ctx.enabled) {
    await cancelIds(HYDRATION_REMINDER_IDS);
    return;
  }
  if (!(await ensureNotificationPermission())) return;

  for (const [index, hour] of HYDRATION_SLOTS.entries()) {
    const id = HYDRATION_REMINDER_IDS[index]!;
    const copy = buildHydrationReminder({
      drinks: ctx.drinks,
      goalMl: ctx.goalMl,
      day: ctx.day,
      hour,
    });

    if (!copy) {
      await cancelIds([id]);
      continue;
    }

    try {
      await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
      await Notifications.scheduleNotificationAsync({
        identifier: id,
        content: {
          title: copy.title,
          body: copy.body,
          data: { type: 'hydration-reminder' },
        },
        trigger: {
          ...(Platform.OS === 'android' ? { channelId: channelIdFor('reminders') } : {}),
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour,
          minute: 0,
        },
      });
    } catch {
      // Best-effort, like every other slot here.
    }
  }
}

/** Drop both hydration slots — used when the toggle goes off. */
export async function cancelHydrationReminders(): Promise<void> {
  try {
    await cancelIds(HYDRATION_REMINDER_IDS);
  } catch {
    // Best-effort.
  }
}

export async function scheduleWeeklyRecap(
  weekday = WEEKLY_RECAP_WEEKDAY,
  hour = WEEKLY_RECAP_HOUR,
  proof?: { sessions: readonly SessionSummary[]; streak: number },
): Promise<void> {
  if (!(await ensureNotificationPermission())) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(WEEKLY_RECAP_ID).catch(() => {});
    const copy = buildWeeklyRecap({
      sessions: proof?.sessions ?? [],
      streak: proof?.streak ?? 0,
    });
    await Notifications.scheduleNotificationAsync({
      identifier: WEEKLY_RECAP_ID,
      content: {
        title: copy.title,
        body: copy.body,
        data: { type: 'weekly-recap' },
      },
      trigger: {
        ...(Platform.OS === 'android' ? { channelId: channelIdFor('reminders') } : {}),
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday,
        hour,
        minute: 0,
      },
    });
  } catch {
    // Best-effort.
  }
}

export async function cancelStreakReminder(): Promise<void> {
  try {
    await cancelIds([
      STREAK_REMINDER_ID,
      ...LEGACY_IDS.filter((id) => id.includes('streak')),
    ]);
  } catch {
    // Nothing scheduled.
  }
}

export async function presentNudge(
  fromName: string,
  kind: ReminderKind = 'train',
  ml?: number | null,
  detail: { drink?: string | null; milestone?: 'half' | 'goal' | null; emoji?: string | null } = {},
): Promise<void> {
  if (!(await ensureNotificationPermission())) return;
  try {
    lastInAppNudgeAt = Date.now();
    const name = fromName.trim() || 'Your partner';
    await Notifications.scheduleNotificationAsync({
      content: {
        // A reaction from the widget reads as itself, not as its carrier kind.
        ...(detail.emoji
          ? { title: `${name} sent you ${detail.emoji}`, body: 'Tap to send one back.' }
          : reminderNotification(kind, fromName, ml, detail)),
        // `local` marks this as the in-app copy, which is never the duplicate.
        data: { type: 'couple-nudge', kind, local: true },
      },
      trigger: Platform.OS === 'android' ? { channelId: channelIdFor('social') } : null,
    });
  } catch {
    // Best-effort — clear the dedupe stamp so a real FCM push can still show.
    lastInAppNudgeAt = 0;
  }
}

/**
 * Local banner when a challenge invite lands while the app can present it.
 * Deduped by duel id so polling does not spam.
 */
export async function presentChallengeInvite(input: {
  duelId: string;
  fromName: string;
  kind?: string;
  /** Movement id off the duel doc, when known. */
  exercise?: string | null;
  /** Set length in seconds, when known. */
  duration?: number | null;
  hostLevel?: number | null;
  myLevel?: number | null;
}): Promise<void> {
  if (!(await ensureNotificationPermission())) return;
  const id = `challenge-${input.duelId}`;
  try {
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    await ensureChallengeCategory();
    const copy = buildInviteNotification({
      fromName: input.fromName,
      exercise: input.exercise,
      duration: input.duration,
      kind: parseInviteKind(input.kind),
      hostLevel: input.hostLevel,
      myLevel: input.myLevel,
    });
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: {
        title: copy.title,
        body: copy.body,
        data: { type: 'challenge', duelId: input.duelId },
        categoryIdentifier: CHALLENGE_CATEGORY,
      },
      trigger: Platform.OS === 'android' ? { channelId: channelIdFor('social') } : null,
    });
  } catch {
    // Best-effort.
  }
}

/**
 * Soft "a rival passed you" — at most once per ISO week.
 * Call when weekly XP comparison finds an overtake; no-ops if already notified.
 */
export async function presentRivalPassed(input: {
  rivalName: string;
  weekKey: string;
}): Promise<void> {
  if (!(await ensureNotificationPermission())) return;
  try {
    const prev = storage.getString(RIVAL_PASSED_KEY);
    if (prev === input.weekKey) return;
    await Notifications.cancelScheduledNotificationAsync(RIVAL_PASSED_ID).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: RIVAL_PASSED_ID,
      content: {
        title: 'Rival alert',
        body: `${input.rivalName} just passed your weekly score. Rematch?`,
        data: { type: 'rival-passed' },
      },
      trigger: Platform.OS === 'android' ? { channelId: channelIdFor('social') } : null,
    });
    // Latch only after a successful present — a failed schedule must not burn the week.
    storage.set(RIVAL_PASSED_KEY, input.weekKey);
  } catch {
    // Best-effort.
  }
}

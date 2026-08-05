/**
 * Notifications — carefully paced local reminders + Expo push for social events.
 *
 * ## Cadence policy (avoid notification fatigue)
 *
 * | Kind                    | Frequency              | When it fires                          |
 * |-------------------------|------------------------|----------------------------------------|
 * | Workout reminder        | ≤1 / day               | Evening, only if not trained today     |
 * | Couple streak reminder  | ≤1 / day               | Evening, only if shared streak at risk |
 * | Weekly summary          | 1 / week (Sunday 18:00)| Always (low-frequency payoff)          |
 * | Challenge invitation    | Event-driven           | When a friend challenges you (push)    |
 * | Couple nudge            | Event-driven           | Partner taps Nudge (push + in-app)     |
 * | Rival passed you        | ≤1 / week              | Soft alert if a rival overtakes weekly |
 *
 * Workout and streak reminders never stack on the same day — streak-at-risk
 * wins (more urgent). Turning "Daily reminders" off cancels the workout slot;
 * streak-at-risk still schedules while paired (protecting the bond).
 *
 * Two transports: local (`expo-notifications`) for schedules, Expo Push for
 * remote social events. Never throws — refused permission is a quiet no-op.
 */

import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { storage } from '@/lib/storage';
import { syncMyCouplePushToken } from '@/services/coupleService';
import { saveExpoPushToken } from '@/services/userService';

/** Habit / streak reminders — quieter. */
const CHANNEL_REMINDERS = 'reminders';
/** Challenge invites, nudges, rival alerts — higher priority. */
const CHANNEL_SOCIAL = 'social';

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
const WEEKLY_RECAP_ID = 'weekly-recap';
const RIVAL_PASSED_ID = 'rival-passed-weekly';

const RIVAL_PASSED_KEY = 'repchamp.notif.rivalPassedWeek';

let configured = false;
let suppressCoupleNudgeInForeground = false;
/** Wall-clock of the last in-app `presentNudge` — used to dedupe FCM only briefly. */
let lastInAppNudgeAt = 0;
const IN_APP_NUDGE_DEDUPE_MS = 8_000;

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
      const type = notification.request.content.data?.type;
      // Only suppress the FCM twin when we *just* showed the Firestore in-app
      // nudge. Blanket foreground suppress dropped pushes when Firestore was
      // slow/offline and the partner got neither banner nor presentNudge.
      const isForegroundDuplicate =
        type === 'couple-nudge' &&
        suppressCoupleNudgeInForeground &&
        Date.now() - lastInAppNudgeAt < IN_APP_NUDGE_DEDUPE_MS;
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
}

/**
 * Single entry point for local schedules. Call on launch, after a session, and
 * when couple risk / settings change. Idempotent via fixed identifiers.
 */
export async function syncLocalReminders(ctx: ReminderContext): Promise<void> {
  if (!(await ensureNotificationPermission())) return;

  try {
    await cancelIds(LEGACY_IDS);

    // Weekly summary — always one quiet ping (not gated by daily toggle).
    await scheduleWeeklyRecap();

    if (ctx.trainedToday) {
      await cancelIds([WORKOUT_REMINDER_ID, STREAK_REMINDER_ID]);
      return;
    }

    if (ctx.coupleAtRisk) {
      // Streak protection beats a generic workout nag — never both.
      await cancelIds([WORKOUT_REMINDER_ID]);
      await scheduleStreakReminder(ctx.partnerName ?? 'your partner');
      return;
    }

    await cancelIds([STREAK_REMINDER_ID]);

    if (ctx.dailyReminderEnabled) {
      await scheduleDailyTrainingReminder();
    } else {
      await cancelIds([WORKOUT_REMINDER_ID]);
    }
  } catch {
    // Best-effort.
  }
}

/** @deprecated Prefer syncLocalReminders — kept for couple-invite call sites. */
export async function scheduleStreakReminder(partnerName: string): Promise<void> {
  if (!(await ensureNotificationPermission())) return;
  try {
    await cancelIds([STREAK_REMINDER_ID, ...LEGACY_IDS.filter((id) => id.includes('streak'))]);
    await Notifications.scheduleNotificationAsync({
      identifier: STREAK_REMINDER_ID,
      content: {
        title: 'Shared streak needs you',
        body: `You and ${partnerName} both need a set today to keep it alive.`,
        data: { type: 'streak-reminder' },
        ...(Platform.OS === 'android' ? { channelId: channelIdFor('reminders') } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 20,
        minute: 0,
      },
    });
  } catch {
    // Best-effort.
  }
}

/** @deprecated Prefer syncLocalReminders. */
export async function scheduleDailyTrainingReminder(): Promise<void> {
  if (!(await ensureNotificationPermission())) return;
  try {
    await cancelIds([WORKOUT_REMINDER_ID, ...LEGACY_IDS.filter((id) => id.startsWith('daily-'))]);
    await Notifications.scheduleNotificationAsync({
      identifier: WORKOUT_REMINDER_ID,
      content: {
        title: 'Time for a quick set',
        body: 'Two minutes of reps keeps your streak and form sharp.',
        data: { type: 'workout-reminder' },
        ...(Platform.OS === 'android' ? { channelId: channelIdFor('reminders') } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 19,
        minute: 0,
      },
    });
  } catch {
    // Best-effort.
  }
}

export async function cancelDailyTrainingReminder(): Promise<void> {
  try {
    await cancelIds([WORKOUT_REMINDER_ID, ...LEGACY_IDS.filter((id) => id.startsWith('daily-'))]);
  } catch {
    // Nothing scheduled.
  }
}

export async function scheduleWeeklyRecap(weekday = 1, hour = 18): Promise<void> {
  if (!(await ensureNotificationPermission())) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(WEEKLY_RECAP_ID).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: WEEKLY_RECAP_ID,
      content: {
        title: 'Your week in reps',
        body: 'See what you got done — and celebrate the wins.',
        data: { type: 'weekly-recap' },
        ...(Platform.OS === 'android' ? { channelId: channelIdFor('reminders') } : {}),
      },
      trigger: {
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

export async function presentNudge(fromName: string): Promise<void> {
  if (!(await ensureNotificationPermission())) return;
  try {
    lastInAppNudgeAt = Date.now();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${fromName} is training`,
        body: 'Jump in and keep your streak alive.',
        data: { type: 'couple-nudge' },
        ...(Platform.OS === 'android' ? { channelId: channelIdFor('social') } : {}),
      },
      trigger: null,
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
}): Promise<void> {
  if (!(await ensureNotificationPermission())) return;
  const id = `challenge-${input.duelId}`;
  try {
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    const verb =
      input.kind === 'train'
        ? 'wants to train together'
        : input.kind === 'compete'
          ? 'challenged you this week'
          : 'challenged you to a duel';
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: {
        title: 'Challenge invite',
        body: `${input.fromName} ${verb}.`,
        data: { type: 'challenge', duelId: input.duelId },
        ...(Platform.OS === 'android' ? { channelId: channelIdFor('social') } : {}),
      },
      trigger: null,
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
        ...(Platform.OS === 'android' ? { channelId: channelIdFor('social') } : {}),
      },
      trigger: null,
    });
    // Latch only after a successful present — a failed schedule must not burn the week.
    storage.set(RIVAL_PASSED_KEY, input.weekKey);
  } catch {
    // Best-effort.
  }
}

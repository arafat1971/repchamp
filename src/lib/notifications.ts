/**
 * Notifications — the couple-streak reminder, partner nudges, and Expo push
 * token registration.
 *
 * Two transports, by design:
 *  - **Local** (`expo-notifications`): the daily streak reminder this device
 *    schedules for its own owner, and the in-app nudge shown when the partner is
 *    already looking at the app. These work with no server.
 *  - **Remote (Expo Push)**: `registerForPushNudges` stores this device's *Expo*
 *    push token on the user profile. When a partner nudges, the *sender's* app
 *    POSTs to Expo's push service (`coupleService.nudgePartner`), which delivers
 *    to that token even when the recipient's app is closed. This deliberately
 *    uses Expo Push rather than a Cloud Function so it needs no Blaze plan — the
 *    only server is Expo's, which is free. (Expo still routes Android delivery
 *    through FCM under the hood, so an FCM key must be uploaded to the Expo
 *    project once — see FIREBASE_SETUP.md.)
 *
 * Nothing here throws on a device that refuses permission or lacks a project id —
 * every entry point resolves to a no-op so a declined prompt or an unconfigured
 * build can never break a session.
 */

import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { saveExpoPushToken } from '@/services/userService';

/** Android 8+ (minSdk 26 here) refuses notifications without a channel. */
const CHANNEL_ID = 'couple';

/** Identifier for the daily streak reminder, so re-scheduling replaces it. */
const STREAK_REMINDER_ID = 'couple-streak-reminder';

let configured = false;

/** The EAS project id an Expo push token is scoped to, or undefined if unset. */
function easProjectId(): string | undefined {
  const id =
    Constants.expoConfig?.extra?.eas?.projectId ??
    // Older manifest shape, kept as a fallback.
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  // The template ships an all-zeros placeholder; treat it as "not configured".
  if (!id || /^0+(-0+)*$/.test(String(id).replace(/-/g, '0'))) return undefined;
  return String(id);
}

/**
 * Register this device to receive push nudges: request permission, read the Expo
 * push token, and store it on `users/{uid}` so a partner's app can target it.
 *
 * Returns an unsubscribe, or a no-op when there is no EAS project id (Expo push
 * tokens are project-scoped, so `getExpoPushTokenAsync` needs one) or permission
 * is denied. Never throws — a device that says no simply won't receive remote
 * nudges; the local reminder and in-app nudge still work.
 */
export function registerForPushNudges(uid: string): () => void {
  const projectId = easProjectId();
  if (!projectId) return () => {};

  let cancelled = false;

  void (async () => {
    try {
      const granted = await ensureNotificationPermission();
      if (!granted || cancelled) return;

      const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
      if (token && !cancelled) await saveExpoPushToken(uid, token);
    } catch {
      // No Play Services / APNs, or a refused prompt — remote nudges just won't
      // arrive.
    }
  })();

  return () => {
    cancelled = true;
  };
}

/**
 * While the app is foregrounded, swallow the *remote* couple-nudge push.
 *
 * The nudge is already shown in-app through the Firestore subscription
 * (`useCouple`), so letting the incoming Expo push also surface would double it.
 * The notification handler below decides per-notification whether to show it;
 * this flag flips off display for couple nudges specifically while the app is
 * open. Background/closed delivery is untouched — the OS renders the push
 * directly and this code never runs.
 *
 * Returns a no-op unsubscribe (kept for call-site symmetry with the FCM version
 * it replaced).
 */
export function installForegroundNudgeSuppressor(): () => void {
  suppressCoupleNudgeInForeground = true;
  return () => {
    suppressCoupleNudgeInForeground = false;
  };
}

/** True while the app is foregrounded and the in-app nudge owns presentation. */
let suppressCoupleNudgeInForeground = false;

/**
 * Decide how a notification presents while the app is foregrounded.
 *
 * Most notifications show. The exception is a *couple nudge* arriving over the
 * push service while the app is open: the in-app nudge (`useCouple`) already
 * showed it, so this drops the duplicate. Nudges are tagged `type:
 * 'couple-nudge'` in their `data` by the sender.
 */
function configureHandler(): void {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const type = notification.request.content.data?.type;
      const isForegroundDuplicate =
        type === 'couple-nudge' && suppressCoupleNudgeInForeground;
      return {
        shouldShowBanner: !isForegroundDuplicate,
        shouldShowList: !isForegroundDuplicate,
        shouldPlaySound: false,
        shouldSetBadge: false,
      };
    },
  });
}

/**
 * Ask for permission once, returning whether we may post notifications.
 * Never throws: a device or user that says no simply gets `false`.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    configureHandler();

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Couple reminders',
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

/**
 * Schedule the daily "your streak needs you" reminder at `hour` local time.
 *
 * Uses a fixed identifier so scheduling again replaces rather than stacks —
 * otherwise every app launch would add another copy of the same reminder.
 */
export async function scheduleStreakReminder(partnerName: string, hour = 19): Promise<void> {
  if (!(await ensureNotificationPermission())) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(STREAK_REMINDER_ID).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: STREAK_REMINDER_ID,
      content: {
        title: 'Your streak is on the line',
        body: `You and ${partnerName} haven't both trained today.`,
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute: 0,
      },
    });
  } catch {
    // A refused or unavailable scheduler must never break the calling screen.
  }
}

/** Identifier for the weekly recap nudge, so re-scheduling replaces it. */
const WEEKLY_RECAP_ID = 'weekly-recap';

/**
 * Schedule the weekly "your week is ready" nudge — Sunday evening by default.
 *
 * Fired once at app start (idempotent via the fixed id), it draws the athlete
 * back to the recap: a low-frequency, emotional-payoff notification, distinct
 * from the daily streak nag. Local-only; needs no server.
 */
export async function scheduleWeeklyRecap(weekday = 1, hour = 18): Promise<void> {
  // expo-notifications weekday: 1 = Sunday … 7 = Saturday.
  if (!(await ensureNotificationPermission())) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(WEEKLY_RECAP_ID).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: WEEKLY_RECAP_ID,
      content: {
        title: 'Your week in reps 💪',
        body: 'See what you got done — and what you and your partner did together.',
        data: { type: 'weekly-recap' },
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday,
        hour,
        minute: 0,
      },
    });
  } catch {
    // Best-effort; a refused scheduler must never break app start.
  }
}

/** Drop the reminder — the streak is safe, or the couple has unpaired. */
export async function cancelStreakReminder(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(STREAK_REMINDER_ID);
  } catch {
    // Nothing scheduled; nothing to do.
  }
}

/**
 * Surface a nudge from the partner right now.
 *
 * Only reaches this device while the app is running — see the module header for
 * why a backgrounded delivery needs a Cloud Function.
 */
export async function presentNudge(fromName: string): Promise<void> {
  if (!(await ensureNotificationPermission())) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${fromName} is training`,
        body: 'Jump in and keep your streak alive.',
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
      },
      trigger: null, // immediately
    });
  } catch {
    // Best-effort.
  }
}

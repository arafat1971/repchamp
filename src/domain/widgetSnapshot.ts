/**
 * The small, flat payload an OS home-screen widget can render.
 *
 * A widget runs in a different process from the app — on Android inside the
 * launcher, via `AppWidgetProvider` — so it cannot call a hook, read MMKV, hold
 * a Firestore listener, or run any of this app's JavaScript. It can read a
 * handful of primitives the app left behind, and that is all.
 *
 * So the app computes everything while it is alive and writes the *result*.
 * This module is the shape of that result: strings and numbers already
 * formatted, because a widget has no place to put a `Date` or a domain type,
 * and no way to recover if one arrives malformed.
 *
 * ## Why it is deliberately tiny
 *
 * Every field here is copied into `SharedPreferences`, which is world-readable
 * to the app's own processes and survives reinstall-less upgrades. It holds
 * only what the widget draws — no uids, no push tokens, no pair code, nothing
 * that identifies the partner beyond the display name already shown on Home.
 *
 * ## The partner asymmetry, carried through
 *
 * Their *days* sync to the bond; their reps and movements never leave their
 * phone. The widget inherits that exactly: `theirDays` is a count of days,
 * there is no `theirReps`, and `headline` never claims a number about them.
 */

import type { PartnerWidget } from '@/domain/coupleExercises';

export interface WidgetSnapshot {
  /** Partner's display name, already trimmed and fallback-applied. */
  partnerName: string;
  /** One line, already phrased — the widget does no string building. */
  headline: string;
  /** Days each side trained this week, and the days both did. */
  theirDays: number;
  myDays: number;
  sharedDays: number;
  /** My reps this week. There is deliberately no partner equivalent. */
  myReps: number;
  /** True only when the headline is a claim about today. */
  freshToday: boolean;
  /** When the app last wrote this, epoch ms — so the widget can age it. */
  updatedAt: number;
}

/** Storage key, shared with the native side. Changing it breaks the bridge. */
export const WIDGET_SNAPSHOT_KEY = 'repchamp.widget.partner.v1';

/**
 * Build the payload from the same widget state Home renders.
 *
 * Phrasing lives here rather than in the native code for one reason: a string
 * built in Kotlin cannot be unit-tested from this repo, and this is copy an
 * athlete reads about their partner. Keeping it here means the widget and the
 * Home card can never drift into saying different things about the same day.
 */
export function buildWidgetSnapshot(
  partnerName: string,
  widget: PartnerWidget,
  now = Date.now(),
): WidgetSnapshot {
  const name = partnerName.trim() || 'Your partner';
  const { pulse } = widget;

  const headline =
    pulse.kind === 'trained-today'
      ? pulse.sharedToday
        ? `You both trained today`
        : `${name} trained today`
      : pulse.kind === 'recent'
        ? `${name} trained ${pulse.daysAgo === 1 ? 'yesterday' : `${pulse.daysAgo} days ago`}`
        : pulse.kind === 'quiet'
          ? `${name} has been quiet ${pulse.daysAgo} days`
          : `${name} has not logged a set yet`;

  return {
    partnerName: name,
    headline,
    theirDays: widget.theirDays,
    myDays: widget.myDays,
    sharedDays: widget.sharedDays,
    myReps: widget.myReps,
    freshToday: pulse.kind === 'trained-today',
    updatedAt: now,
  };
}

/**
 * How stale a snapshot may be before the widget should say so.
 *
 * A widget that silently shows week-old numbers is worse than one that admits
 * it is out of date: the athlete has no way to tell the difference, and the
 * whole value of the card is that it is current. Twelve hours covers an
 * overnight gap without flagging a phone that was simply asleep.
 */
export const WIDGET_STALE_AFTER_MS = 12 * 60 * 60 * 1000;

export function isSnapshotStale(snapshot: WidgetSnapshot, now = Date.now()): boolean {
  return now - snapshot.updatedAt > WIDGET_STALE_AFTER_MS;
}

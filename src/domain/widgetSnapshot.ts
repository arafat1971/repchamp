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

import { formatMl } from '@/domain/hydration';
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
  /**
   * One short line under the headline, or '' when there is nothing true to add.
   *
   * The headline reports; this is the part that gives a reason to act. It is
   * only ever a fact already on the widget — the ball being in your court, a
   * streak-day about to be lost, a partner who turned up first — never a
   * manufactured deadline or a guilt line.
   */
  nudge: string;
  /** When the app last wrote this, epoch ms — so the widget can age it. */
  updatedAt: number;
}

/**
 * The widgets this app can publish to.
 *
 * The id is the wire contract: it is what `services/widgets.ts` passes across
 * the bridge, and the plugin's own WIDGETS list generates the Kotlin `when`
 * branches that resolve it. A test below reads the plugin and asserts the two
 * agree, because nothing else would catch a rename — a mismatched id resolves
 * to `null` natively and silently publishes nowhere.
 */
export const WIDGET_IDS = ['partner', 'dashboard', 'water'] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];

/**
 * The widgets Android actually ships.
 *
 * `dashboard` is iOS-only today: the Android side would need its own provider
 * class, layout and picker entry, and adding them is a separate piece of work
 * from the bridge refactor that made it possible. Publishing to it on Android
 * resolves to `null` in the Kotlin `when` and is a no-op, which is the
 * intended behaviour rather than an oversight — but it means the id contract
 * test must know which ids to expect in the plugin.
 */
export const ANDROID_WIDGET_IDS: readonly WidgetId[] = ['partner', 'water'];

/** Storage keys, shared with the native side. Changing one breaks the bridge. */
export const WIDGET_SNAPSHOT_KEYS: Record<WidgetId, string> = {
  partner: 'repchamp.widget.partner.v1',
  dashboard: 'repchamp.widget.dashboard.v1',
  /* Also written natively, by the messaging service, from a partner's silent
     push — see `domain/waterWidget`. */
  water: 'repchamp.widget.water.v1',
};

/** The partner widget's key. Kept for the call sites that name it directly. */
export const WIDGET_SNAPSHOT_KEY = WIDGET_SNAPSHOT_KEYS.partner;

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
  /** Today's water, when known: theirs only if they shared it today. */
  water?: { theirMl: number | null; myMl: number },
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
    nudge: withWater(nudgeFor(name, widget), name, widget, water),
    theirDays: widget.theirDays,
    myDays: widget.myDays,
    sharedDays: widget.sharedDays,
    myReps: widget.myReps,
    freshToday: pulse.kind === 'trained-today',
    updatedAt: now,
  };
}


/**
 * Swap in the partner's water when it is the better reason to act.
 *
 * Training keeps priority: "your turn to train" is the widget's core loop.
 * Otherwise, a partner ahead on water today is a true and actionable fact —
 * and it is what makes the widget move when they drink, not only when they
 * train. Only their shared total counts; an unknown is never read as zero.
 */
function withWater(
  base: string,
  name: string,
  widget: PartnerWidget,
  water?: { theirMl: number | null; myMl: number },
): string {
  const trainTurn = widget.pulse.kind === 'trained-today' && !widget.pulse.sharedToday;
  if (trainTurn || !water || water.theirMl == null || water.theirMl <= water.myMl) return base;
  return `${name} has had ${formatMl(water.theirMl)} 💧 — your turn`;
}

/**
 * The line that turns a status into a reason.
 *
 * A widget that only reports is a scoreboard, and a scoreboard is easy to stop
 * looking at. What makes this one worth keeping is that it sometimes tells the
 * athlete the ball is in their court — *today, and only from facts already on
 * the card*.
 *
 * Every branch is a restatement of something visible, which is the constraint
 * that keeps this from becoming the fabricated urgency the rest of the app
 * refuses. There is no countdown, no invented deadline, and nothing about what
 * the partner will think.
 *
 * Returns '' rather than filler when there is nothing true to say. An empty
 * line is better than a line that means nothing, and the layout hides it.
 */
function nudgeFor(name: string, widget: PartnerWidget): string {
  const { pulse, myDays, theirDays, sharedDays } = widget;

  /* They trained and you have not: the single most actionable state this
     widget can be in, and the only one where "your turn" is literally true. */
  if (pulse.kind === 'trained-today' && !pulse.sharedToday) {
    return 'Your turn — train to make it a shared day';
  }

  /* Both trained. Name what it bought, because the shared day is the only
     thing that moves the streak. */
  if (pulse.kind === 'trained-today' && pulse.sharedToday) {
    return sharedDays > 0
      ? `${sharedDays} shared ${sharedDays === 1 ? 'day' : 'days'} this week`
      : '';
  }

  /* Nobody has trained today and they went first recently — the reciprocity
     is the fact, stated plainly. */
  if (pulse.kind === 'recent' && theirDays > myDays) {
    return `${name} is ahead this week`;
  }
  if (pulse.kind === 'recent' && myDays > theirDays) {
    return `You are ahead — ${name} owes you one`;
  }
  if (pulse.kind === 'recent') {
    return 'Level this week — one set breaks the tie';
  }

  /* Quiet. Nudging is the app's own feature, so pointing at it is a real
     action rather than a scold. */
  if (pulse.kind === 'quiet') return 'Open RepChamp to send a nudge';

  return '';
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

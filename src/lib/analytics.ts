import { AppState } from 'react-native';

import { posthogKey } from '@/lib/config';
import { assertHttps } from '@/lib/https';

/**
 * Product analytics — a thin, provider-agnostic wrapper.
 *
 * Two design choices, both deliberate:
 *
 *  1. **Typed event catalogue.** Every event this app can emit is a key in
 *     `AnalyticsEvents` below, with typed properties. `track()` only accepts
 *     those, so a funnel event can't be mistyped into a new, siloed name — the
 *     single most common way analytics data rots.
 *
 *  2. **No native module, no rebuild.** Events POST to PostHog's HTTP capture
 *     endpoint directly (batched), rather than pulling in `posthog-react-native`
 *     with its native autocapture. That keeps analytics a pure-JS concern the app
 *     can adopt without another native build, and swappable for any HTTP-ingest
 *     provider by changing this one file.
 *
 * Unconfigured (no key) → every call is a no-op, exactly like the Firebase
 * services. Instrumenting the app is therefore always safe; wiring the key later
 * lights it up with zero code changes at the call sites.
 */

/** The complete set of events, with their property shapes. Add here, not inline. */
export interface AnalyticsEvents {
  app_opened: Record<string, never>;
  onboarding_completed: { weeklyGoal: number };
  /** Fires once per step, so drop-off is visible screen by screen. */
  onboarding_step: { step: number; name: string; percent: number };
  session_started: { exercise: string; mode: string };
  session_finished: { exercise: string; mode: string; reps: number; won: boolean };
  /** First rep of *a session*. Fires several times a week for a regular. */
  first_rep_counted: { exercise: string };
  /**
   * First rep of the athlete's *life* — fires exactly once, ever.
   *
   * The terminal step of the activation funnel: `onboarding_step` →
   * `onboarding_completed` → this. Kept separate from `first_rep_counted`
   * rather than added to it as a flag, because that event answers a real and
   * different question (did this set start producing reps) that would be lost
   * if its shape changed.
   */
  first_rep_ever: { exercise: string; mode: string };

  home_hero_shown: { kind: string };
  home_hero_tapped: { kind: string };
  home_couple_strip: { action: 'train' | 'nudge' | 'open' };

  couple_invite_created: Record<string, never>;
  couple_paired: { via: 'code' | 'qr' | 'link' };
  couple_nudge_sent: Record<string, never>;
  couple_together_started: { exercise: string };
  couple_partner_dashboard: Record<string, never>;
  couple_sharing_changed: { metric: 'steps' | 'water'; on: boolean };

  /** Mirrors `couple_paired` so both invite surfaces are measured the same way. */
  duel_joined: { via: 'qr' | 'code' | 'invite' };

  paywall_viewed: { source: string };
  /** The athlete saw the price and chose not to buy — the other half of the funnel. */
  paywall_dismissed: { source: string };
  /**
   * The store sheet opened and the athlete backed out of it.
   *
   * Distinct from `paywall_dismissed`, and the distinction is the point: someone
   * who never tapped Subscribe rejected the *offer*, while someone who reached
   * Apple's or Google's confirmation sheet and cancelled had already accepted it
   * and stopped at the payment. Those are different problems — the first is
   * pricing or framing, the second is friction, a payment method, or second
   * thoughts at the last step. Collapsing them into one number hides whichever
   * is actually happening.
   */
  purchase_cancelled: { plan: string; source: string };
  /**
   * The purchase was attempted and failed — a declined card, a store error, a
   * network drop. Never a cancellation; that is `purchase_cancelled`.
   *
   * `reason` is the store's own message, which is what distinguishes a billing
   * outage the app cannot fix from a configuration fault it can.
   */
  purchase_failed: { plan: string; source: string; reason: string };
  /**
   * Longest `reason` sent with `purchase_failed`.
   *
   * Every other property in this catalogue is a number or a short enum. `reason`
   * is the one place a raw third-party string — a store SDK's error message, of
   * unbounded length and content — reaches an outbound payload, and nothing
   * downstream bounds a single property: `MAX_BATCH` and `MAX_QUEUE` cap how
   * many events are sent, not how large one is.
   *
   * 180 characters keeps the distinguishing part of every real message
   * ("Invalid Play Store credentials.", "BILLING_UNAVAILABLE", a declined-card
   * line) while making a pathological one impossible. Truncation is marked, so
   * a cut message is never mistaken for the whole fault when someone is
   * diagnosing from the dashboard.
   */
  trial_started: { plan: string };
  subscribed: { plan: string };
  restore_completed: { restored: boolean };

  share_opened: { kind: string };

  /* ── Hydration ──
   * Declared above the `share_opened` marker deliberately: `declaredEvents()`
   * in `paywallFunnel.test.ts` slices the catalogue at that line, so anything
   * below it is invisible to the dead-entry check. */

  /** A glass was logged. `ml` says which chip, so the sizes can be tuned. */
  water_logged: { ml: number; source: 'home' };
  /** The daily target was moved. Tells us whether 2 L is the right default. */
  water_goal_set: { goalMl: number };

  /* ── Retention ──
   * The app ships streaks, leagues and three kinds of nudge, and until these
   * events existed there was no way to tell which of them brought anyone back.
   * Each one answers a question that was previously unfalsifiable. */

  /** A training day extended a live run. `previous`/`length` bracket the change. */
  streak_continued: { length: number; previous: number };
  /** Reported on the return *after* a gap — nothing runs on a day nobody opens. */
  streak_broken: { length: number; previous: number; daysMissed: number };
  /** A nudge was actually tapped, rather than merely delivered. */
  notification_opened: { kind: string };
  /** First open of a calendar day. `dayN` counts from install, for D1/D7. */
  day_n_return: { dayN: number; daysSinceLast: number };
  /** Movement on the weekly-XP ladder. Demotion is the more telling direction. */
  league_promoted: { from: string; to: string; direction: 'promoted' | 'demoted' };

  /* ── Navigation & intent ──
   * Home was the only instrumented tab, so the funnel could see an athlete
   * arrive and see them convert, with the competitive and social surfaces in
   * between completely dark. These close that gap: `tab_viewed` says which
   * surfaces are actually visited, and the intent events say what people reach
   * for once they are there. Deliberately a handful of broad events rather than
   * one per button — the question is which surface earns its place, and a tap
   * count per control answers a question nobody is asking yet. */

  /** A tab became the active surface. The denominator for everything below. */
  tab_viewed: { tab: 'train' | 'arena' | 'friends' | 'profile' };
  /**
   * An athlete reached for a workout from the Train tab.
   *
   * `mode` separates solo practice from a together-set: the second is the
   * viral loop starting, and collapsing them hides which one Train drives.
   */
  train_intent: { exercise: string; mode: 'practice' | 'together' };
  /** A competitive surface was opened from Arena. Which one is the question. */
  arena_opened: { destination: 'leaderboard' | 'daily' | 'opponent-picker' };
  /**
   * An invite or duel was launched at someone from the Friends tab.
   *
   * `kind` mirrors the invite kinds the screen already routes with, and
   * `isAI` marks a labelled AI opponent — without it a roster padded with AI
   * partners reads as organic social activity, which is the one number here
   * most likely to be believed and most misleading if wrong.
   */
  friend_invited: { kind: 'duel' | 'train' | 'compete'; isAI: boolean };
}

type EventName = keyof AnalyticsEvents;

interface QueuedEvent {
  event: string;
  properties: Record<string, unknown>;
  timestamp: string;
}

const POSTHOG_HOST = 'https://us.i.posthog.com';
/** Events are batched and flushed on this cadence to avoid a request per rep. */
const FLUSH_INTERVAL_MS = 10_000;
/** See `purchase_failed` — bounds the one free-text property in the catalogue. */
export const MAX_REASON_LENGTH = 180;

/**
 * Trims a store error to something safe to send, marking the cut.
 *
 * Returns a stable placeholder for an absent or blank message so the event
 * still records *that* a purchase failed — a missing reason is itself worth
 * seeing, and an empty string in a dashboard reads as a bug in the chart.
 */
export function truncateReason(reason: string | null | undefined): string {
  const trimmed = (reason ?? '').trim();
  if (!trimmed) return 'unknown';
  if (trimmed.length <= MAX_REASON_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_REASON_LENGTH - 1)}…`;
}

const MAX_BATCH = 20;
/** Hard ceiling so a long offline session cannot grow the queue forever. */
const MAX_QUEUE = 200;

function apiKey(): string | undefined {
  return posthogKey();
}

let distinctId: string | null = null;
let queue: QueuedEvent[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
let appStateFlushInstalled = false;

/** Flush the queue when the app backgrounds so session_finished isn't lost. */
function ensureAppStateFlush(): void {
  if (appStateFlushInstalled) return;
  appStateFlushInstalled = true;
  AppState.addEventListener('change', (state) => {
    if (state !== 'active') void flush();
  });
}

/**
 * Identify the current user, so events tie to a person across sessions. Pass the
 * auth uid once it exists. Safe to call repeatedly; only the latest id is used.
 */
export function identify(uid: string | null): void {
  distinctId = uid;
}

/** Record one typed event. No-ops when analytics isn't configured. */
export function track<E extends EventName>(
  event: E,
  ...args: AnalyticsEvents[E] extends Record<string, never> ? [] : [props: AnalyticsEvents[E]]
): void {
  if (!apiKey()) return;
  const properties = (args[0] ?? {}) as Record<string, unknown>;
  queue.push({ event, properties, timestamp: new Date().toISOString() });
  // Drop oldest when offline backlog balloons — keeps memory bounded.
  if (queue.length > MAX_QUEUE) queue = queue.slice(queue.length - MAX_QUEUE);
  ensureTimer();
  ensureAppStateFlush();
  if (queue.length >= MAX_BATCH) void flush();
}

function ensureTimer(): void {
  if (timer) return;
  timer = setInterval(() => void flush(), FLUSH_INTERVAL_MS);
}

/**
 * Send queued events. Best-effort: a failed flush keeps the events for the next
 * attempt rather than dropping them, and never throws into the caller.
 */
export async function flush(): Promise<void> {
  const key = apiKey();
  if (!key || queue.length === 0) return;

  const batch = queue.slice(0, MAX_BATCH);
  const payload = {
    api_key: key,
    batch: batch.map((e) => ({
      event: e.event,
      timestamp: e.timestamp,
      distinct_id: distinctId ?? 'anonymous',
      properties: { ...e.properties, $lib: 'repchamp-mobile' },
    })),
  };

  try {
    const res = await fetch(`${assertHttps(POSTHOG_HOST)}/batch/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    // Only drop the events we actually sent once the server accepted them.
    if (res.ok) queue = queue.slice(batch.length);
  } catch {
    // Offline or a transient error — keep the queue for the next flush.
  }
}

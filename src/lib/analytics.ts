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
  session_started: { exercise: string; mode: string };
  session_finished: { exercise: string; mode: string; reps: number; won: boolean };
  first_rep_counted: { exercise: string };

  home_hero_shown: { kind: string };
  home_hero_tapped: { kind: string };
  home_couple_strip: { action: 'train' | 'nudge' | 'open' };

  couple_invite_created: Record<string, never>;
  couple_paired: { via: 'code' | 'qr' | 'link' };
  couple_nudge_sent: Record<string, never>;
  couple_together_started: { exercise: string };

  /** Mirrors `couple_paired` so both invite surfaces are measured the same way. */
  duel_joined: { via: 'qr' | 'code' | 'invite' };

  paywall_viewed: { source: string };
  trial_started: { plan: string };
  subscribed: { plan: string };
  restore_completed: { restored: boolean };

  share_opened: { kind: string };
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

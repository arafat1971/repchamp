import Constants from 'expo-constants';

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

  couple_invite_created: Record<string, never>;
  couple_paired: { via: 'code' | 'qr' | 'link' };
  couple_nudge_sent: Record<string, never>;
  couple_together_started: { exercise: string };

  paywall_viewed: { source: string };
  trial_started: { plan: string };
  subscribed: { plan: string };

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

function apiKey(): string | undefined {
  const key = (Constants.expoConfig?.extra as { posthogKey?: string } | undefined)?.posthogKey;
  // The template ships an empty/placeholder key; treat blank as "not configured".
  return key && key.trim().length > 0 && !key.startsWith('phc_placeholder') ? key : undefined;
}

let distinctId: string | null = null;
let queue: QueuedEvent[] = [];
let timer: ReturnType<typeof setInterval> | null = null;

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
  ensureTimer();
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
    const res = await fetch(`${POSTHOG_HOST}/batch/`, {
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

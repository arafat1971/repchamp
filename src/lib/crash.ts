import * as Sentry from '@sentry/react-native';

import { sentryDsn } from '@/lib/config';
import { assertHttps } from '@/lib/https';

/**
 * Crash + error reporting via Sentry.
 *
 * Initialised once at app start. No-ops without a DSN (the placeholder in
 * `app.json`), so a build with no Sentry project set up runs untouched — the same
 * safe-degradation every other integration here uses.
 *
 * Keep this thin: the app should call `initCrashReporting()` once and otherwise
 * let Sentry's automatic error capture do the work. `captureError` exists for the
 * few places that swallow an error deliberately but still want it recorded.
 */

let started = false;

export function initCrashReporting(): void {
  const value = sentryDsn();
  if (!value || started) return;
  started = true;
  Sentry.init({
    dsn: assertHttps(value),
    // Trim breadcrumb noise; we want crashes and handled errors, not every log.
    enableAutoSessionTracking: true,
    // Sample performance lightly — enough to spot slow screens without cost.
    tracesSampleRate: 0.1,
  });
}

/** Tie captured events to the signed-in athlete (or clear on sign-out). */
export function setCrashUser(uid: string | null): void {
  if (!started) return;
  Sentry.setUser(uid ? { id: uid } : null);
}

/** Record a deliberately-handled error that still deserves visibility. */
export function captureError(error: unknown): void {
  if (!started) return;
  Sentry.captureException(error);
}

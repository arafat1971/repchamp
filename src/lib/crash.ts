import Constants from 'expo-constants';
import * as Sentry from '@sentry/react-native';

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

function dsn(): string | undefined {
  // Prefer an EAS secret / env override so production can set the DSN without
  // rebuilding from a committed placeholder.
  const fromEnv =
    (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_SENTRY_DSN) ||
    (typeof process !== 'undefined' && process.env?.SENTRY_DSN) ||
    undefined;
  const fromExtra = (Constants.expoConfig?.extra as { sentryDsn?: string } | undefined)?.sentryDsn;
  const value = (fromEnv || fromExtra || '').trim();
  if (!value || value.startsWith('https://placeholder') || value.includes('placeholder@sentry')) {
    return undefined;
  }
  return value;
}

export function initCrashReporting(): void {
  const value = dsn();
  if (!value || started) return;
  started = true;
  Sentry.init({
    dsn: value,
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

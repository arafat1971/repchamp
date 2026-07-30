/**
 * Public client config — SDK keys that *must* ship in the app binary.
 *
 * **Never put secret keys here** (RevenueCat `sk_…`, PostHog personal API keys,
 * Firebase Admin, Sentry auth tokens). Those belong on a backend or EAS Secrets
 * used only at build time for upload tools — not in `extra` for runtime.
 *
 * Resolution order: `EXPO_PUBLIC_*` env (EAS secrets / local `.env`) →
 * `app.json` / `app.config` `extra`. Blank and placeholder values = unconfigured.
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';

type Extra = {
  posthogKey?: string;
  googleWebClientId?: string;
  revenueCatGoogle?: string;
  revenueCatApple?: string;
  sentryDsn?: string;
};

function extra(): Extra {
  return (Constants.expoConfig?.extra ?? {}) as Extra;
}

function fromEnvOrExtra(envKey: string, extraKey: keyof Extra): string | undefined {
  const env =
    typeof process !== 'undefined' ? (process.env as Record<string, string | undefined>)[envKey] : undefined;
  const raw = (env && env.trim()) || extra()[extraKey];
  if (!raw || !String(raw).trim()) return undefined;
  const value = String(raw).trim();
  if (value.includes('placeholder') || value.startsWith('YOUR_')) return undefined;
  return value;
}

/** Reject secret-style keys that must never ship in a mobile client. */
function rejectSecrets(key: string | undefined, allowedPrefixes: string[]): string | undefined {
  if (!key) return undefined;
  if (key.startsWith('sk_') || key.startsWith('rk_') || key.includes('secret')) return undefined;
  if (allowedPrefixes.length > 0 && !allowedPrefixes.some((p) => key.startsWith(p))) {
    return undefined;
  }
  return key;
}

export function posthogKey(): string | undefined {
  return rejectSecrets(fromEnvOrExtra('EXPO_PUBLIC_POSTHOG_KEY', 'posthogKey'), ['phc_']);
}

export function googleWebClientId(): string | undefined {
  return fromEnvOrExtra('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'googleWebClientId');
}

export function revenueCatApiKey(): string | undefined {
  const key =
    Platform.OS === 'ios'
      ? fromEnvOrExtra('EXPO_PUBLIC_REVENUECAT_APPLE', 'revenueCatApple')
      : fromEnvOrExtra('EXPO_PUBLIC_REVENUECAT_GOOGLE', 'revenueCatGoogle');
  // Public SDK keys only — never the secret `sk_` dashboard key.
  return rejectSecrets(key, ['goog_', 'appl_']);
}

export function sentryDsn(): string | undefined {
  const dsn = fromEnvOrExtra('EXPO_PUBLIC_SENTRY_DSN', 'sentryDsn');
  if (!dsn || dsn.startsWith('https://placeholder')) return undefined;
  return dsn.startsWith('https://') ? dsn : undefined;
}

/**
 * Expo config — merges `app.json` with optional `EXPO_PUBLIC_*` env overrides.
 *
 * Use EAS Secrets / local `.env` for keys so they are not the only copy sitting
 * in git. Public SDK keys (PostHog `phc_`, RevenueCat `goog_`/`appl_`) are still
 * extractable from the binary — that is normal for mobile; never put Admin /
 * secret API keys in these slots.
 */

const appJson = require('./app.json');

module.exports = () => {
  const expo = appJson.expo;
  const extra = { ...expo.extra };

  const env = process.env;
  if (env.EXPO_PUBLIC_POSTHOG_KEY) extra.posthogKey = env.EXPO_PUBLIC_POSTHOG_KEY;
  if (env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) {
    extra.googleWebClientId = env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  }
  if (env.EXPO_PUBLIC_REVENUECAT_GOOGLE) {
    extra.revenueCatGoogle = env.EXPO_PUBLIC_REVENUECAT_GOOGLE;
  }
  if (env.EXPO_PUBLIC_REVENUECAT_APPLE) {
    extra.revenueCatApple = env.EXPO_PUBLIC_REVENUECAT_APPLE;
  }
  if (env.EXPO_PUBLIC_SENTRY_DSN) extra.sentryDsn = env.EXPO_PUBLIC_SENTRY_DSN;

  return {
    ...expo,
    extra,
  };
};

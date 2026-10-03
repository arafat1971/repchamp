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
  // App Check debug token — development installs only. See src/lib/config.ts.
  // `.easignore` uploads the local `.env`, so a production build must drop it
  // here or the bypass credential ships inside the store binary's manifest.
  if (env.EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN && env.EAS_BUILD_PROFILE !== 'production') {
    extra.appCheckDebugToken = env.EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN;
  }

  return {
    ...expo,
    extra,
  };
};

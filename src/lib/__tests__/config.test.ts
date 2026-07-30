/**
 * Config key loading — env / extra resolution and secret rejection.
 * Constants.expoConfig is mocked so tests do not depend on a real Expo runtime.
 */

jest.mock('expo-constants', () => ({
  expoConfig: {
    extra: {
      posthogKey: 'phc_from_extra',
      revenueCatGoogle: 'goog_from_extra',
      revenueCatApple: 'appl_from_extra',
      googleWebClientId: 'web-client.apps.googleusercontent.com',
      sentryDsn: 'https://abc@o0.ingest.sentry.io/1',
    },
  },
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

import {
  googleWebClientId,
  posthogKey,
  revenueCatApiKey,
  sentryDsn,
} from '../config';

describe('config', () => {
  const env = process.env as Record<string, string | undefined>;

  afterEach(() => {
    delete env.EXPO_PUBLIC_POSTHOG_KEY;
    delete env.EXPO_PUBLIC_REVENUECAT_GOOGLE;
    delete env.EXPO_PUBLIC_SENTRY_DSN;
  });

  it('reads public keys from extra', () => {
    expect(posthogKey()).toBe('phc_from_extra');
    expect(revenueCatApiKey()).toBe('goog_from_extra');
    expect(googleWebClientId()).toBe('web-client.apps.googleusercontent.com');
    expect(sentryDsn()).toBe('https://abc@o0.ingest.sentry.io/1');
  });

  it('prefers EXPO_PUBLIC env overrides', () => {
    env.EXPO_PUBLIC_POSTHOG_KEY = 'phc_from_env';
    expect(posthogKey()).toBe('phc_from_env');
  });

  it('rejects secret-shaped RevenueCat keys', () => {
    env.EXPO_PUBLIC_REVENUECAT_GOOGLE = 'sk_live_secret';
    expect(revenueCatApiKey()).toBeUndefined();
  });
});

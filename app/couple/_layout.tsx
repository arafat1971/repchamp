import { Stack, useRouter } from 'expo-router';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { palette } from '@/theme/tokens';

/**
 * The couple stack — the bond tracker and the `?code=` join landing.
 *
 * This directory went without a layout for as long as it held only `join.tsx`,
 * which is a leaf that redirects on mount and so never needed a stack of its
 * own. Adding `index.tsx` exposed the gap: `repchamp://couple` fell through to
 * Home while `repchamp://couple/join` still worked, which looks like a broken
 * route and is really a missing navigator.
 *
 * Wrapped in `ErrorBoundary` for the same reason the duel stack is: both read
 * live Firestore state, and a throw here should return to the tabs rather than
 * take down the whole app.
 */
export default function CoupleLayout() {
  const router = useRouter();
  return (
    <ErrorBoundary
      onReset={() => {
        router.replace('/(tabs)');
      }}
    >
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.canvas },
        }}
      />
    </ErrorBoundary>
  );
}

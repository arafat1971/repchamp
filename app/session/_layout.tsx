import { Stack, useRouter } from 'expo-router';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useSessionStore } from '@/state/sessionStore';

/**
 * Nested recovery for the session stack — a HUD crash should not white-screen
 * the whole app. Reset session state and return home.
 */
export default function SessionLayout() {
  const router = useRouter();
  return (
    <ErrorBoundary
      onReset={() => {
        useSessionStore.getState().reset();
        router.replace('/(tabs)');
      }}
    >
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
    </ErrorBoundary>
  );
}

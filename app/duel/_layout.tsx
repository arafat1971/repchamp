import { Stack, useRouter } from 'expo-router';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { palette } from '@/theme/tokens';

/** Nested recovery for duel setup / waiting / queue screens. */
export default function DuelLayout() {
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
          animation: 'slide_from_bottom',
          contentStyle: { backgroundColor: palette.canvas },
        }}
      />
    </ErrorBoundary>
  );
}

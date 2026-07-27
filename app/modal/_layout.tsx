import { Stack } from 'expo-router';

import { palette } from '@/theme/tokens';

/**
 * Secondary screens presented over the tabs.
 *
 * They share a card presentation so a swipe-down always means "go back", and
 * none of them own the camera, so gesture dismissal is safe here.
 */
export default function ModalLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        presentation: 'card',
        contentStyle: { backgroundColor: palette.canvas },
      }}
    />
  );
}

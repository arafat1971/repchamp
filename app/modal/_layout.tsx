import { Stack } from 'expo-router';
import { Platform } from 'react-native';

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
        // Android's stock card transition is an abrupt full-screen swap; rising
        // from the bottom matches the swipe-down dismissal described above.
        animation: Platform.OS === 'android' ? 'fade_from_bottom' : 'default',
        contentStyle: { backgroundColor: palette.canvas },
      }}
    />
  );
}

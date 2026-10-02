import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useOffline } from '@/state/connectivityStore';
import { font } from '@/theme/typography';
import { palette } from '@/theme/tokens';

/**
 * A slim notice while the device is offline. It reassures rather than alarms:
 * rep counting is fully on-device, so training still works, and scores and
 * invites catch up on their own. Non-interactive (`pointerEvents="none"`) so it
 * can never sit on top of a tap target.
 */
export function OfflineBanner() {
  const offline = useOffline();
  const insets = useSafeAreaInsets();
  if (!offline) return null;
  return (
    <View
      pointerEvents="none"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.wrap, { paddingTop: insets.top + 4 }]}
    >
      <Text style={font('bold', 12, { color: palette.white, textAlign: 'center' })}>
        You’re offline — training still works. Scores and invites sync when you’re back.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingBottom: 6,
    paddingHorizontal: 16,
    backgroundColor: palette.amber800,
  },
});

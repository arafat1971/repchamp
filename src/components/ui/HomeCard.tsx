import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, surfaceShadow } from '@/theme/tokens';

/**
 * Home's surface: a large radius, a hairline border and a long faint shadow.
 *
 * `Card` in `ui` predates the Home redesign and is still used by screens that
 * have not been moved over; this is the same API so a screen adopts the new look
 * by changing one import.
 */
export function HomeCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius['4xl'],
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
    ...surfaceShadow,
  },
});

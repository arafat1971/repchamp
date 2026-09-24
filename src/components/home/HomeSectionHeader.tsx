import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { font } from '@/theme/typography';
import { palette } from '@/theme/tokens';

/**
 * The one heading every Home module sits under.
 *
 * Home had three: a 13pt caps label on Quick Start, 17pt on the race row, 18pt
 * on Hydration, and small eyebrows inside the Duo and Steps cards. One size,
 * one spacing and one slot for a right-hand accessory (a link or a chip)
 * make the page read as a single designed surface rather than a stack of
 * cards from different screens.
 */
export function HomeSectionHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {right ?? null}
    </View>
  );
}

export const homeSectionLink = font('bold', 13, { color: palette.green600 });

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 26,
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  title: { ...font('extrabold', 18, { color: palette.ink }), letterSpacing: -0.4 },
});

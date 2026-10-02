import { StyleSheet, Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import type { SetHighlight } from '@/domain/setHighlight';
import { font } from '@/theme/typography';
import { palette } from '@/theme/tokens';

/** The post-set highlight: one earned, checkable fact, popped in after the score. */
export function HighlightCard({ highlight }: { highlight: SetHighlight }) {
  return (
    <Animated.View
      entering={ZoomIn.springify().delay(900)}
      style={[styles.card, highlight.tier === 'epic' && styles.epic]}
      accessibilityRole="summary"
    >
      <Text style={styles.emoji}>{highlight.emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{highlight.title}</Text>
        <Text style={styles.body}>{highlight.body}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    padding: 14,
    borderRadius: 18,
    backgroundColor: palette.amber50,
    borderWidth: 1,
    borderColor: palette.amber500,
  },
  epic: { borderWidth: 2 },
  emoji: { fontSize: 30 },
  title: font('extrabold', 16, { color: palette.amber800 }),
  body: font('medium', 13, { color: palette.grey600 }),
});

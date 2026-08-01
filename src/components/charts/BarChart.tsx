import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { font } from '@/theme/typography';
import { palette } from '@/theme/tokens';

/**
 * A compact iOS-style animated bar chart — bars grow up from the baseline on
 * mount, staggered left→right, the way Apple's Activity "weekly" bars settle in.
 * Pure View + Reanimated (no SVG needed for rectangles), so it stays cheap.
 *
 * Illustrative: it shows a projected weekly trend for onboarding, not real data.
 */
export function BarChart({
  data,
  labels,
  height = 120,
  color = palette.green500,
  highlightColor = palette.green600,
  highlightIndex,
}: {
  data: number[];
  labels?: string[];
  height?: number;
  color?: string;
  highlightColor?: string;
  /** Index of the emphasised bar (e.g. "this week"); defaults to the last. */
  highlightIndex?: number;
}) {
  const max = Math.max(...data) || 1;
  const hi = highlightIndex ?? data.length - 1;

  return (
    <View style={[styles.row, { height }]}>
      {data.map((v, i) => (
        <Bar
          key={i}
          fraction={v / max}
          maxHeight={height - 20}
          color={i === hi ? highlightColor : color}
          faded={i !== hi}
          label={labels?.[i]}
          delay={200 + i * 90}
        />
      ))}
    </View>
  );
}

function Bar({
  fraction,
  maxHeight,
  color,
  faded,
  label,
  delay,
}: {
  fraction: number;
  maxHeight: number;
  color: string;
  faded: boolean;
  label?: string;
  delay: number;
}) {
  const grow = useSharedValue(0);
  useEffect(() => {
    grow.value = withDelay(delay, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [grow, delay]);

  const barStyle = useAnimatedStyle(() => ({
    height: Math.max(6, maxHeight * fraction * grow.value),
    opacity: 0.4 + 0.6 * grow.value,
  }));

  return (
    <View style={styles.barCol}>
      <View style={styles.barTrack}>
        <Animated.View
          style={[
            styles.bar,
            { backgroundColor: color, opacity: faded ? 0.5 : 1 },
            barStyle,
          ]}
        />
      </View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, width: '100%' },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  barTrack: { flex: 1, justifyContent: 'flex-end', width: '100%', alignItems: 'center' },
  bar: { width: '72%', borderRadius: 7, minHeight: 6 },
  label: { ...font('bold', 10, { color: palette.grey600 }), marginTop: 8 },
});

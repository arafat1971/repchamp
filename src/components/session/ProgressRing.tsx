import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedProps, useDerivedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { font } from '@/theme/typography';
import { palette } from '@/theme/tokens';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * Circular progress ring used by calibration, the build-profile step and the
 * form-report score.
 *
 * The sweep is animated through `strokeDashoffset` on the UI thread, so it stays
 * smooth even while the pose model is saturating the JS thread mid-session.
 */
export function ProgressRing({
  percent,
  size = 82,
  strokeWidth = 6,
  color = palette.green500,
  trackColor = 'rgba(255,255,255,0.2)',
  children,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  children?: React.ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const progress = useDerivedValue(
    () => withTiming(Math.max(0, Math.min(100, percent)) / 100, { duration: 160 }),
    [percent],
  );

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  return (
    <View style={{ width: size, height: size }}>
      {/* Rotated so 0% starts at 12 o'clock rather than 3 o'clock. */}
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
        />
      </Svg>
      <View style={StyleSheet.absoluteFill}>
        <View style={styles.center}>{children}</View>
      </View>
    </View>
  );
}

/** Percentage label for the middle of a calibration ring. */
export function RingPercent({ percent }: { percent: number }) {
  return (
    <Text style={font('extrabold', 20, { color: palette.white })}>
      {Math.round(percent)}
      <Text style={font('extrabold', 11, { color: palette.white })}>%</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

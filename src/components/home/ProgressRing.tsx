import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { palette } from '@/theme/tokens';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * A closing ring, in the Activity-ring idiom.
 *
 * A ring rather than a bar because a goal is a loop you close, not a distance
 * you cross — and because two of them side by side (water, steps) read as one
 * glanceable status at a size where two stacked bars would not.
 *
 * The sweep animates via `strokeDashoffset` on the UI thread. That matters:
 * this sits on Home behind a `ScrollView`, and a progress animation that
 * stutters while the list is being flung is worse than one that does not
 * animate at all.
 *
 * Rounded caps and a gradient are doing real work rather than decoration — the
 * cap makes a 3% ring visible at all (a butt cap at that length is a speck),
 * and the gradient keeps the leading edge distinguishable from the trailing
 * one as the ring approaches a full turn.
 */
export function ProgressRing({
  percent,
  size = 84,
  thickness = 9,
  from,
  to,
  track = palette.border,
  children,
  /** Animate on mount. Off for a ring that appears mid-scroll. */
  animate = true,
}: {
  percent: number;
  size?: number;
  thickness?: number;
  from: string;
  to: string;
  track?: string;
  children?: React.ReactNode;
  animate?: boolean;
}) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const target = Math.max(0, Math.min(100, percent));

  const progress = useSharedValue(animate ? 0 : target);

  useEffect(() => {
    progress.value = withTiming(target, {
      duration: 900,
      // Decelerate into the figure rather than stopping dead, matching
      // `CountUp`'s ease-out so a ring and its number land together.
      easing: Easing.out(Easing.cubic),
    });
  }, [target, progress]);

  const dashoffset = useDerivedValue(
    () => circumference - (circumference * progress.value) / 100,
  );

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: dashoffset.value,
  }));

  /* Unique per instance: two rings on one screen sharing a gradient id would
     both take whichever definition mounted last. */
  const gradientId = `ring-${from.replace('#', '')}-${to.replace('#', '')}-${size}`;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={from} />
            <Stop offset="1" stopColor={to} />
          </LinearGradient>
        </Defs>

        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={track}
          strokeWidth={thickness}
          fill="none"
        />

        {/* Rotated so the ring starts at twelve o'clock, not three. */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={`url(#${gradientId})`}
          strokeWidth={thickness}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>

      {children ? <View style={styles.center}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

import { useMemo , useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { palette, radius } from '@/theme/tokens';

const COLORS = [
  palette.amber400,
  palette.green500,
  palette.blue400,
  palette.red400,
  palette.amber600,
];

const PIECE_COUNT = 26;

function Piece({
  left,
  color,
  delay,
  duration,
  fallDistance,
}: {
  left: number;
  color: string;
  delay: number;
  duration: number;
  fallDistance: number;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false),
    );
  }, [progress, delay, duration]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: -40 + progress.value * fallDistance },
      { rotate: `${progress.value * 420}deg` },
    ],
    // Fade in quickly, hold, then fade out near the floor.
    opacity: progress.value < 0.12 ? progress.value / 0.12 : 1 - progress.value,
  }));

  return (
    <Animated.View style={[styles.piece, { left: `${left}%`, backgroundColor: color }, style]} />
  );
}

/**
 * Falling confetti for wins and promotions.
 *
 * Each piece animates entirely on the UI thread, so the celebration stays smooth
 * while the result screen is writing the session to storage on the JS thread.
 */
export function Confetti() {
  const { height } = useWindowDimensions();

  // Randomised once per mount — re-rolling on render would make pieces teleport.
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECE_COUNT }, (_, i) => ({
        key: i,
        // eslint-disable-next-line react-hooks/purity
        left: Math.random() * 100,
        color: COLORS[i % COLORS.length] as string,
        // eslint-disable-next-line react-hooks/purity
        delay: Math.random() * 2000,
        // eslint-disable-next-line react-hooks/purity
        duration: 2000 + Math.random() * 1600,
      })),
    [],
  );

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map(({ key, ...piece }) => (
        <Piece key={key} {...piece} fallDistance={height + 80} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  piece: {
    position: 'absolute',
    top: 0,
    width: 10,
    height: 14,
    borderRadius: radius.xs,
  },
});

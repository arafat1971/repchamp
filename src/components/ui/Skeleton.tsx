import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { StyleSheet, View, type DimensionValue, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { palette } from '@/theme/tokens';

/**
 * A single shimmering placeholder block — the iOS-style skeleton used while a
 * card's real content loads. A soft highlight sweeps left→right across a muted
 * base, looping until the block unmounts.
 */
export function Skeleton({
  width = '100%',
  height = 16,
  radius = 10,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: ViewStyle | ViewStyle[];
}) {
  const [w, setW] = useState(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1150, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    );
    return () => cancelAnimation(progress);
  }, [progress]);

  const sweep = useAnimatedStyle(() => ({
    transform: [{ translateX: -w + progress.value * (2 * w) }],
  }));

  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[{ width, height, borderRadius: radius, backgroundColor: palette.track, overflow: 'hidden' }, style]}
    >
      {w > 0 ? (
        <Animated.View style={[StyleSheet.absoluteFill, sweep]}>
          <LinearGradient
            colors={['transparent', 'rgba(255,255,255,0.7)', 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** A round shimmer — for avatar placeholders. */
export function SkeletonCircle({ size = 44, style }: { size?: number; style?: ViewStyle }) {
  return <Skeleton width={size} height={size} radius={size / 2} style={style} />;
}

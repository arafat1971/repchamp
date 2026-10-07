import { useEffect } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { palette } from '@/theme/tokens';

/**
 * Branded loading indicator — a round-capped arc over a faint track.
 *
 * Replaces the system `ActivityIndicator`, which draws a different spinner on
 * each OS (iOS tick wheel, Android Material ring) and so breaks the one visual
 * language the rest of the app keeps. Same `color` / `size` surface so call
 * sites swap over unchanged; `size` takes the same 'small' | 'large' words.
 */
export function Spinner({
  color = palette.green500,
  size = 'small',
  style,
}: {
  color?: string;
  size?: 'small' | 'large' | number;
  style?: StyleProp<ViewStyle>;
}) {
  const px = typeof size === 'number' ? size : size === 'large' ? 36 : 22;
  const stroke = Math.max(2, Math.round(px / 9));
  const r = (px - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  const turn = useSharedValue(0);
  useEffect(() => {
    turn.value = withRepeat(withTiming(360, { duration: 850, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(turn);
  }, [turn]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));

  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      style={[{ width: px, height: px }, spin, style]}
    >
      <Svg width={px} height={px}>
        <Circle cx={px / 2} cy={px / 2} r={r} stroke={color} strokeOpacity={0.18} strokeWidth={stroke} fill="none" />
        <Circle
          cx={px / 2}
          cy={px / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference * 0.28} ${circumference}`}
          fill="none"
        />
      </Svg>
    </Animated.View>
  );
}

import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { palette } from '@/theme/tokens';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * Soft live canvas behind Home — vertical green wash + a handful of
 * drifting circles at ~5% opacity so the screen never feels flat.
 */
export function HomeAmbient() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        // Tokens rather than literals, so a future theme change reaches this
        // gradient too. It used to hardcode '#ffffff'/'#FAFFFB'/'#F4FFF6',
        // which meant the screen stayed light no matter what the canvas did.
        colors={[palette.white, palette.canvas, palette.canvas]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.radialHint} />
      <Particle left="8%" top="12%" size={90} delay={0} />
      <Particle left="72%" top="8%" size={64} delay={400} />
      <Particle left="18%" top="48%" size={110} delay={900} />
      <Particle left="78%" top="58%" size={72} delay={1200} />
      <Particle left="42%" top="78%" size={96} delay={600} />
    </View>
  );
}

function Particle({
  left,
  top,
  size,
  delay,
}: {
  left: `${number}%` | string;
  top: `${number}%` | string;
  size: number;
  delay: number;
}) {
  const drift = useSharedValue(0);
  const pulse = useSharedValue(0.04);

  useEffect(() => {
    drift.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: 9000 + delay, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      ),
    );
    pulse.value = withDelay(
      delay,
      withRepeat(
        withTiming(0.07, { duration: 4200, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      ),
    );
  }, [delay, drift, pulse]);

  const style = useAnimatedStyle(() => ({
    opacity: pulse.value,
    transform: [{ translateY: drift.value * 14 - 7 }, { translateX: drift.value * 8 - 4 }],
  }));

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          left: left as number | `${number}%`,
          top: top as number | `${number}%`,
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  radialHint: {
    position: 'absolute',
    top: -80,
    alignSelf: 'center',
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: 'rgba(34, 197, 94, 0.05)',
  },
  particle: {
    position: 'absolute',
    backgroundColor: '#22c55e',
  },
});

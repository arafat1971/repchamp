import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

/**
 * A glass of water that fills as the day's intake climbs.
 *
 * Real-water cues, each doing one job:
 * - two sine waves drifting at different speeds and opacities, so the surface
 *   reads as liquid with depth rather than a flat bar;
 * - the level springs to its new height with a slight overshoot, so logging a
 *   drink looks like pouring one in — and an undo drains it the same way;
 * - a handful of bubbles rising through the water on staggered loops;
 * - a highlight streak down the glass so it reads as glass, not a box.
 *
 * All motion runs on the UI thread. Under Reduce Motion the waves and bubbles
 * hold still and the level moves without the bounce.
 */
export function WaterGlass({
  percent,
  width = 96,
  height = 132,
}: {
  percent: number;
  width?: number;
  height?: number;
}) {
  const reduced = useReducedMotion();
  const fill = Math.max(0, Math.min(100, percent)) / 100;

  /* Level: 0 is empty, 1 is brim. A little headroom at the top so even a met
     goal shows a surface, and a little floor so a first sip is visible. */
  const level = useSharedValue(0);
  useEffect(() => {
    const target = fill === 0 ? 0 : 0.08 + fill * 0.84;
    level.value = reduced
      ? withTiming(target, { duration: 250 })
      : withSpring(target, { damping: 9, stiffness: 70, mass: 0.9 });
  }, [fill, reduced, level]);

  const drift = useSharedValue(0);
  const driftSlow = useSharedValue(0);
  useEffect(() => {
    if (reduced) {
      cancelAnimation(drift);
      cancelAnimation(driftSlow);
      return;
    }
    drift.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.linear }), -1);
    driftSlow.value = withRepeat(withTiming(1, { duration: 4100, easing: Easing.linear }), -1);
    return () => {
      cancelAnimation(drift);
      cancelAnimation(driftSlow);
    };
  }, [reduced, drift, driftSlow]);

  const waveH = 14;
  const liquidStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: height - level.value * height - waveH / 2 }],
  }));
  const frontWave = useAnimatedStyle(() => ({ transform: [{ translateX: -drift.value * width }] }));
  const backWave = useAnimatedStyle(() => ({
    transform: [{ translateX: -width + driftSlow.value * width }],
  }));

  /* Two periods side by side, so sliding one period left loops seamlessly. */
  const wave = useMemo(() => wavePath(width * 2, waveH, height * 1.2, 2), [width, height]);

  return (
    <View style={[styles.glass, { width, height }]}>
      <Animated.View style={[StyleSheet.absoluteFill, liquidStyle]}>
        <Animated.View style={[styles.waveLayer, { width: width * 2 }, backWave]}>
          <Svg width={width * 2} height={height * 1.2}>
            <Path d={wave} fill="#60a5fa" opacity={0.45} />
          </Svg>
        </Animated.View>
        <Animated.View style={[styles.waveLayer, { width: width * 2, top: 3 }, frontWave]}>
          <Svg width={width * 2} height={height * 1.2}>
            <Defs>
              <LinearGradient id="water" x1="0" y1="0" x2="0" y2="1">
                {/* Pale at the surface, deep toward the bottom — the gradient
                    spans the whole wave layer, so the stops sit high to land
                    inside the visible water rather than below the glass. */}
                <Stop offset="0" stopColor="#bae6fd" />
                <Stop offset="0.12" stopColor="#38bdf8" />
                <Stop offset="0.45" stopColor="#2563eb" />
                <Stop offset="1" stopColor="#1e3a8a" />
              </LinearGradient>
            </Defs>
            <Path d={wave} fill="url(#water)" />
          </Svg>
        </Animated.View>
        {fill > 0 ? <Bubbles width={width} height={height} reduced={reduced} /> : null}
      </Animated.View>

      {/* Glass: highlight streak and a rim, drawn over the water. */}
      <View pointerEvents="none" style={styles.shine} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.rim]} />
    </View>
  );
}

/** A filled sine band: crest line on top, solid below. */
function wavePath(w: number, amp: number, h: number, periods: number): string {
  const steps = 48;
  let d = `M 0 ${amp / 2}`;
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * w;
    const y = amp / 2 + (amp / 2) * Math.sin((i / steps) * periods * 2 * Math.PI);
    d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return `${d} L ${w} ${h} L 0 ${h} Z`;
}

const BUBBLES = [
  { x: 0.22, size: 5, delay: 0, dur: 2600 },
  { x: 0.55, size: 3.5, delay: 900, dur: 2100 },
  { x: 0.74, size: 4.5, delay: 1600, dur: 2900 },
  { x: 0.38, size: 3, delay: 2200, dur: 1900 },
] as const;

function Bubbles({ width, height, reduced }: { width: number; height: number; reduced: boolean }) {
  return (
    <>
      {BUBBLES.map((b, i) => (
        <Bubble key={i} {...b} width={width} height={height} reduced={reduced} />
      ))}
    </>
  );
}

function Bubble({
  x,
  size,
  delay,
  dur,
  width,
  height,
  reduced,
}: {
  x: number;
  size: number;
  delay: number;
  dur: number;
  width: number;
  height: number;
  reduced: boolean;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    t.value = withDelay(
      delay,
      withRepeat(withSequence(withTiming(1, { duration: dur, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 0 })), -1),
    );
    return () => cancelAnimation(t);
  }, [reduced, delay, dur, t]);

  const style = useAnimatedStyle(() => ({
    opacity: t.value === 0 ? 0 : 0.7 * (1 - t.value),
    transform: [
      { translateY: height * 0.95 - t.value * height * 0.85 },
      { translateX: Math.sin(t.value * 6) * 3 },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.bubble,
        { left: x * width, width: size, height: size, borderRadius: size / 2 },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  glass: {
    overflow: 'hidden',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  waveLayer: { position: 'absolute', left: 0, top: 0 },
  bubble: { position: 'absolute', top: 0, backgroundColor: 'rgba(255,255,255,0.85)' },
  shine: {
    position: 'absolute',
    left: 9,
    top: 10,
    bottom: 18,
    width: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  rim: {
    borderWidth: 2,
    borderColor: 'rgba(186,230,253,0.55)',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
  },
});

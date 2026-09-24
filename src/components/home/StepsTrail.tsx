import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, G } from 'react-native-svg';

import { font } from '@/theme/typography';
import { palette } from '@/theme/tokens';

const PRINTS = 9;
const LIT = '#fbbf24';
const DIM = 'rgba(255,255,255,0.2)';

/**
 * Today's steps as a trail of footprints walking round an arc.
 *
 * A ring would be the fourth ring on this screen; a trail says "walking"
 * before anyone reads the number. Prints alternate left and right, turn to
 * follow the curve, and light up amber in order as the day's count climbs
 * toward the goal. The leading lit print breathes, so the trail looks like
 * it is still being walked.
 *
 * `percent` is null when this phone has no count; the trail stays dim and the
 * caller puts the reason (or the fix) in the middle.
 */
export function StepsTrail({
  percent,
  children,
  width = 150,
  height = 112,
}: {
  percent: number | null;
  children?: React.ReactNode;
  width?: number;
  height?: number;
}) {
  const lit = percent == null ? 0 : Math.round((Math.max(0, Math.min(100, percent)) / 100) * PRINTS);
  const cx = width / 2;
  const cy = height - 16;
  const r = Math.min(cx - 14, cy - 10);

  const prints = Array.from({ length: PRINTS }, (_, i) => {
    // Left to right across the top: 200° → -20°, measured like a clock face.
    const deg = 200 - (i * 220) / (PRINTS - 1);
    const a = (deg * Math.PI) / 180;
    const x = cx + r * Math.cos(a);
    const y = cy - r * Math.sin(a);
    // Face along the direction of travel (clockwise tangent), toes forward.
    const heading = 90 - deg + 90;
    // Alternate feet: nudge each print off the line, left then right.
    const side = i % 2 === 0 ? -1 : 1;
    const nx = Math.cos(a) * side * 4;
    const ny = -Math.sin(a) * side * 4;
    return { x: x + nx, y: y + ny, heading, on: i < lit, leading: i === lit - 1 };
  });

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        {prints.map((p, i) =>
          p.leading ? null : <Foot key={i} x={p.x} y={p.y} heading={p.heading} color={p.on ? LIT : DIM} />,
        )}
      </Svg>
      {prints.map((p, i) =>
        p.leading ? <LeadingFoot key={i} x={p.x} y={p.y} heading={p.heading} /> : null,
      )}
      <View style={styles.center} pointerEvents="box-none">
        {children}
      </View>
    </View>
  );
}

/** A footprint: sole, heel and four toes, drawn toes-up then rotated. */
function Foot({ x, y, heading, color }: { x: number; y: number; heading: number; color: string }) {
  return (
    <G transform={`translate(${x} ${y}) rotate(${heading}) scale(1.3)`}>
      <Ellipse cx={0} cy={1.5} rx={3.6} ry={5.2} fill={color} />
      <Ellipse cx={0} cy={8.5} rx={2.8} ry={2.6} fill={color} />
      <Circle cx={-2.6} cy={-5.4} r={1.25} fill={color} />
      <Circle cx={-0.6} cy={-6.4} r={1.35} fill={color} />
      <Circle cx={1.5} cy={-6.1} r={1.2} fill={color} />
      <Circle cx={3.2} cy={-4.9} r={1.05} fill={color} />
    </G>
  );
}

/** The most recent print, breathing: the trail is still being walked. */
function LeadingFoot({ x, y, heading }: { x: number; y: number; heading: number }) {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.35, { duration: 700, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 700, easing: Easing.in(Easing.quad) }),
      ),
      -1,
    );
    return () => cancelAnimation(pulse);
  }, [reduced, pulse]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const box = 26;
  return (
    <Animated.View style={[{ position: 'absolute', left: x - box / 2, top: y - box / 2, width: box, height: box }, style]}>
      <Svg width={box} height={box}>
        <Circle cx={box / 2} cy={box / 2} r={10} fill={LIT} opacity={0.18} />
        <Foot x={box / 2} y={box / 2 - 1} heading={heading} color={LIT} />
      </Svg>
    </Animated.View>
  );
}

export const stepsTrailText = StyleSheet.create({
  count: font('extrabold', 22, { color: palette.white }),
  sub: font('semibold', 11, { color: 'rgba(255,255,255,0.6)' }),
});

const styles = StyleSheet.create({
  center: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 6,
    alignItems: 'center',
  },
});

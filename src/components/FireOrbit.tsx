import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

/** Tail → head: a cooling ember at the back, white-hot at the front. */
const TAIL = [239, 68, 68] as const; // red-500
const MID = [249, 115, 22] as const; // orange-500
const HEAD = [250, 204, 21] as const; // yellow-400

const SEGMENTS = 14;
const SPAN_DEG = 120;

function mix(a: readonly number[], b: readonly number[], t: number): string {
  const c = a.map((v, i) => Math.round(v + ((b[i] as number) - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Colour at position t along the flame, 0 = tail, 1 = head. */
function flame(t: number): string {
  return t < 0.5 ? mix(TAIL, MID, t / 0.5) : mix(MID, HEAD, (t - 0.5) / 0.5);
}

/**
 * A comet of fire circling its child — a small, steady "this is live" cue.
 *
 * Built as short arc segments whose colour, width and opacity rise toward the
 * head, rather than one gradient-stroked arc: an SVG linear gradient runs in a
 * straight line, so on a curve it smears; stepping along the arc keeps the
 * tail-to-head fade true all the way round. The whole layer rotates on the UI
 * thread, clockwise so the bright head leads.
 *
 * Still under Reduce Motion — the arc stays drawn so the circle keeps its
 * accent, it just stops travelling.
 */
export function FireOrbit({
  size,
  children,
  durationMs = 2600,
}: {
  size: number;
  children: ReactNode;
  durationMs?: number;
}) {
  const reduced = useReducedMotion();
  const turn = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      cancelAnimation(turn);
      return;
    }
    turn.value = 0;
    turn.value = withRepeat(withTiming(360, { duration: durationMs, easing: Easing.linear }), -1);
    return () => cancelAnimation(turn);
  }, [reduced, durationMs, turn]);

  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));

  const c = size / 2;
  const r = size / 2 - 2;
  const at = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return { x: c + r * Math.sin(a), y: c - r * Math.cos(a) };
  };
  const step = SPAN_DEG / SEGMENTS;
  const head = at(SPAN_DEG);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {children}
      <Animated.View style={[StyleSheet.absoluteFill, spin]} pointerEvents="none">
        <Svg width={size} height={size}>
          {Array.from({ length: SEGMENTS }, (_, i) => {
            const t = (i + 1) / SEGMENTS;
            const p0 = at(i * step);
            // A hair of overlap so the segments join without seams.
            const p1 = at((i + 1) * step + 0.6);
            return (
              <Path
                key={i}
                d={`M ${p0.x} ${p0.y} A ${r} ${r} 0 0 1 ${p1.x} ${p1.y}`}
                stroke={flame(t)}
                strokeWidth={1.2 + 2.4 * t}
                strokeOpacity={Math.pow(t, 1.6)}
                strokeLinecap="round"
                fill="none"
              />
            );
          })}
          {/* The spark: a soft glow under a bright core. */}
          <Circle cx={head.x} cy={head.y} r={4.5} fill={flame(1)} opacity={0.3} />
          <Circle cx={head.x} cy={head.y} r={2.3} fill="#fff7cc" />
        </Svg>
      </Animated.View>
    </View>
  );
}

import { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  Easing,
  ZoomIn,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, LinearGradient, Path, Stop } from 'react-native-svg';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/* Everything is drawn in a 100 × 120 box and scaled to the requested width. */
const VB_W = 100;
const VB_H = 120;
/** Water sits between the soles and the tips of the ears. */
const WATER_BOTTOM = 117;
const WATER_TOP = 12;

/** The bear's parts: two ears, a head and a round belly. */
const BEAR_PARTS: { cx: number; cy: number; r?: number; rx?: number; ry?: number }[] = [
  { cx: 25, cy: 20, r: 13 },
  { cx: 75, cy: 20, r: 13 },
  { cx: 50, cy: 40, r: 30 },
  { cx: 50, cy: 86, rx: 38, ry: 33 },
];

/** The bear, as four shapes whose union is the jar. */
function BearShapes({ fill, stroke, strokeWidth }: { fill: string; stroke?: string; strokeWidth?: number }) {
  const s = stroke ? { stroke, strokeWidth } : {};
  return (
    <>
      <Circle cx={25} cy={20} r={13} fill={fill} {...s} />
      <Circle cx={75} cy={20} r={13} fill={fill} {...s} />
      <Circle cx={50} cy={40} r={30} fill={fill} {...s} />
      <Ellipse cx={50} cy={86} rx={38} ry={33} fill={fill} {...s} />
    </>
  );
}

/**
 * A cute bear-shaped water jar that fills with the day's intake.
 *
 * The jar is the union of four shapes — two ears, a head and a round belly —
 * outlined by drawing them once thick in the outline colour and again filled
 * on top, which leaves only the outer edge. The water is an animated wave
 * clipped to that union, so it fills the ears last, and the face is drawn
 * over the water so the bear always smiles through it.
 *
 * `pourKey` bumping plays a squish-and-bounce, as if water just landed;
 * reaching the goal adds a sparkle. Tilt comes from the card's gravity sensor.
 */
export function BearJar({
  id,
  percent,
  width,
  tint,
  tilt,
  phase,
  pourKey,
  met,
}: {
  /** Unique per jar — SVG ids are global. */
  id: string;
  percent: number;
  width: number;
  /** Cheek and inner-ear colour: each bear its own personality. */
  tint: string;
  tilt: SharedValue<number>;
  phase: SharedValue<number>;
  pourKey: number;
  met: boolean;
}) {
  const reduced = useReducedMotion();
  const height = (width * VB_H) / VB_W;
  const fill = Math.max(0, Math.min(100, percent)) / 100;

  const level = useSharedValue(fill);
  useEffect(() => {
    level.value = reduced ? withTiming(fill, { duration: 250 }) : withSpring(fill, { damping: 11, stiffness: 55 });
  }, [fill, reduced, level]);

  /* Squish on a pour: a quick squash, then a springy stand-up. */
  const squish = useSharedValue(0);
  useEffect(() => {
    if (pourKey === 0 || reduced) return;
    squish.set(withSequence(withTiming(1, { duration: 140 }), withSpring(0, { damping: 6, stiffness: 180 })));
  }, [pourKey, reduced, squish]);
  const body = useAnimatedStyle(() => ({
    transform: [
      { translateY: squish.value * 6 },
      { scaleX: 1 + squish.value * 0.07 },
      { scaleY: 1 - squish.value * 0.07 },
    ],
  }));

  /* A gentle idle sway, so the bears look alive while nothing happens. */
  const sway = useSharedValue(0);
  useEffect(() => {
    if (reduced) {
      cancelAnimation(sway);
      return;
    }
    sway.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(sway);
  }, [reduced, sway]);
  const swayStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${(sway.value - 0.5) * 4}deg` }] }));

  const back = useWave(level, phase, tilt, 3.2, -1, 1.7);
  const front = useWave(level, phase, tilt, 4, 1, 0);

  const clip = `bear-clip-${id}`;
  const water = `bear-water-${id}`;
  const glass = `bear-glass-${id}`;

  return (
    <Animated.View style={[{ width, height }, swayStyle]}>
      <Animated.View style={[StyleSheet.absoluteFill, body]}>
        <Svg width={width} height={height} viewBox={`0 0 ${VB_W} ${VB_H}`}>
          <Defs>
            {/* One clip per part. Android draws overlapping clip children
                (and unioned sub-paths) as cut-outs, leaving white bands where
                the head meets the belly; single shapes clip reliably, and the
                water is simply drawn once per part. */}
            {BEAR_PARTS.map((part, i) => (
              <ClipPath key={i} id={`${clip}-${i}`}>
                {part.r != null ? (
                  <Circle cx={part.cx} cy={part.cy} r={part.r} />
                ) : (
                  <Ellipse cx={part.cx} cy={part.cy} rx={part.rx} ry={part.ry} />
                )}
              </ClipPath>
            ))}
            <LinearGradient id={water} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#a5f3fc" />
              <Stop offset="0.4" stopColor="#38bdf8" />
              <Stop offset="1" stopColor="#2563eb" />
            </LinearGradient>
            <LinearGradient id={glass} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#ffffff" stopOpacity={0.95} />
              <Stop offset="1" stopColor="#e0f2fe" stopOpacity={0.9} />
            </LinearGradient>
          </Defs>

          {/* Outline: shapes stroked thick, then filled over — only the rim remains. */}
          <BearShapes fill="#bfdbfe" stroke="#93c5fd" strokeWidth={5} />
          <BearShapes fill={`url(#${glass})`} />

          {/* Inner ears. */}
          <Circle cx={25} cy={20} r={6.5} fill={tint} opacity={0.55} />
          <Circle cx={75} cy={20} r={6.5} fill={tint} opacity={0.55} />

          {/* Water, clipped to the bear. */}
          {BEAR_PARTS.map((_, i) => (
            <G key={i} clipPath={`url(#${clip}-${i})`}>
              {/* Solid, not translucent: overlapping parts draw it twice. */}
              <AnimatedPath animatedProps={back} fill="#93d8fb" />
              <AnimatedPath animatedProps={front} fill={`url(#${water})`} />
            </G>
          ))}

          {/* Glass shine down the belly and on the head. */}
          <Path d="M 22 74 Q 18 90 26 104" stroke="#ffffff" strokeOpacity={0.7} strokeWidth={3.2} fill="none" strokeLinecap="round" />
          <Path d="M 30 24 Q 34 18 40 16" stroke="#ffffff" strokeOpacity={0.75} strokeWidth={2.6} fill="none" strokeLinecap="round" />

          {/* Face, always above the water. */}
          <Ellipse cx={40} cy={40} rx={3.6} ry={4.4} fill="#1e293b" />
          <Ellipse cx={60} cy={40} rx={3.6} ry={4.4} fill="#1e293b" />
          <Circle cx={41.3} cy={38.4} r={1.2} fill="#ffffff" />
          <Circle cx={61.3} cy={38.4} r={1.2} fill="#ffffff" />
          <Ellipse cx={50} cy={50} rx={9} ry={6.5} fill="#ffffff" opacity={0.85} />
          <Ellipse cx={50} cy={48} rx={3.2} ry={2.3} fill="#1e293b" />
          <Path d="M 46.5 52 Q 50 55.5 53.5 52" stroke="#1e293b" strokeWidth={1.4} fill="none" strokeLinecap="round" />
          <Ellipse cx={31} cy={50} rx={5} ry={3} fill={tint} opacity={0.6} />
          <Ellipse cx={69} cy={50} rx={5} ry={3} fill={tint} opacity={0.6} />
        </Svg>
      </Animated.View>

      {met ? (
        <Animated.View entering={ZoomIn.springify()} style={styles.sparkle} pointerEvents="none">
          <Text style={styles.sparkleText}>✨</Text>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

function useWave(
  level: SharedValue<number>,
  phase: SharedValue<number>,
  tilt: SharedValue<number>,
  amp: number,
  direction: 1 | -1,
  offset: number,
) {
  return useAnimatedProps(() => {
    const base = WATER_BOTTOM - level.value * (WATER_BOTTOM - WATER_TOP);
    let d = '';
    for (let i = 0; i <= 20; i++) {
      const x = (i / 20) * VB_W;
      const y =
        base +
        amp * Math.sin((i / 20) * 2 * Math.PI * 1.2 + direction * phase.value + offset) +
        tilt.value * 0.45 * (x - VB_W / 2);
      d += `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)} `;
    }
    return { d: `${d} L ${VB_W} ${VB_H + 10} L 0 ${VB_H + 10} Z` };
  });
}

const styles = StyleSheet.create({
  sparkle: { position: 'absolute', top: -6, right: -4 },
  sparkleText: { fontSize: 22 },
});

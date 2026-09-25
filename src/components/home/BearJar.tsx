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
  theme,
  layers,
  tilt,
  phase,
  pourKey,
  met,
  moods = false,
}: {
  /** Unique per jar — SVG ids are global. */
  id: string;
  percent: number;
  width: number;
  /** Each bear its own colour: glass body, rim, and cheeks / inner ears. */
  theme: BearTheme;
  /**
   * What is in the bear, bottom to top, each layer's share of the total.
   * Empty or absent reads as all water.
   */
  layers?: readonly { color: string; share: number }[];
  tilt: SharedValue<number>;
  phase: SharedValue<number>;
  pourKey: number;
  met: boolean;
  /**
   * The widget's moods: asleep while empty, overjoyed at the goal — so the
   * in-app previews wake the bears exactly when the home-screen widget does.
   */
  moods?: boolean;
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

  /* Cumulative top of each layer as a share of the total, in fixed slots so
     the hook count never changes; unused slots sit at 0 (invisible). */
  const slots = layerSlots(layers);
  const tops = useSharedValue<number[]>(slots.map((l) => l.top));
  const topsKey = slots.map((l) => l.top.toFixed(4)).join(',');
  useEffect(() => {
    const next = topsKey.split(',').map(Number);
    tops.value = reduced ? next : withTiming(next, { duration: 450 });
  }, [topsKey, reduced, tops]);

  const w0 = useLayerWave(level, tops, 0, phase, tilt);
  const w1 = useLayerWave(level, tops, 1, phase, tilt);
  const w2 = useLayerWave(level, tops, 2, phase, tilt);
  const w3 = useLayerWave(level, tops, 3, phase, tilt);
  const w4 = useLayerWave(level, tops, 4, phase, tilt);
  const w5 = useLayerWave(level, tops, 5, phase, tilt);
  const waves = [w0, w1, w2, w3, w4, w5];

  const clip = `bear-clip-${id}`;
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
            {/* Each drink's colour with depth baked in — lighter up top, deeper
                below, across the whole bear — so a full bear reads as glass
                of liquid, not a flat block. Opaque, so parts that overlap
                draw identical pixels and no seam appears. */}
            {slots.map((slot, k) =>
              slot.top > 0 ? (
                <LinearGradient
                  key={k}
                  id={`${id}-liquid-${k}`}
                  x1={0}
                  y1={0}
                  x2={0}
                  y2={VB_H}
                  gradientUnits="userSpaceOnUse"
                >
                  <Stop offset={0} stopColor={mix(slot.color, '#ffffff', 0.28)} />
                  <Stop offset={0.55} stopColor={slot.color} />
                  <Stop offset={1} stopColor={mix(slot.color, '#0b1b3f', 0.22)} />
                </LinearGradient>
              ) : null,
            )}
            <LinearGradient id={glass} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#ffffff" stopOpacity={0.95} />
              <Stop offset="1" stopColor={theme.body} stopOpacity={0.95} />
            </LinearGradient>
          </Defs>

          {/* Outline: shapes stroked thick, then filled over — only the rim remains. */}
          <BearShapes fill={theme.rim} stroke={theme.rim} strokeWidth={5} />
          <BearShapes fill={`url(#${glass})`} />

          {/* Inner ears. */}
          <Circle cx={25} cy={20} r={6.5} fill={theme.tint} opacity={0.55} />
          <Circle cx={75} cy={20} r={6.5} fill={theme.tint} opacity={0.55} />

          {/* Water, clipped to the bear. */}
          {/* The drinks, clipped per part. Highest layer first, each lower
              layer painted over its lower share, so every band shows with
              its own wavy top. */}
          {BEAR_PARTS.map((_, i) => (
            <G key={i} clipPath={`url(#${clip}-${i})`}>
              {[5, 4, 3, 2, 1, 0].map((k) => (
                <AnimatedPath
                  key={k}
                  animatedProps={waves[k]}
                  fill={slots[k]!.top > 0 ? `url(#${id}-liquid-${k})` : 'transparent'}
                />
              ))}
            </G>
          ))}


          {/* Glass shine down the belly and on the head. */}
          <Path d="M 22 74 Q 18 90 26 104" stroke="#ffffff" strokeOpacity={0.7} strokeWidth={3.2} fill="none" strokeLinecap="round" />
          <Path d="M 30 24 Q 34 18 40 16" stroke="#ffffff" strokeOpacity={0.75} strokeWidth={2.6} fill="none" strokeLinecap="round" />

          {/* Face, always above the water. */}
          {moods && fill <= 0 ? (
            <>
              <Path d="M 36 40 Q 40 44.5 44 40" stroke="#1e293b" strokeWidth={2.4} fill="none" strokeLinecap="round" />
              <Path d="M 56 40 Q 60 44.5 64 40" stroke="#1e293b" strokeWidth={2.4} fill="none" strokeLinecap="round" />
              <Path d="M 81 11 L 86 11 L 81 16 L 86 16" stroke={theme.rim} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <Path d="M 89 2 L 96 2 L 89 9 L 96 9" stroke={theme.rim} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </>
          ) : moods && met ? (
            <>
              <Path d="M 36 42 Q 40 35 44 42" stroke="#1e293b" strokeWidth={2.6} fill="none" strokeLinecap="round" />
              <Path d="M 56 42 Q 60 35 64 42" stroke="#1e293b" strokeWidth={2.6} fill="none" strokeLinecap="round" />
            </>
          ) : (
            <>
              <Ellipse cx={40} cy={40} rx={3.6} ry={4.4} fill="#1e293b" />
              <Ellipse cx={60} cy={40} rx={3.6} ry={4.4} fill="#1e293b" />
              <Circle cx={41.3} cy={38.4} r={1.2} fill="#ffffff" />
              <Circle cx={61.3} cy={38.4} r={1.2} fill="#ffffff" />
            </>
          )}
          <Ellipse cx={50} cy={50} rx={9} ry={6.5} fill="#ffffff" opacity={0.85} />
          <Ellipse cx={50} cy={48} rx={3.2} ry={2.3} fill="#1e293b" />
          {moods && fill <= 0 ? (
            <Path d="M 48 53 L 52 53" stroke="#1e293b" strokeWidth={1.6} strokeLinecap="round" />
          ) : moods && met ? (
            <Path d="M 45 51.5 Q 50 60 55 51.5 Z" fill="#1e293b" />
          ) : (
            <Path d="M 46.5 52 Q 50 55.5 53.5 52" stroke="#1e293b" strokeWidth={1.4} fill="none" strokeLinecap="round" />
          )}
          <Ellipse cx={31} cy={50} rx={5} ry={3} fill={theme.tint} opacity={0.6} />
          <Ellipse cx={69} cy={50} rx={5} ry={3} fill={theme.tint} opacity={0.6} />
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

export interface BearTheme {
  /** Glass tint toward the bottom of the jar. */
  body: string;
  rim: string;
  /** Cheeks and inner ears. */
  tint: string;
}

const WATER = '#38bdf8';

/** Blend two #rrggbb colours; `t` is the share of `b`. */
function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) =>
    Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}
const SLOTS = 6;

/** Layers as fixed slots with cumulative tops; empty slots have top 0. */
function layerSlots(layers?: readonly { color: string; share: number }[]) {
  const list = layers && layers.length > 0 ? layers.slice(-SLOTS) : [{ color: WATER, share: 1 }];
  const total = list.reduce((s, l) => s + l.share, 0) || 1;
  let acc = 0;
  const out = list.map((l) => {
    acc += l.share / total;
    return { color: l.color, top: Math.min(1, acc) };
  });
  while (out.length < SLOTS) out.push({ color: 'transparent', top: 0 });
  return out;
}

/** One layer's wavy top at its share of the level, filled to the floor. */
function useLayerWave(
  level: SharedValue<number>,
  tops: SharedValue<number[]>,
  k: number,
  phase: SharedValue<number>,
  tilt: SharedValue<number>,
) {
  return useAnimatedProps(() => {
    const top = tops.value[k] ?? 0;
    if (top <= 0) return { d: '' };
    const frac = level.value * top;
    /* Empty is empty: a resting wave's crest would still show a sliver. An
       off-canvas path rather than '' — react-native-svg ignores an empty
       `d` and keeps drawing the last one, so a bear draining to zero would
       freeze on its final sliver. */
    if (frac <= 0.002) return { d: `M 0 ${VB_H + 20} L 1 ${VB_H + 20} Z` };
    const base = WATER_BOTTOM - frac * (WATER_BOTTOM - WATER_TOP);
    // Lower boundaries ripple less than the open surface, and a nearly empty
    // bear's wave settles flat rather than slopping above its own level.
    let topmost = 0;
    for (let j = 0; j < tops.value.length; j++) if ((tops.value[j] ?? 0) > 0) topmost = j;
    const amp = (k === topmost ? 3.6 : 1.8) * Math.min(1, frac * 12);
    let d = '';
    for (let i = 0; i <= 20; i++) {
      const x = (i / 20) * VB_W;
      const y =
        base +
        amp * Math.sin((i / 20) * 2 * Math.PI * 1.2 + phase.value + k * 1.3) +
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

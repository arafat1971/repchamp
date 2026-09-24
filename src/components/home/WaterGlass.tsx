import { useEffect } from 'react';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * A real tumbler of water that fills with the day's intake.
 *
 * Shaped like the glass on a kitchen table rather than a box: walls that
 * taper toward a thick glass base, an elliptical rim seen slightly from above,
 * and a highlight down the curve. Everything wet is drawn inside a clip of
 * the glass's inner wall, so the water takes the glass's shape at any level.
 *
 * Real-water cues, each doing one job:
 * - two sine waves at different speeds and opacities, so the surface has
 *   depth rather than reading as a flat bar;
 * - a lit meniscus ellipse on the surface, sized to the glass's width at that
 *   height — the taper is visible in the water itself;
 * - the level springs to its new height with a small overshoot, so a logged
 *   drink looks poured and an undo drains;
 * - bubbles rising through the water on staggered loops.
 *
 * The waves are animated SVG paths rebuilt on the UI thread each frame; under
 * Reduce Motion they settle flat and the level moves without the bounce.
 */
export function WaterGlass({
  percent,
  id,
  width = 84,
  height = 122,
}: {
  percent: number;
  /** Unique per glass on screen — SVG clip and gradient ids are global. */
  id: string;
  width?: number;
  height?: number;
}) {
  const reduced = useReducedMotion();
  const fill = Math.max(0, Math.min(100, percent)) / 100;

  const W = width;
  const H = height;
  const rimY = 9;
  const rimRy = 5;
  const baseTop = H - 14;
  const topHalf = W / 2 - 2;
  const botHalf = W * 0.33;
  const cx = W / 2;
  const inset = 3;

  /* Water can sit between just above the base and just under the rim. */
  const minY = baseTop;
  const maxY = rimY + 10;

  const level = useSharedValue(minY);
  useEffect(() => {
    const target = fill === 0 ? minY + 2 : minY - fill * (minY - maxY);
    level.value = reduced
      ? withTiming(target, { duration: 250 })
      : withSpring(target, { damping: 9, stiffness: 70, mass: 0.9 });
  }, [fill, reduced, level, minY, maxY]);

  const phase = useSharedValue(0);
  const amp = useSharedValue(reduced ? 0 : 1);
  useEffect(() => {
    amp.value = withTiming(reduced ? 0 : 1, { duration: 300 });
    if (reduced) {
      cancelAnimation(phase);
      return;
    }
    phase.value = withRepeat(withTiming(2 * Math.PI, { duration: 2600, easing: Easing.linear }), -1);
    return () => cancelAnimation(phase);
  }, [reduced, phase, amp]);

  /* Outer silhouette: rim ellipse's front edge down tapered walls to a
     rounded base. Inner wall is the same, inset, stopping at the base. */
  const halfAt = (y: number) => topHalf + ((botHalf - topHalf) * (y - rimY)) / (H - 2 - rimY);
  const outer = [
    `M ${cx - topHalf} ${rimY}`,
    `L ${cx - botHalf} ${H - 8}`,
    `Q ${cx - botHalf} ${H - 1} ${cx - botHalf + 7} ${H - 1}`,
    `L ${cx + botHalf - 7} ${H - 1}`,
    `Q ${cx + botHalf} ${H - 1} ${cx + botHalf} ${H - 8}`,
    `L ${cx + topHalf} ${rimY}`,
  ].join(' ');
  const innerBotHalf = halfAt(baseTop) - inset;
  const inner = [
    `M ${cx - topHalf + inset} ${rimY}`,
    `L ${cx - innerBotHalf} ${baseTop - 4}`,
    `Q ${cx - innerBotHalf} ${baseTop} ${cx - innerBotHalf + 4} ${baseTop}`,
    `L ${cx + innerBotHalf - 4} ${baseTop}`,
    `Q ${cx + innerBotHalf} ${baseTop} ${cx + innerBotHalf} ${baseTop - 4}`,
    `L ${cx + topHalf - inset} ${rimY}`,
    'Z',
  ].join(' ');

  const front = useWave(level, phase, amp, W, H, 3.2, 1, 0);
  const back = useWave(level, phase, amp, W, H, 2.6, -1, 1.7);

  const meniscus = useAnimatedProps(() => {
    const y = level.value;
    const half = topHalf + ((botHalf - topHalf) * (y - rimY)) / (H - 2 - rimY) - inset;
    return { cy: y, rx: Math.max(0, half), ry: 3.2, opacity: y >= minY ? 0 : 0.55 };
  });

  const clip = `glass-clip-${id}`;
  const water = `glass-water-${id}`;
  const body = `glass-body-${id}`;

  return (
    <Svg width={W} height={H}>
      <Defs>
        <ClipPath id={clip}>
          <Path d={inner} />
        </ClipPath>
        <LinearGradient id={water} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#7dd3fc" />
          <Stop offset="0.35" stopColor="#3b82f6" />
          <Stop offset="1" stopColor="#1e3a8a" />
        </LinearGradient>
        <LinearGradient id={body} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#ffffff" stopOpacity={0.14} />
          <Stop offset="0.5" stopColor="#ffffff" stopOpacity={0.04} />
          <Stop offset="1" stopColor="#ffffff" stopOpacity={0.12} />
        </LinearGradient>
      </Defs>

      {/* Back half of the rim — seen through the glass, so fainter. */}
      <Path
        d={`M ${cx - topHalf} ${rimY} A ${topHalf} ${rimRy} 0 0 1 ${cx + topHalf} ${rimY}`}
        stroke="rgba(186,230,253,0.35)"
        strokeWidth={1.5}
        fill="none"
      />

      {/* The glass itself: faint body tint, then everything wet, clipped. */}
      <Path d={outer} fill={`url(#${body})`} />
      <G clipPath={`url(#${clip})`}>
        <AnimatedPath animatedProps={back} fill="#60a5fa" opacity={0.5} />
        <AnimatedPath animatedProps={front} fill={`url(#${water})`} />
        <AnimatedEllipse animatedProps={meniscus} cx={cx} fill="#bae6fd" />
        {fill > 0 ? (
          <>
            <Bubble level={level} x={cx - 12} r={2.2} delay={0} dur={2400} bottom={baseTop} reduced={reduced} />
            <Bubble level={level} x={cx + 6} r={1.6} delay={800} dur={1900} bottom={baseTop} reduced={reduced} />
            <Bubble level={level} x={cx + 15} r={2} delay={1500} dur={2700} bottom={baseTop} reduced={reduced} />
          </>
        ) : null}
      </G>

      {/* Thick glass base, with a lit top edge. */}
      <Path
        d={`M ${cx - innerBotHalf} ${baseTop} L ${cx + innerBotHalf} ${baseTop} L ${cx + botHalf - 2} ${H - 3} L ${cx - botHalf + 2} ${H - 3} Z`}
        fill="rgba(255,255,255,0.10)"
      />
      <Rect x={cx - innerBotHalf + 4} y={baseTop} width={innerBotHalf * 2 - 8} height={1.4} fill="rgba(255,255,255,0.35)" rx={0.7} />

      {/* Walls and the front of the rim, drawn over the water. */}
      <Path d={outer} stroke="rgba(186,230,253,0.6)" strokeWidth={1.8} fill="none" strokeLinejoin="round" />
      <Path
        d={`M ${cx - topHalf} ${rimY} A ${topHalf} ${rimRy} 0 0 0 ${cx + topHalf} ${rimY}`}
        stroke="rgba(224,242,254,0.8)"
        strokeWidth={1.8}
        fill="none"
      />

      {/* Highlights: a long streak down the left curve, a short one right. */}
      <Path
        d={`M ${cx - topHalf + 7} ${rimY + 9} L ${cx - botHalf + 5} ${H - 20}`}
        stroke="rgba(255,255,255,0.35)"
        strokeWidth={3.2}
        strokeLinecap="round"
      />
      <Path
        d={`M ${cx + topHalf - 8} ${rimY + 12} L ${cx + topHalf - 11} ${rimY + 32}`}
        stroke="rgba(255,255,255,0.22)"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** One animated wave band: a sine surface at the level, filled to the floor. */
function useWave(
  level: SharedValue<number>,
  phase: SharedValue<number>,
  amp: SharedValue<number>,
  W: number,
  H: number,
  height: number,
  direction: 1 | -1,
  offset: number,
) {
  return useAnimatedProps(() => {
    const steps = 20;
    const a = height * amp.value;
    let d = '';
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * W;
      const y =
        level.value + a * Math.sin((i / steps) * 2 * Math.PI * 1.2 + direction * phase.value + offset);
      d += `${i === 0 ? 'M' : 'L'} ${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10} `;
    }
    d += `L ${W} ${H} L 0 ${H} Z`;
    return { d };
  });
}

function Bubble({
  level,
  x,
  r,
  delay,
  dur,
  bottom,
  reduced,
}: {
  level: SharedValue<number>;
  x: number;
  r: number;
  delay: number;
  dur: number;
  bottom: number;
  reduced: boolean;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    t.value = withDelay(
      delay,
      withRepeat(
        withSequence(withTiming(1, { duration: dur, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 0 })),
        -1,
      ),
    );
    return () => cancelAnimation(t);
  }, [reduced, delay, dur, t]);

  const props = useAnimatedProps(() => {
    const top = level.value + 5;
    const y = bottom - 3 - t.value * Math.max(0, bottom - 3 - top);
    return {
      cy: y,
      cx: x + Math.sin(t.value * 7) * 2,
      opacity: t.value === 0 || bottom - top < 8 ? 0 : 0.75 * (1 - t.value * 0.7),
    };
  });
  return <AnimatedCircle animatedProps={props} r={r} fill="rgba(255,255,255,0.85)" />;
}

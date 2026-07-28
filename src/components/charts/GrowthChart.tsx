import { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  Stop,
} from 'react-native-svg';

import { palette } from '@/theme/tokens';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * An iOS-style animated growth chart — a smooth (Catmull-Rom) curve with a soft
 * gradient area fill that draws itself in on mount, the way Apple's Health and
 * Fitness cards do. Built on `react-native-svg` + Reanimated so the stroke
 * animates on the UI thread with no extra dependency.
 *
 * Purely decorative/illustrative: it visualises an upward trend for the
 * onboarding value screen, it is not plotting real user data.
 */
export function GrowthChart({
  data,
  width = 300,
  height = 150,
  color = palette.green500,
  fillColor = palette.green500,
  delay = 250,
}: {
  /** Y values, low→high index left→right. Scaled to fit automatically. */
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fillColor?: string;
  delay?: number;
}) {
  const PAD_X = 10;
  const PAD_TOP = 14;
  const PAD_BOTTOM = 14;

  const { linePath, areaPath, points, length } = useMemo(
    () => buildPaths(data, width, height, PAD_X, PAD_TOP, PAD_BOTTOM),
    [data, width, height],
  );

  // Draw-on progress, 0→1, shared across the stroke dash and the dot reveal.
  const progress = useSharedValue(0);
  const areaOpacity = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) }),
    );
    areaOpacity.value = withDelay(
      delay + 250,
      withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }),
    );
  }, [progress, areaOpacity, delay, data]);

  const strokeProps = useAnimatedProps(() => ({
    strokeDashoffset: length * (1 - progress.value),
  }));
  const areaProps = useAnimatedProps(() => ({ opacity: areaOpacity.value * 0.9 }));

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Defs>
          <SvgLinearGradient id="growthArea" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={fillColor} stopOpacity={0.28} />
            <Stop offset="1" stopColor={fillColor} stopOpacity={0} />
          </SvgLinearGradient>
        </Defs>

        {/* Soft gradient area under the line, fading in just behind the stroke. */}
        <AnimatedPath d={areaPath} fill="url(#growthArea)" animatedProps={areaProps} />

        {/* The line itself, drawn on via an animated dash offset. */}
        <AnimatedPath
          d={linePath}
          stroke={color}
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          strokeDasharray={length}
          animatedProps={strokeProps}
        />

        {/* Data dots — the last one is emphasised as the "you now" marker. */}
        {points.map((p, i) => (
          <Dot
            key={i}
            cx={p.x}
            cy={p.y}
            color={color}
            emphasised={i === points.length - 1}
            delay={delay + 350 + i * 110}
          />
        ))}
      </Svg>
    </View>
  );
}

/** A single data dot that pops in after the line reaches it. */
function Dot({
  cx,
  cy,
  color,
  emphasised,
  delay,
}: {
  cx: number;
  cy: number;
  color: string;
  emphasised: boolean;
  delay: number;
}) {
  const scale = useSharedValue(0);
  useEffect(() => {
    scale.value = withDelay(delay, withTiming(1, { duration: 320, easing: Easing.out(Easing.back(2)) }));
  }, [scale, delay]);

  const props = useAnimatedProps(() => ({ r: (emphasised ? 5.5 : 3.5) * scale.value }));
  const haloProps = useAnimatedProps(() => ({ r: 10 * scale.value, opacity: 0.18 * scale.value }));

  return (
    <>
      {emphasised ? <AnimatedCircle cx={cx} cy={cy} fill={color} animatedProps={haloProps} /> : null}
      <AnimatedCircle cx={cx} cy={cy} fill={emphasised ? color : palette.white} stroke={color} strokeWidth={2.5} animatedProps={props} />
    </>
  );
}

/**
 * Build the smooth line + closed area paths and total stroke length.
 *
 * Uses a Catmull-Rom → cubic-Bézier conversion so the curve passes through
 * every point while staying smooth (the look Apple's charts use), rather than
 * the angular polyline a naive line-to would give.
 */
function buildPaths(
  data: number[],
  width: number,
  height: number,
  padX: number,
  padTop: number,
  padBottom: number,
) {
  const n = data.length;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;

  const innerW = width - padX * 2;
  const innerH = height - padTop - padBottom;

  const points = data.map((v, i) => ({
    x: padX + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW),
    y: padTop + innerH - ((v - min) / span) * innerH,
  }));

  // Catmull-Rom to cubic Bézier for a curve that passes through each point.
  let linePath = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i - 1] ?? points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    linePath += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }

  const baseline = padTop + innerH;
  const areaPath = `${linePath} L ${points[n - 1]!.x} ${baseline} L ${points[0]!.x} ${baseline} Z`;

  // Approximate stroke length for the draw-on dash (curve is close to the
  // straight-segment sum; the small under-estimate is invisible at this size).
  let length = 0;
  for (let i = 1; i < n; i++) {
    length += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  }
  length *= 1.15; // pad for curvature so the line fully hides before drawing

  return { linePath, areaPath, points, length };
}

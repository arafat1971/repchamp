import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { BearJar, type BearTheme } from '@/components/home/BearJar';
import type { WidgetStyle, WidgetTheme } from '@/domain/waterWidget';
import { font } from '@/theme/typography';

/**
 * The "Partner today" widget, drawn in the app.
 *
 * Same card, rings, bear and rows as the home-screen widget, following the
 * same style switches — so the settings screen and onboarding show exactly
 * what will be placed, and every switch visibly does something. The rings
 * sweep in, a glint orbits them and the LIVE dot beats while `motion` is on,
 * the way the real widget does after the partner has been active.
 */

export interface WidgetPreviewData {
  name: string;
  water: { value: string; goal: string; you: string; pct: number };
  steps: { value: string; goal: string; you: string; pct: number };
  reps: { value: string; goal: string; you: string; pct: number };
  footer: string;
  /** The partner was active in the last few minutes — shows the LIVE pill. */
  live?: boolean;
}

/** Believable numbers for when there is no partner yet. */
export const SAMPLE_PREVIEW: WidgetPreviewData = {
  name: 'Alex',
  water: { value: '1.4 L', goal: 'of 2 L', you: '1 L', pct: 0.7 },
  steps: { value: '6,120', goal: 'of 8,000 steps', you: '4,100', pct: 0.76 },
  reps: { value: '112', goal: 'reps · Squat', you: '40', pct: 1 },
  footer: '🧃 Juice · 250 ml · just now',
  live: true,
};

interface Look {
  bg: readonly [string, string];
  text: string;
  secondary: string;
  chip: string;
  water: string;
  steps: string;
  reps: string;
  border: string;
}

/* Mirrors the native Palette; "auto" previews the app's light scheme. */
const LOOKS: Record<WidgetTheme, Look> = {
  auto: {
    bg: ['#FFFFFF', '#FFFFFF'],
    text: '#000000',
    secondary: '#8A8A8E',
    chip: '#F2F2F7',
    water: '#0A7CC4',
    steps: '#248A3D',
    reps: '#E0184A',
    border: '#E5E7EB',
  },
  light: {
    bg: ['#FFFFFF', '#FFFFFF'],
    text: '#000000',
    secondary: '#8A8A8E',
    chip: '#F2F2F7',
    water: '#0A7CC4',
    steps: '#248A3D',
    reps: '#E0184A',
    border: '#E5E7EB',
  },
  dark: {
    bg: ['#1C1C1E', '#1C1C1E'],
    text: '#FFFFFF',
    secondary: '#98989F',
    chip: '#2C2C2E',
    water: '#64D2FF',
    steps: '#30D158',
    reps: '#FF375F',
    border: '#1C1C1E',
  },
  ocean: {
    bg: ['#1E1B4B', '#0C4A6E'],
    text: '#FFFFFF',
    secondary: '#C7D2FE',
    chip: 'rgba(255,255,255,0.15)',
    water: '#7DD3FC',
    steps: '#86EFAC',
    reps: '#FDA4AF',
    border: '#1E1B4B',
  },
};

/** Card swatch colours, for theme pickers. */
export const THEME_SWATCH: Record<WidgetTheme, readonly [string, string]> = {
  auto: ['#FFFFFF', '#1C1C1E'],
  light: LOOKS.light.bg,
  dark: LOOKS.dark.bg,
  ocean: LOOKS.ocean.bg,
};

const RING_COLORS = {
  water: ['#32ADE6', '#64D2FF'],
  steps: ['#30D158', '#A8F06C'],
  reps: ['#FF2D55', '#FF7A9A'],
} as const;

const PARTNER_BEAR: BearTheme = { body: '#e6e8ff', rim: '#a5b4fc', tint: '#8b5cf6' };

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function WidgetPreview({
  style,
  data = SAMPLE_PREVIEW,
  width,
}: {
  style: WidgetStyle;
  data?: WidgetPreviewData;
  /** The card's width; its height follows the widget's 4 x 2 proportions. */
  width: number;
}) {
  const reduced = useReducedMotion();
  const look = LOOKS[style.theme];
  const moving = style.motion && !reduced;
  const ringSize = Math.min(128, width * 0.37);

  /* One shared sweep, so the rings fill together whenever the card appears
     or a style changes which rings exist. */
  const sweep = useSharedValue(0);
  useEffect(() => {
    sweep.set(0);
    sweep.set(withDelay(120, withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) })));
  }, [sweep, style.showSteps, style.showReps, style.theme]);

  /* The bear sloshes gently, as on Home. */
  const tilt = useSharedValue(0);
  const phase = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    phase.set(withRepeat(withTiming(2 * Math.PI, { duration: 3000, easing: Easing.linear }), -1));
    return () => cancelAnimation(phase);
  }, [reduced, phase]);

  return (
    <View style={[styles.card, { width, borderColor: look.border }]}>
      <View style={[StyleSheet.absoluteFill, styles.bg, { backgroundColor: look.bg[0] }]}>
        {look.bg[0] !== look.bg[1] ? (
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id="wp-ocean" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={look.bg[0]} />
                <Stop offset="0.5" stopColor="#1E3A8A" />
                <Stop offset="1" stopColor={look.bg[1]} />
              </LinearGradient>
            </Defs>
            <Circle cx="50%" cy="50%" r="200%" fill="url(#wp-ocean)" />
          </Svg>
        ) : null}
      </View>

      <View style={[styles.rings, { width: ringSize, height: ringSize }]}>
        <Svg width={ringSize} height={ringSize} viewBox="0 0 100 100">
          {style.showReps ? <Ring r={45.75} pct={data.reps.pct} colors={RING_COLORS.reps} sweep={sweep} /> : null}
          {style.showSteps ? <Ring r={35.5} pct={data.steps.pct} colors={RING_COLORS.steps} sweep={sweep} /> : null}
          <Ring r={25.25} pct={data.water.pct} colors={RING_COLORS.water} sweep={sweep} />
        </Svg>
        {moving ? <Orbit size={ringSize} /> : null}
        <View style={styles.bear} pointerEvents="none">
          <BearJar
            id="widget-preview"
            percent={data.water.pct * 100}
            width={ringSize * 0.27}
            theme={PARTNER_BEAR}
            tilt={tilt}
            phase={phase}
            pourKey={0}
            met={data.water.pct >= 1}
          />
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.head}>
          <Text style={[styles.title, { color: look.text }]} numberOfLines={1}>
            {data.name} · Today
          </Text>
          {moving && data.live ? <LivePill /> : null}
        </View>
        <Row metric={data.water} tint={look.water} look={look} showMine={style.showMine} />
        {style.showSteps ? <Row metric={data.steps} tint={look.steps} look={look} showMine={style.showMine} /> : null}
        {style.showReps ? <Row metric={data.reps} tint={look.reps} look={look} showMine={style.showMine} /> : null}
        <Text style={[styles.footer, { color: look.secondary }]} numberOfLines={1}>
          {data.footer}
        </Text>
      </View>
    </View>
  );
}

function Ring({
  r,
  pct,
  colors,
  sweep,
}: {
  r: number;
  pct: number;
  colors: readonly [string, string];
  sweep: ReturnType<typeof useSharedValue<number>>;
}) {
  const circumference = 2 * Math.PI * r;
  const target = Math.max(0, Math.min(1, pct));
  const props = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - target * sweep.value),
  }));
  const id = `wp-ring-${Math.round(r)}`;
  return (
    <>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={colors[0]} />
          <Stop offset="1" stopColor={colors[1]} />
        </LinearGradient>
      </Defs>
      <Circle cx={50} cy={50} r={r} stroke={colors[0]} strokeOpacity={0.2} strokeWidth={8.5} fill="none" />
      {target > 0 ? (
        <AnimatedCircle
          cx={50}
          cy={50}
          r={r}
          stroke={`url(#${id})`}
          strokeWidth={8.5}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={props}
          transform="rotate(-90 50 50)"
        />
      ) : null}
    </>
  );
}

/** A comet riding the outer ring — the widget's orbiting glint. */
function Orbit({ size }: { size: number }) {
  const turn = useSharedValue(0);
  useEffect(() => {
    turn.set(withRepeat(withTiming(1, { duration: 2600, easing: Easing.linear }), -1));
    return () => cancelAnimation(turn);
  }, [turn]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 360}deg` }] }));
  const r = 45.75;
  const tail = [0, 1, 2, 3, 4, 5].map((i) => {
    const a = ((-40 + i * 7) * Math.PI) / 180;
    return { x: 50 + r * Math.sin(a), y: 50 - r * Math.cos(a), o: 0.1 + i * 0.13, rr: 1 + i * 0.22 };
  });
  return (
    <Animated.View style={[StyleSheet.absoluteFill, spin]} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 100 100">
        {tail.map((t, i) => (
          <Circle key={i} cx={t.x} cy={t.y} r={t.rr} fill="#FFFFFF" opacity={t.o} />
        ))}
        <Circle cx={50} cy={50 - r} r={2.4} fill="#FFFFFF" />
      </Svg>
    </Animated.View>
  );
}

function LivePill() {
  const beat = useSharedValue(1);
  useEffect(() => {
    beat.set(withRepeat(withSequence(withTiming(0.45, { duration: 420 }), withTiming(1, { duration: 420 })), -1));
    return () => cancelAnimation(beat);
  }, [beat]);
  const dot = useAnimatedStyle(() => ({ opacity: beat.value, transform: [{ scale: 0.7 + 0.3 * beat.value }] }));
  return (
    <View style={styles.live}>
      <Animated.View style={[styles.liveDot, dot]} />
      <Text style={styles.liveText}>LIVE</Text>
    </View>
  );
}

function Row({
  metric,
  tint,
  look,
  showMine,
}: {
  metric: WidgetPreviewData['water'];
  tint: string;
  look: Look;
  showMine: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.value, { color: tint }]} numberOfLines={1}>
        {metric.value}
      </Text>
      <Text style={[styles.goal, { color: look.secondary }]} numberOfLines={1}>
        {metric.goal}
      </Text>
      {showMine ? (
        <View style={[styles.chip, { backgroundColor: look.chip }]}>
          <Text style={[styles.chipText, { color: look.secondary }]} numberOfLines={1}>
            You {metric.you}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 150,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  bg: { borderRadius: 26, overflow: 'hidden' },
  rings: { alignItems: 'center', justifyContent: 'center' },
  bear: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, marginLeft: 14 },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  title: { ...font('extrabold', 14), flex: 1 },
  live: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(52,199,89,0.15)',
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#30D158' },
  liveText: { ...font('extrabold', 9, { color: '#248A3D' }), letterSpacing: 0.8 },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  value: font('extrabold', 16),
  goal: { ...font('semibold', 10.5), flex: 1, marginLeft: 5 },
  chip: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1.5, marginLeft: 4 },
  chipText: font('semibold', 9.5),
  footer: { ...font('medium', 10.5), marginTop: 6 },
});

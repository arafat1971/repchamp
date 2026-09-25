import { LinearGradient as Backdrop } from 'expo-linear-gradient';
import { useEffect, type ReactNode } from 'react';
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
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { BearJar, type BearTheme } from '@/components/home/BearJar';
import {
  WATER_WIDGET_LIVE_MS,
  buildWaterWidgetSnapshot,
  type WaterWidgetSnapshot,
  type WidgetStyle,
  type WidgetTheme,
} from '@/domain/waterWidget';
import { font } from '@/theme/typography';

/**
 * The home-screen widget, drawn in the app — both layouts, every theme.
 *
 * It renders the very snapshot the widget receives, so the settings screen
 * and onboarding show exactly what will sit on the home screen, and every
 * switch visibly does something. The motion is the widget's, too: bars and
 * rings sweep in, the bears slosh, the LIVE dot beats when the partner is
 * active, and the drink button breathes.
 */

/* A believable pair for when there is no partner yet. Built once, at load. */
const SAMPLE_NOW = Date.now();
export const SAMPLE_SNAPSHOT: WaterWidgetSnapshot = buildWaterWidgetSnapshot(
  {
    name: 'Alex',
    day: 'sample',
    ml: 1400,
    goalMl: 2000,
    layers: [
      { k: 'water', ml: 900 },
      { k: 'juice', ml: 500 },
    ],
    last: { k: 'juice', ml: 250, at: SAMPLE_NOW - 60_000 },
    steps: 6120,
    reps: 112,
    topExercise: 'Squat',
    trainedAt: SAMPLE_NOW - 30 * 60_000,
    me: {
      ml: 1000,
      steps: 4100,
      reps: 40,
      goalMl: 2000,
      layers: [
        { k: 'water', ml: 750 },
        { k: 'coffee', ml: 250 },
      ],
    },
  },
  SAMPLE_NOW,
);

interface Look {
  bg: readonly [string, string, ...string[]];
  text: string;
  secondary: string;
  chip: string;
  water: string;
  steps: string;
  reps: string;
  border: string;
  track: string;
}

/* Mirrors the native Palette; "auto" previews the app's light scheme. */
const LIGHT: Look = {
  bg: ['#FFFFFF', '#FFFFFF'],
  text: '#000000',
  secondary: '#8A8A8E',
  chip: '#F2F2F7',
  water: '#0A7CC4',
  steps: '#248A3D',
  reps: '#E0184A',
  border: '#E5E7EB',
  track: '#F1F5F9',
};

export const LOOKS: Record<WidgetTheme, Look> = {
  sunset: {
    bg: ['#4C1D95', '#7E22CE', '#BE185D'],
    text: '#FFFFFF',
    secondary: '#F5D0FE',
    chip: 'rgba(255,255,255,0.16)',
    water: '#7DD3FC',
    steps: '#86EFAC',
    reps: '#FDA4AF',
    border: '#4C1D95',
    track: 'rgba(255,255,255,0.14)',
  },
  ocean: {
    bg: ['#1E1B4B', '#1E3A8A', '#0C4A6E'],
    text: '#FFFFFF',
    secondary: '#C7D2FE',
    chip: 'rgba(255,255,255,0.15)',
    water: '#7DD3FC',
    steps: '#86EFAC',
    reps: '#FDA4AF',
    border: '#1E1B4B',
    track: 'rgba(255,255,255,0.14)',
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
    track: '#2C2C2E',
  },
  light: LIGHT,
  auto: LIGHT,
};

const THEIR_BEAR: BearTheme = { body: '#e6e8ff', rim: '#a5b4fc', tint: '#8b5cf6' };
const MY_BEAR: BearTheme = { body: '#ffe4ec', rim: '#f9a8c9', tint: '#fb7185' };
/** Tug-of-war colours: theirs pulls from the left, mine from the right. */
export const THEIRS = '#A78BFA';
export const MINE = '#F472B6';

export function WidgetPreview({
  style,
  snap = SAMPLE_SNAPSHOT,
  width,
}: {
  style: WidgetStyle;
  snap?: WaterWidgetSnapshot;
  width: number;
}) {
  const look = LOOKS[style.theme];
  const reduced = useReducedMotion();
  const moving = style.motion && !reduced;
  const live = moving && snap.activeAt > 0 && snap.updatedAt - snap.activeAt <= WATER_WIDGET_LIVE_MS;

  /* One shared sweep, replayed whenever the look changes. */
  const sweep = useSharedValue(0);
  useEffect(() => {
    sweep.set(0);
    sweep.set(withDelay(120, withTiming(1, { duration: 1000, easing: Easing.out(Easing.cubic) })));
  }, [sweep, style.layout, style.theme, style.showSteps, style.showReps, style.showMine]);

  const tilt = useSharedValue(0);
  const phase = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    phase.set(withRepeat(withTiming(2 * Math.PI, { duration: 3000, easing: Easing.linear }), -1));
    return () => cancelAnimation(phase);
  }, [reduced, phase]);

  const parts = { snap, style, look, live, sweep, tilt, phase };
  return (
    <View style={[styles.card, { width, borderColor: look.border }]}>
      <Backdrop colors={look.bg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {style.layout === 'duo' ? <Duo {...parts} /> : <Rings {...parts} width={width} />}
    </View>
  );
}

interface PartProps {
  snap: WaterWidgetSnapshot;
  style: WidgetStyle;
  look: Look;
  live: boolean;
  sweep: SharedValue<number>;
  tilt: SharedValue<number>;
  phase: SharedValue<number>;
}

/* ---------------- Duo ---------------- */

interface Duel {
  icon: string;
  them: string;
  me: string;
  a: number;
  b: number;
}

function Duo({ snap, style, look, live, sweep, tilt, phase }: PartProps) {
  const rows: Duel[] = [{ icon: '💧', them: snap.amount, me: snap.meWater || '—', a: snap.waterMl, b: snap.meWaterMl }];
  if (style.showSteps) {
    rows.push({
      icon: '👟',
      them: snap.stepsN >= 0 ? snap.steps : '—',
      me: snap.meStepsN >= 0 ? snap.meSteps : '—',
      a: Math.max(0, snap.stepsN),
      b: Math.max(0, snap.meStepsN),
    });
  }
  if (style.showReps) rows.push({ icon: '💪', them: snap.reps, me: snap.meReps || '0', a: snap.repsN, b: snap.meRepsN });

  return (
    <View>
      <View style={styles.head}>
        <Text style={[styles.title, { color: look.text }]} numberOfLines={1}>
          {snap.name} <Text style={{ color: look.secondary }}>vs</Text> you
        </Text>
        {live ? <LivePill /> : null}
      </View>

      <View style={styles.duoMain}>
        <BearSide label={snap.name} amount={snap.amount} look={look}>
          <BearJar
            id="wp-them"
            percent={snap.pct * 100}
            width={50}
            theme={THEIR_BEAR}
            layers={bearLayers(snap.layers)}
            tilt={tilt}
            phase={phase}
            pourKey={0}
            met={snap.met}
          />
        </BearSide>

        <View style={styles.duels}>
          {rows.map((r) => (
            <DuelRow key={r.icon} duel={r} look={look} sweep={sweep} showMine={style.showMine} />
          ))}
        </View>

        <BearSide label="You" amount={snap.meWater || '—'} look={look}>
          <BearJar
            id="wp-me"
            percent={snap.mePct * 100}
            width={50}
            theme={MY_BEAR}
            layers={bearLayers(snap.meLayers)}
            tilt={tilt}
            phase={phase}
            pourKey={0}
            met={snap.meMet}
          />
        </BearSide>
      </View>

      <View style={styles.duoFoot}>
        <Text style={[styles.duelLine, { color: look.text }]} numberOfLines={1}>
          {snap.duel}
        </Text>
        <DrinkPill animate={style.motion} />
      </View>
    </View>
  );
}

/** Snapshot bands (cumulative tops) as BearJar layers (shares). */
function bearLayers(layers: readonly { c: string; t: number }[]) {
  let prev = 0;
  return layers.map((l) => {
    const share = Math.max(0, l.t - prev);
    prev = l.t;
    return { color: l.c, share };
  });
}

function BearSide({ label, amount, look, children }: { label: string; amount: string; look: Look; children: ReactNode }) {
  return (
    <View style={styles.side}>
      {children}
      <Text style={[styles.sideName, { color: look.secondary }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.sideAmount, { color: look.text }]} numberOfLines={1}>
        {amount}
      </Text>
    </View>
  );
}

/**
 * One metric as a tug-of-war: their number, the icon, mine; under it a bar
 * that is their share from the left and mine from the right, with a knot
 * where they meet. The leader wears the crown.
 */
function DuelRow({ duel, look, sweep, showMine }: { duel: Duel; look: Look; sweep: SharedValue<number>; showMine: boolean }) {
  const { icon, them, me, a, b } = duel;
  const share = showMine ? (a + b > 0 ? a / (a + b) : 0.5) : a > 0 ? 1 : 0;
  const themLead = a > b;
  const meLead = showMine && b > a;
  const pull = useAnimatedStyle(() => ({ width: `${(0.5 + (share - 0.5) * sweep.value) * 100}%` }));
  return (
    <View>
      <View style={styles.duelNums}>
        <Text style={[styles.duelVal, styles.right, { color: themLead ? look.text : look.secondary }]} numberOfLines={1}>
          {themLead ? '👑 ' : ''}
          {them}
        </Text>
        <Text style={styles.duelIcon}>{icon}</Text>
        <Text style={[styles.duelVal, { color: meLead ? look.text : look.secondary }]} numberOfLines={1}>
          {showMine ? me : ''}
          {meLead ? ' 👑' : ''}
        </Text>
      </View>
      <View style={[styles.tug, { backgroundColor: showMine ? MINE : look.track }]}>
        <Animated.View style={[styles.tugThem, pull]}>
          {showMine ? <View style={styles.knot} /> : null}
        </Animated.View>
      </View>
    </View>
  );
}

function DrinkPill({ animate }: { animate: boolean }) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (!animate) return;
    pulse.set(withRepeat(withSequence(withDelay(1800, withSpring(1.08, { damping: 6 })), withTiming(1, { duration: 260 })), -1));
    return () => cancelAnimation(pulse);
  }, [animate, pulse]);
  const s = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  return (
    <Animated.View style={[styles.drink, s]}>
      <Text style={styles.drinkText}>💧 +250</Text>
    </Animated.View>
  );
}

/* ---------------- Rings ---------------- */

const RING_COLORS = {
  water: ['#32ADE6', '#64D2FF'],
  steps: ['#30D158', '#A8F06C'],
  reps: ['#FF2D55', '#FF7A9A'],
} as const;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function Rings({ snap, style, look, live, sweep, tilt, phase, width }: PartProps & { width: number }) {
  const ringSize = Math.min(124, width * 0.36);
  return (
    <View style={styles.ringsLayout}>
      <View style={[styles.center, { width: ringSize, height: ringSize }]}>
        <Svg width={ringSize} height={ringSize} viewBox="0 0 100 100">
          {style.showReps ? <Ring r={45.75} pct={snap.repsPct} colors={RING_COLORS.reps} sweep={sweep} /> : null}
          {style.showSteps ? <Ring r={35.5} pct={snap.stepsPct} colors={RING_COLORS.steps} sweep={sweep} /> : null}
          <Ring r={25.25} pct={snap.pct} colors={RING_COLORS.water} sweep={sweep} />
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
          <BearJar
            id="wp-ring-bear"
            percent={snap.pct * 100}
            width={ringSize * 0.27}
            theme={THEIR_BEAR}
            layers={bearLayers(snap.layers)}
            tilt={tilt}
            phase={phase}
            pourKey={0}
            met={snap.met}
          />
        </View>
      </View>
      <View style={styles.ringsBody}>
        <View style={styles.head}>
          <Text style={[styles.title, { color: look.text }]} numberOfLines={1}>
            {snap.title}
          </Text>
          {live ? <LivePill /> : null}
        </View>
        <MetricRow value={snap.amount} goal={snap.goal} you={snap.meWater} tint={look.water} look={look} showMine={style.showMine} />
        {style.showSteps ? (
          <MetricRow value={snap.steps} goal={snap.stepsGoal} you={snap.meSteps} tint={look.steps} look={look} showMine={style.showMine} />
        ) : null}
        {style.showReps ? (
          <MetricRow value={snap.reps} goal={snap.repsDetail} you={snap.meReps} tint={look.reps} look={look} showMine={style.showMine} />
        ) : null}
        <Text style={[styles.foot, { color: look.secondary }]} numberOfLines={1}>
          {snap.footer}
        </Text>
      </View>
    </View>
  );
}

function Ring({ r, pct, colors, sweep }: { r: number; pct: number; colors: readonly [string, string]; sweep: SharedValue<number> }) {
  const circumference = 2 * Math.PI * r;
  const target = Math.max(0, Math.min(1, pct));
  const props = useAnimatedProps(() => ({ strokeDashoffset: circumference * (1 - target * sweep.value) }));
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

function MetricRow({
  value,
  goal,
  you,
  tint,
  look,
  showMine,
}: {
  value: string;
  goal: string;
  you: string;
  tint: string;
  look: Look;
  showMine: boolean;
}) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricVal, { color: tint }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.metricGoal, { color: look.secondary }]} numberOfLines={1}>
        {goal}
      </Text>
      {showMine && you ? (
        <View style={[styles.chip, { backgroundColor: look.chip }]}>
          <Text style={[styles.chipText, { color: look.secondary }]}>You {you}</Text>
        </View>
      ) : null}
    </View>
  );
}

/* ---------------- Shared ---------------- */

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

const styles = StyleSheet.create({
  card: {
    minHeight: 158,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    overflow: 'hidden',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  center: { alignItems: 'center', justifyContent: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  title: { ...font('extrabold', 14), flex: 1 },
  live: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(52,199,89,0.2)',
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#30D158' },
  liveText: { ...font('extrabold', 9, { color: '#4ADE80' }), letterSpacing: 0.8 },

  duoMain: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  side: { width: 60, alignItems: 'center' },
  sideName: { ...font('bold', 10), marginTop: 2 },
  sideAmount: font('extrabold', 12.5),
  duels: { flex: 1, marginHorizontal: 8, gap: 7 },
  duelNums: { flexDirection: 'row', alignItems: 'center' },
  duelVal: { ...font('extrabold', 12), flex: 1 },
  right: { textAlign: 'right' },
  duelIcon: { fontSize: 12, marginHorizontal: 4 },
  tug: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 3 },
  tugThem: {
    height: '100%',
    backgroundColor: THEIRS,
    borderRadius: 3,
    alignItems: 'flex-end',
  },
  knot: { width: 3, height: '100%', backgroundColor: '#FFFFFF' },
  duoFoot: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  duelLine: { ...font('bold', 11.5), flex: 1, marginRight: 8 },
  drink: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  drinkText: font('extrabold', 12, { color: '#0369A1' }),

  ringsLayout: { flexDirection: 'row', alignItems: 'center' },
  ringsBody: { flex: 1, marginLeft: 12 },
  metric: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  metricVal: font('extrabold', 16),
  metricGoal: { ...font('semibold', 10.5), flex: 1, marginLeft: 5 },
  chip: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1.5, marginLeft: 4 },
  chipText: font('semibold', 9.5),
  foot: { ...font('medium', 10.5), marginTop: 6 },
});

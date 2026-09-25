import { LinearGradient as Backdrop } from 'expo-linear-gradient';
import { Fragment, useEffect, type ReactNode } from 'react';
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
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

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
    streak: 4,
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
      {style.layout === 'scene' ? (
        <Scene {...parts} width={width} />
      ) : style.layout === 'duo' ? (
        <Duo {...parts} />
      ) : (
        <Rings {...parts} width={width} />
      )}
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

/* ---------------- Scene ---------------- */

interface Sky {
  top: string;
  bottom: string;
  hillBack: string;
  hillFront: string;
  cloud: string;
  night: boolean;
}

/** The same four skies the native painter uses, by local hour. */
function skyFor(hour: number): Sky {
  if (hour < 5 || hour >= 20) {
    return { top: '#0B1026', bottom: '#3B2A6B', hillBack: '#1E3A5F', hillFront: '#15452F', cloud: 'rgba(255,255,255,0.2)', night: true };
  }
  if (hour < 8) return { top: '#93C5FD', bottom: '#FBCFE8', hillBack: '#86EFAC', hillFront: '#4ADE80', cloud: 'rgba(255,255,255,0.9)', night: false };
  if (hour < 17) return { top: '#38BDF8', bottom: '#BAE6FD', hillBack: '#86EFAC', hillFront: '#22C55E', cloud: 'rgba(255,255,255,0.95)', night: false };
  return { top: '#6D28D9', bottom: '#FB923C', hillBack: '#65A30D', hillFront: '#3F6212', cloud: 'rgba(255,228,230,0.6)', night: false };
}

/* Stars, fixed so they do not jump between renders. */
const STARS = Array.from({ length: 26 }, (_, i) => ({
  x: (i * 37) % 100,
  y: ((i * 53) % 50) + 2,
  r: 0.6 + ((i * 7) % 10) / 10,
  o: 0.35 + ((i * 13) % 10) / 16,
}));

/**
 * The scene, in the app: the real sky for the hour, a hill, both bears in a
 * tug-of-war over water with the flag at the share of the pull, the words on
 * top. Mirrors the native painter, so what is chosen here is what appears.
 */
function Scene({ snap, style, live, tilt, phase, width }: PartProps & { width: number }) {
  const W = width;
  // The placed 4 x 2 widget runs about 0.54 as tall as it is wide.
  const H = Math.max(180, width * 0.54);
  const hour = new Date(snap.updatedAt).getHours() + new Date(snap.updatedAt).getMinutes() / 60;
  const sky = skyFor(hour);
  const share = style.showMine && snap.waterMl + snap.meWaterMl > 0 ? snap.waterMl / (snap.waterMl + snap.meWaterMl) : 0.5;

  const bh = H * 0.44;
  const bw = bh / 1.24;
  const feet = H * 0.71;
  const leftX = W * 0.17;
  const rightX = W * 0.83;
  const themLean = -(5 + 16 * Math.max(0, share - 0.5));
  const meLean = 5 + 16 * Math.max(0, 0.5 - share);
  const ropeY = feet - bh * 0.42;
  const x0 = leftX + bw * 0.34;
  const x1 = rightX - bw * 0.34;
  const sag = H * 0.05;
  const t = Math.min(0.92, Math.max(0.08, 1 - share));
  const mid = (x0 + x1) / 2;
  const fx = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * mid + t * t * x1;
  const fy = (1 - t) * (1 - t) * ropeY + 2 * (1 - t) * t * (ropeY + sag * 2) + t * t * ropeY;
  const arc = Math.min(1, Math.max(0, sky.night ? (hour >= 20 ? hour - 20 : hour + 4) / 9 : (hour - 5) / 15));
  const bx = W * (0.3 + 0.4 * arc);
  const by = H * (0.3 - 0.14 * Math.sin(Math.PI * arc));
  const met = snap.met || snap.meMet;
  /* Names sit on the grass under the bears, but never under the footer row,
     which keeps its height however small the card is. */
  const labelTop = Math.min(feet + 2, H - 10 - 34 - 17);

  return (
    <View style={{ height: H, margin: -14 }}>
      <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="scene-sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={sky.top} />
            <Stop offset="1" stopColor={sky.bottom} />
          </LinearGradient>
        </Defs>
        <Rect width={W} height={H} fill="url(#scene-sky)" />
        {sky.night
          ? STARS.map((st, i) => <Circle key={i} cx={(st.x / 100) * W} cy={(st.y / 100) * H * 0.55 * 2} r={st.r} fill="#FFFFFF" opacity={st.o} />)
          : null}
        {sky.night ? (
          <>
            <Circle cx={bx} cy={by} r={11} fill="#FEF3C7" />
            <Circle cx={bx + 5} cy={by - 3} r={9.5} fill={sky.top} />
          </>
        ) : (
          <>
            <Circle cx={bx} cy={by} r={20} fill={hour >= 17 ? '#FDBA74' : '#FDE047'} opacity={0.3} />
            <Circle cx={bx} cy={by} r={12} fill={hour >= 17 ? '#FDBA74' : '#FDE047'} />
          </>
        )}
        <Cloud x={W * 0.45} y={H * 0.15} s={1} color={sky.cloud} />
        <Cloud x={W * 0.68} y={H * 0.08} s={0.8} color={sky.cloud} />
        {snap.met && snap.meMet
          ? ['#EF4444', '#F97316', '#FACC15', '#22C55E', '#3B82F6', '#8B5CF6'].map((c, i) => {
              const r = W * 0.36 - i * 3.2;
              return (
                <Path
                  key={c}
                  d={`M${W / 2 - r} ${H * 0.66} A${r} ${r} 0 0 1 ${W / 2 + r} ${H * 0.66}`}
                  stroke={c}
                  strokeOpacity={0.6}
                  strokeWidth={3.2}
                  fill="none"
                />
              );
            })
          : null}
        <Path
          d={`M0 ${H * 0.64} Q${W * 0.3} ${H * 0.5} ${W * 0.62} ${H * 0.62} Q${W * 0.85} ${H * 0.7} ${W} ${H * 0.58} L${W} ${H} L0 ${H} Z`}
          fill={sky.hillBack}
        />
        <Path d={`M0 ${H * 0.72} Q${W * 0.5} ${H * 0.62} ${W} ${H * 0.72} L${W} ${H} L0 ${H} Z`} fill={sky.hillFront} />
        <Visitor kind={snap.visitor} W={W} H={H} />
        <Garden ml={snap.waterMl} pct={snap.pct} layers={snap.layers} cx={leftX} feet={feet} bw={bw} />
        <Garden ml={snap.meWaterMl} pct={snap.mePct} layers={snap.meLayers} cx={rightX} feet={feet} bw={bw} />
        {met
          ? Array.from({ length: 22 }, (_, i) => (
              <Rect
                key={i}
                x={((i * 41) % 100) / 100 * W}
                y={((i * 29) % 60) / 100 * H}
                width={3}
                height={1.6}
                fill={['#F472B6', '#FDE047', '#60A5FA', '#34D399', '#F97316'][i % 5]}
                transform={`rotate(${(i * 47) % 180} ${((i * 41) % 100) / 100 * W} ${((i * 29) % 60) / 100 * H})`}
              />
            ))
          : null}
      </Svg>

      <SceneBear left={leftX - bw / 2} top={feet - bh} bw={bw} bh={bh} lean={themLean}>
        <BearJar id="scene-them" percent={snap.pct * 100} width={bw} theme={THEIR_BEAR} layers={bearLayers(snap.layers)} tilt={tilt} phase={phase} pourKey={0} met={snap.met} />
        <Outfit streak={snap.streak} bw={bw} bh={bh} />
      </SceneBear>
      <SceneBear left={rightX - bw / 2} top={feet - bh} bw={bw} bh={bh} lean={meLean}>
        <BearJar id="scene-me" percent={snap.mePct * 100} width={bw} theme={MY_BEAR} layers={bearLayers(snap.meLayers)} tilt={tilt} phase={phase} pourKey={0} met={snap.meMet} />
        <Outfit streak={snap.streak} bw={bw} bh={bh} />
      </SceneBear>

      <Svg width={W} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Path d={`M${x0} ${ropeY} Q${mid} ${ropeY + sag * 2} ${x1} ${ropeY}`} stroke="#92400E" strokeWidth={3} fill="none" strokeLinecap="round" />
        <Path d={`M${x0} ${ropeY} Q${mid} ${ropeY + sag * 2} ${x1} ${ropeY}`} stroke="#FCD34D" strokeWidth={1} strokeDasharray="3 3" fill="none" />
        <Path d={`M${fx} ${fy} L${fx} ${fy - 14}`} stroke="#7C2D12" strokeWidth={1.6} />
        <Path d={`M${fx} ${fy - 14} L${fx + 10} ${fy - 10.5} L${fx} ${fy - 7} Z`} fill="#EF4444" />
        <Circle cx={fx} cy={fy} r={2.6} fill="#DC2626" />
      </Svg>

      <Text style={[styles.sceneLabel, { left: leftX - 60, top: labelTop }]} numberOfLines={1}>
        {snap.name} · {snap.amount}
      </Text>
      <Text style={[styles.sceneLabel, { left: rightX - 60, top: labelTop }]} numberOfLines={1}>
        You · {snap.meWater || '—'}
      </Text>

      <View style={styles.sceneOverlay}>
        <View style={styles.head}>
          <Text style={[styles.title, styles.shadowed, { color: '#FFFFFF' }]} numberOfLines={1}>
            {snap.vs}
          </Text>
          {snap.streak > 0 ? (
            <View style={[styles.glass, { marginRight: 6 }]}>
              <Text style={styles.streakText}>🔥 {snap.streak}</Text>
            </View>
          ) : null}
          {live ? <LivePill /> : null}
        </View>
        <View style={styles.chips}>
          {style.showSteps ? (
            <SceneChip icon="👟" them={snap.stepsN >= 0 ? snap.steps : '—'} me={snap.meStepsN >= 0 ? snap.meSteps : '—'} a={Math.max(0, snap.stepsN)} b={Math.max(0, snap.meStepsN)} showMine={style.showMine} />
          ) : null}
          {style.showReps ? (
            <SceneChip icon="💪" them={snap.reps} me={snap.meReps || '—'} a={snap.repsN} b={snap.meRepsN} showMine={style.showMine} />
          ) : null}
        </View>
        <View style={{ flex: 1 }} />
        <View style={styles.duoFoot}>
          <View style={[styles.glass, { flex: 1, marginRight: 8 }]}>
            <Text style={[styles.duelLine, { color: '#FFFFFF', marginRight: 0 }]} numberOfLines={1}>
              {snap.duel}
            </Text>
          </View>
          <DrinkPill animate={style.motion} />
        </View>
      </View>
    </View>
  );
}

/** The streak's rewards, in BearJar's 100 x 120 box: sunglasses at 3, a crown at 7. */
function Outfit({ streak, bw, bh }: { streak: number; bw: number; bh: number }) {
  if (streak < 3) return null;
  return (
    <Svg width={bw} height={bh} viewBox="0 0 100 120" style={StyleSheet.absoluteFill}>
      <Rect x={32} y={34} width={15} height={11} rx={4} fill="#111827" opacity={0.94} />
      <Rect x={53} y={34} width={15} height={11} rx={4} fill="#111827" opacity={0.94} />
      <Path d="M47 38 L53 38" stroke="#111827" strokeWidth={2.2} />
      <Rect x={34} y={36} width={5} height={3} rx={1.5} fill="#FFFFFF" opacity={0.6} />
      <Rect x={55} y={36} width={5} height={3} rx={1.5} fill="#FFFFFF" opacity={0.6} />
      {streak >= 7 ? (
        <>
          <Path d="M36 11 L38 -1 L44 6 L50 -4 L56 6 L62 -1 L64 11 Z" fill="#FACC15" />
          <Circle cx={50} cy={6} r={2.2} fill="#EF4444" />
        </>
      ) : null}
    </Svg>
  );
}

/** One flower per 250 ml, up to six, beside the bear, in its drinks' colours. */
function Garden({
  ml,
  pct,
  layers,
  cx,
  feet,
  bw,
}: {
  ml: number;
  pct: number;
  layers: readonly { c: string; t: number }[];
  cx: number;
  feet: number;
  bw: number;
}) {
  const n = Math.min(6, Math.floor(ml / 250));
  if (n <= 0) return null;
  const colorAt = (f: number) => {
    if (layers.length === 0) return '#38BDF8';
    const at = f * pct;
    return (layers.find((l) => at <= l.t) ?? layers[layers.length - 1]!).c;
  };
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const side = i % 2 === 0 ? -1 : 1;
        const x = cx + side * (bw * 0.52 + Math.floor(i / 2) * 7.5);
        const ground = feet + 1.5;
        const stem = 8 + (i % 3) * 1.5;
        const top = ground - stem;
        const color = colorAt((i + 0.5) / n);
        return (
          <Fragment key={i}>
            <Path d={`M${x} ${ground} L${x} ${top}`} stroke="#15803D" strokeWidth={1.2} />
            {[0, 1, 2, 3, 4].map((k) => (
              <Circle
                key={k}
                cx={x + Math.cos((k * 72 * Math.PI) / 180) * 2.2}
                cy={top + Math.sin((k * 72 * Math.PI) / 180) * 2.2}
                r={1.7}
                fill={color}
              />
            ))}
            <Circle cx={x} cy={top} r={1.3} fill="#FDE68A" />
          </Fragment>
        );
      })}
    </>
  );
}

/** Today's visitor, matching the painter: butterfly, ladybug, mushroom, snail. */
function Visitor({ kind, W, H }: { kind: number; W: number; H: number }) {
  if (kind === 0) {
    const x = W * 0.63;
    const y = H * 0.38;
    return (
      <>
        <Circle cx={x - 3.7} cy={y - 2} r={3.4} fill="#F472B6" />
        <Circle cx={x + 3.7} cy={y - 2} r={3.4} fill="#F472B6" />
        <Circle cx={x - 2.7} cy={y + 2} r={2.3} fill="#FB923C" />
        <Circle cx={x + 2.7} cy={y + 2} r={2.3} fill="#FB923C" />
        <Rect x={x - 0.7} y={y - 4} width={1.4} height={8} rx={0.7} fill="#3F3F46" />
      </>
    );
  }
  const x = W * 0.5;
  const y = H * (kind === 1 ? 0.73 : 0.74);
  if (kind === 1) {
    return (
      <>
        <Path d={`M${x - 5} ${y} A5 5 0 0 1 ${x + 5} ${y} Z`} fill="#EF4444" />
        <Circle cx={x - 5.5} cy={y - 1.2} r={2} fill="#111827" />
        <Circle cx={x - 1.8} cy={y - 2.6} r={0.9} fill="#111827" />
        <Circle cx={x + 2} cy={y - 3} r={0.9} fill="#111827" />
      </>
    );
  }
  if (kind === 2) {
    return (
      <>
        <Rect x={x - 2} y={y - 6} width={4} height={6} rx={1} fill="#FEF3C7" />
        <Path d={`M${x - 7} ${y - 7} A7 5 0 0 1 ${x + 7} ${y - 7} Z`} fill="#DC2626" />
        <Circle cx={x - 3} cy={y - 8.5} r={1.1} fill="#FFFFFF" />
        <Circle cx={x + 2.5} cy={y - 9.5} r={1} fill="#FFFFFF" />
      </>
    );
  }
  return (
    <>
      <Rect x={x - 7} y={y - 2.5} width={12} height={2.5} rx={1.5} fill="#FDE68A" />
      <Circle cx={x + 5} cy={y - 3.5} r={1.8} fill="#FDE68A" />
      <Circle cx={x - 2} cy={y - 5} r={4.2} fill="#B45309" />
      <Circle cx={x - 2} cy={y - 5} r={2.2} fill="#F59E0B" />
    </>
  );
}

function SceneBear({ left, top, bw, bh, lean, children }: { left: number; top: number; bw: number; bh: number; lean: number; children: ReactNode }) {
  /* Rotate about the feet, as the painter does: shift the pivot down, turn, shift back. */
  return (
    <View
      style={{
        position: 'absolute',
        left,
        top,
        width: bw,
        height: bh,
        transform: [{ translateY: bh / 2 }, { rotate: `${lean}deg` }, { translateY: -bh / 2 }],
      }}
      pointerEvents="none"
    >
      {children}
    </View>
  );
}

function Cloud({ x, y, s, color }: { x: number; y: number; s: number; color: string }) {
  return (
    <>
      <Circle cx={x} cy={y} r={9 * s} fill={color} />
      <Circle cx={x + 10 * s} cy={y - 5 * s} r={11 * s} fill={color} />
      <Circle cx={x + 22 * s} cy={y} r={9 * s} fill={color} />
      <Rect x={x - 6 * s} y={y - 2 * s} width={34 * s} height={10 * s} rx={6 * s} fill={color} />
    </>
  );
}

function SceneChip({ icon, them, me, a, b, showMine }: { icon: string; them: string; me: string; a: number; b: number; showMine: boolean }) {
  const themLead = a > b;
  const meLead = showMine && b > a;
  return (
    <View style={styles.glass}>
      <Text style={styles.chipScene} numberOfLines={1}>
        {icon} {themLead ? '👑 ' : ''}
        {them}
        {showMine ? `  ·  ${me}${meLead ? ' 👑' : ''}` : ''}
      </Text>
    </View>
  );
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
  sceneOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 10 },
  sceneLabel: {
    position: 'absolute',
    width: 120,
    textAlign: 'center',
    ...font('extrabold', 10.5, { color: '#FFFFFF' }),
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 1 },
  },
  shadowed: { textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
  chips: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 3 },
  glass: { backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  chipScene: font('extrabold', 10.5, { color: '#FFFFFF' }),
  streakText: font('extrabold', 11, { color: '#FDE68A' }),
  ringsBody: { flex: 1, marginLeft: 12 },
  metric: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  metricVal: font('extrabold', 16),
  metricGoal: { ...font('semibold', 10.5), flex: 1, marginLeft: 5 },
  chip: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1.5, marginLeft: 4 },
  chipText: font('semibold', 9.5),
  foot: { ...font('medium', 10.5), marginTop: 6 },
});

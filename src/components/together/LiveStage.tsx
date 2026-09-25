import { LinearGradient as Backdrop } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  ZoomIn,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { BearJar, type BearTheme } from '@/components/home/BearJar';
import { PressableScale } from '@/components/ui';
import { POKES, type Poke } from '@/domain/ritual';
import { font } from '@/theme/typography';

const THEIR_BEAR: BearTheme = { body: '#e6e8ff', rim: '#a5b4fc', tint: '#8b5cf6' };
const MY_BEAR: BearTheme = { body: '#ffe4ec', rim: '#f9a8c9', tint: '#fb7185' };

export interface StageSide {
  name: string;
  /** 0..1 of today's water goal. */
  pct: number;
  met: boolean;
  layers: readonly { color: string; share: number }[];
  /** Short amount under the bear ("750 ml", or "—" when not shared). */
  amount: string;
  /** Ritual habits done, of `total`. */
  score: number;
}

/** One emoji in flight across the stage. */
interface Flight {
  id: number;
  e: string;
  /** Who threw it: mine flies right-to-left, theirs left-to-right. */
  from: 'me' | 'them';
}

/**
 * The live stage: both bears on their island under the hour's sky, and the
 * two of you on either side of it.
 *
 * Tap their bear to throw a heart across; pick any emoji from the tray; tap
 * your own for a wiggle. What they throw lands on your bear on this screen
 * within a second or two — the stage is the one place in the app where the
 * other person is *present*, and it says so when they are.
 */
export function LiveStage({
  them,
  me,
  total,
  here,
  hereLine,
  incoming,
  onPoke,
  width,
  hour,
}: {
  them: StageSide;
  me: StageSide;
  total: number;
  /** Is the partner on this screen right now? */
  here: boolean;
  /** "nkll is here with you" / "nkll was here 5 min ago". */
  hereLine: string;
  /** The latest poke from them to animate, keyed by its time. */
  incoming: { e: string; at: number } | null;
  /** Throw a poke; returns false when throttled. */
  onPoke: (e: Poke) => boolean;
  width: number;
  hour: number;
}) {
  const reduced = useReducedMotion();
  const H = Math.round(width * 1.0);
  const sky = skyFor(hour);
  const bw = Math.min(104, width * 0.26);
  /* Bottom up: the tray, the name plates over the island's earth, then the grass the bears stand on. */
  const feet = H - 116;
  const themX = width * 0.26;
  const meX = width * 0.74;

  const [flights, setFlights] = useState<Flight[]>([]);
  const seq = useRef(0);
  const launch = (e: string, from: 'me' | 'them') => {
    const id = ++seq.current;
    setFlights((f) => [...f.slice(-5), { id, e, from }]);
    setTimeout(() => setFlights((f) => f.filter((x) => x.id !== id)), 1300);
  };

  /* Bounce a bear when something lands on it. */
  const themHop = useSharedValue(0);
  const meHop = useSharedValue(0);
  const hop = (v: typeof themHop) => {
    v.set(withSequence(withTiming(-14, { duration: 140 }), withSpring(0, { damping: 5, stiffness: 220 })));
  };
  const wiggle = useSharedValue(0);

  useEffect(() => {
    if (!incoming) return;
    launch(incoming.e, 'them');
    const t = setTimeout(() => hop(meHop), 900);
    return () => clearTimeout(t);
    // Keyed by time: each poke plays once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming?.at]);

  const throwAt = (e: Poke) => {
    if (!onPoke(e)) return;
    launch(e, 'me');
    setTimeout(() => hop(themHop), 900);
  };

  /* A slow breath for both bears, and a heartbeat on the presence dot. */
  const breath = useSharedValue(0);
  const pulse = useSharedValue(0);
  const tilt = useSharedValue(0);
  const phase = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    breath.set(withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }), -1, true));
    pulse.set(withRepeat(withTiming(1, { duration: 1100, easing: Easing.out(Easing.quad) }), -1, false));
    phase.set(withRepeat(withTiming(2 * Math.PI, { duration: 3000, easing: Easing.linear }), -1));
    return () => {
      cancelAnimation(breath);
      cancelAnimation(pulse);
      cancelAnimation(phase);
    };
  }, [reduced, breath, pulse, phase]);

  const themStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: themHop.get() - breath.get() * 3 }, { rotate: `${-4 + (here ? 3 : 0)}deg` }],
  }));
  const meStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: meHop.get() - (1 - breath.get()) * 3 }, { rotate: `${4 - (here ? 3 : 0) + wiggle.get()}deg` }],
  }));
  const dotStyle = useAnimatedStyle(() => ({ opacity: 1 - pulse.get(), transform: [{ scale: 1 + pulse.get() * 1.6 }] }));

  const bh = bw * 1.24;
  const arc = Math.min(1, Math.max(0, sky.night ? (hour >= 20 ? hour - 20 : hour + 4) / 9 : (hour - 5) / 15));
  const sx = width * (0.3 + 0.4 * arc);
  const sy = H * (0.2 - 0.1 * Math.sin(Math.PI * arc));

  return (
    <View style={[styles.stage, { width, height: H }]}>
      <Backdrop colors={[sky.top, sky.bottom]} style={StyleSheet.absoluteFill} />
      <Svg width={width} height={H} style={StyleSheet.absoluteFill}>
        {sky.night
          ? STARS.map((s, i) => <Circle key={i} cx={s[0] * width} cy={s[1] * H} r={s[2]} fill="#FFFFFF" opacity={0.7} />)
          : null}
        {sky.night ? (
          <Circle cx={sx} cy={sy} r={14} fill="#FEF3C7" />
        ) : (
          <>
            <Circle cx={sx} cy={sy} r={30} fill={sky.sun} opacity={0.25} />
            <Circle cx={sx} cy={sy} r={17} fill={sky.sun} />
          </>
        )}
        {/* The island, both bears' shared ground. */}
        <Path
          d={`M${width * 0.05} ${feet + 4} Q${width * 0.14} ${feet + 34} ${width * 0.34} ${feet + 42} Q${width * 0.5} ${feet + 62} ${width * 0.66} ${feet + 42} Q${width * 0.86} ${feet + 34} ${width * 0.95} ${feet + 4} Z`}
          fill="#7C3F12"
        />
        <Path d={ellipse(width * 0.5, feet + 4, width * 0.45, 20)} fill={sky.night ? '#2F6B3A' : '#4ADE80'} />
        <Path d={ellipse(width * 0.5, feet, width * 0.45, 17)} fill={sky.night ? '#3E8A4C' : '#86EFAC'} />
        {here ? (
          <Path
            d={`M${themX + bw * 0.3} ${feet - bh * 0.45} Q${width / 2} ${feet - bh * 0.1} ${meX - bw * 0.3} ${feet - bh * 0.45}`}
            stroke="#FDE68A"
            strokeWidth={2.5}
            strokeDasharray="4 5"
            fill="none"
            opacity={0.9}
          />
        ) : null}
      </Svg>

      {/* Presence */}
      <View style={styles.presence}>
        <View style={styles.dotWrap}>
          {here ? <Animated.View style={[styles.dotRing, dotStyle]} /> : null}
          <View style={[styles.dot, { backgroundColor: here ? '#22C55E' : 'rgba(255,255,255,0.5)' }]} />
        </View>
        <Text style={styles.presenceText} numberOfLines={1}>
          {hereLine}
        </Text>
      </View>

      {/* Bears */}
      <Animated.View style={[styles.bear, { left: themX - bw / 2, top: feet - bh, width: bw, height: bh }, themStyle]}>
        <PressableScale onPress={() => throwAt('❤️')} accessibilityRole="button" accessibilityLabel={`Send ${them.name} a heart`}>
          <BearJar id="stage-them" moods percent={them.pct * 100} width={bw} theme={THEIR_BEAR} layers={them.layers} tilt={tilt} phase={phase} pourKey={0} met={them.met} />
        </PressableScale>
      </Animated.View>
      <Animated.View style={[styles.bear, { left: meX - bw / 2, top: feet - bh, width: bw, height: bh }, meStyle]}>
        <PressableScale
          onPress={() => {
            wiggle.set(withSequence(withTiming(-8, { duration: 70 }), withTiming(8, { duration: 90 }), withTiming(-5, { duration: 80 }), withSpring(0)));
          }}
          accessibilityRole="button"
          accessibilityLabel="Your bear"
        >
          <BearJar id="stage-me" moods percent={me.pct * 100} width={bw} theme={MY_BEAR} layers={me.layers} tilt={tilt} phase={phase} pourKey={0} met={me.met} />
        </PressableScale>
      </Animated.View>

      {/* Name plates */}
      <Plate x={themX} y={feet + 14} name={them.name} amount={them.amount} score={them.score} total={total} />
      <Plate x={meX} y={feet + 14} name="You" amount={me.amount} score={me.score} total={total} />

      {flights.map((f) => (
        <FlyingEmoji key={f.id} e={f.e} fromX={f.from === 'me' ? meX : themX} toX={f.from === 'me' ? themX : meX} y={feet - bh * 0.75} />
      ))}

      {/* Tray: throw anything across. */}
      <Animated.View entering={FadeIn.delay(300)} style={styles.tray}>
        {POKES.map((e) => (
          <PressableScale key={e} onPress={() => throwAt(e)} accessibilityRole="button" accessibilityLabel={`Send ${e}`} style={styles.trayBtn}>
            <Text style={styles.trayEmoji}>{e}</Text>
          </PressableScale>
        ))}
      </Animated.View>
    </View>
  );
}

function Plate({ x, y, name, amount, score, total }: { x: number; y: number; name: string; amount: string; score: number; total: number }) {
  return (
    <View style={[styles.plate, { left: x - 62, top: y }]} pointerEvents="none">
      <Text style={styles.plateName} numberOfLines={1}>
        {name}
      </Text>
      <Text style={styles.plateSub} numberOfLines={1}>
        {amount} · {score} of {total}
      </Text>
    </View>
  );
}

/** An emoji arcing from one bear to the other, then popping. */
function FlyingEmoji({ e, fromX, toX, y }: { e: string; fromX: number; toX: number; y: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.cubic) }));
  }, [t]);
  const style = useAnimatedStyle(() => {
    const p = t.get();
    const lift = Math.sin(Math.PI * p) * 70;
    return {
      opacity: p < 0.92 ? 1 : (1 - p) / 0.08,
      transform: [
        { translateX: fromX + (toX - fromX) * p - 18 },
        { translateY: y - lift },
        { scale: 0.7 + Math.sin(Math.PI * p) * 0.8 + (p > 0.9 ? (p - 0.9) * 6 : 0) },
      ],
    };
  });
  return (
    <Animated.Text entering={ZoomIn} exiting={FadeOut} style={[styles.fly, style]} pointerEvents="none">
      {e}
    </Animated.Text>
  );
}

function ellipse(cx: number, cy: number, rx: number, ry: number): string {
  return `M${cx - rx} ${cy} A${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
}

const STARS: [number, number, number][] = [
  [0.08, 0.1, 1.2], [0.22, 0.22, 0.9], [0.36, 0.08, 1.4], [0.55, 0.18, 1], [0.68, 0.06, 1.2],
  [0.82, 0.2, 0.9], [0.92, 0.1, 1.3], [0.14, 0.34, 0.8], [0.62, 0.32, 0.8], [0.88, 0.38, 1],
];

function skyFor(hour: number): { top: string; bottom: string; sun: string; night: boolean } {
  if (hour < 5 || hour >= 20) return { top: '#0B1026', bottom: '#3B2A6B', sun: '#FEF3C7', night: true };
  if (hour < 8) return { top: '#93C5FD', bottom: '#FBCFE8', sun: '#FDE047', night: false };
  if (hour < 17) return { top: '#38BDF8', bottom: '#BAE6FD', sun: '#FDE047', night: false };
  return { top: '#6D28D9', bottom: '#FB923C', sun: '#FDBA74', night: false };
}

const styles = StyleSheet.create({
  stage: { borderRadius: 28, overflow: 'hidden' },
  presence: {
    position: 'absolute',
    top: 16,
    left: 18,
    right: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
  },
  dotWrap: { width: 12, height: 12, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotRing: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: '#22C55E' },
  presenceText: {
    flexShrink: 1,
    ...font('semibold', 13, { color: '#FFFFFF' }),
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
  bear: { position: 'absolute' },
  plate: { position: 'absolute', width: 124, alignItems: 'center' },
  plateName: { ...font('extrabold', 14, { color: '#FFFFFF' }), textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 4 },
  plateSub: { ...font('bold', 11, { color: 'rgba(255,255,255,0.92)' }), textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 3 },
  fly: { position: 'absolute', left: 0, top: 0, fontSize: 30 },
  tray: {
    position: 'absolute',
    bottom: 10,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(15,23,42,0.35)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  trayBtn: { width: 40, height: 36, alignItems: 'center', justifyContent: 'center' },
  trayEmoji: { fontSize: 22 },
});

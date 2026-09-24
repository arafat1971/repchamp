import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  FadeOutUp,
  SensorType,
  SlideInDown,
  SlideInUp,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedSensor,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';

import { CountUp } from '@/components/motion';
import { LemonAvatar } from '@/components/home/LemonAvatar';
import { PressableScale } from '@/components/ui';
import {
  DEFAULT_DAILY_GOAL_ML,
  DRINK_SIZES_ML,
  MAX_DAILY_GOAL_ML,
  MIN_DAILY_GOAL_ML,
  type HydrationProgress,
  formatMl,
} from '@/domain/hydration';
import { lightImpactHaptic, selectionHaptic } from '@/lib/feedback';
import { font } from '@/theme/typography';
import { radius } from '@/theme/tokens';

const AnimatedPath = Animated.createAnimatedComponent(Path);

const CARD_H = 340;
/** Water never sits lower than this, so an empty day still shows a surface. */
const FLOOR = 0.1;
/** …nor higher, so the number and the controls stay readable on a met goal. */
const CEIL = 0.8;

function levelFor(percent: number): number {
  const p = Math.max(0, Math.min(100, percent)) / 100;
  return FLOOR + p * (CEIL - FLOOR);
}

interface Person {
  name: string;
  avatar?: string | null;
}

/**
 * Hydration as a tank: the card itself is the water.
 *
 * The level rises from the floor of the card toward the top as the day's
 * intake climbs; the surface is two drifting sine waves that tilt with the
 * phone (Reanimated's gravity sensor, on the UI thread). Tapping a size pours
 * a stream in from the top, and the level springs up to meet it. The big
 * number rolls to the new total, and the goal steps right beside it.
 *
 * My lemon-slice face floats on my surface. My partner's rides a dashed line
 * at their level — live over the couple document, so when they drink their
 * marker glides up, a banner says so, and the phone taps.
 *
 * Their line is drawn on my tank's scale (their goal is not synced), so the
 * two heights compare honestly, and it is labelled with their real amount. Under Reduce Motion: no tilt,
 * no drift, no pour — the level still moves, without the bounce.
 */
export function HydrationCard({
  water,
  me,
  partner,
  partnerMl,
  onLogWater,
  onUndoWater,
  onStepWaterGoal,
}: {
  water: HydrationProgress;
  me: Person;
  partner: Person | null;
  partnerMl: number | null;
  onLogWater: (ml: number) => void;
  onUndoWater?: () => void;
  onStepWaterGoal: (direction: 1 | -1) => void;
}) {
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  /* ── Level ── */
  const level = useSharedValue(levelFor(water.percent));
  useEffect(() => {
    const target = levelFor(water.percent);
    level.value = reduced
      ? withTiming(target, { duration: 250 })
      : withSpring(target, { damping: 11, stiffness: 55, mass: 1 });
  }, [water.percent, reduced, level]);

  /* ── Surface motion: drift + tilt ── */
  const phase = useSharedValue(0);
  useEffect(() => {
    if (reduced) {
      cancelAnimation(phase);
      return;
    }
    phase.value = withRepeat(withTiming(2 * Math.PI, { duration: 3200, easing: Easing.linear }), -1);
    return () => cancelAnimation(phase);
  }, [reduced, phase]);

  const gravity = useAnimatedSensor(SensorType.GRAVITY, { interval: 32 });
  /* Tilt the surface against the phone's roll — water stays level while the
     card rotates — smoothed and capped so it reads as liquid, not a seesaw. */
  const tilt = useSharedValue(0);
  useDerivedValue(() => {
    if (reduced) return;
    const gx = gravity.sensor.value.x ?? 0;
    const target = Math.max(-0.22, Math.min(0.22, gx / 9.81 / 2.2));
    tilt.value = tilt.value + (target - tilt.value) * 0.12;
  });

  /* A splash bump on each pour, decaying back to calm. */
  const slosh = useSharedValue(0);

  const back = useSurface(level, phase, tilt, slosh, width, 10, -1, 1.9);
  const front = useSurface(level, phase, tilt, slosh, width, 13, 1, 0);

  /* ── Pour ── */
  const [pour, setPour] = useState<{ id: number; ml: number } | null>(null);
  const log = (ml: number) => {
    onLogWater(ml);
    if (reduced) return;
    setPour((p) => ({ id: (p?.id ?? 0) + 1, ml }));
  };
  const pourId = pour?.id;
  useEffect(() => {
    if (pourId == null) return;
    slosh.set(withSequence(withTiming(1, { duration: 520 }), withTiming(0, { duration: 900 })));
  }, [pourId, slosh]);

  /* ── Partner live ── */
  /* Their line on the same scale as my water — my goal is the tank's height —
     so the two heights compare honestly: 2 L against my 5.5 L sits well below
     my surface. (Their own goal is not synced.) */
  const partnerPct = (ml: number | null) =>
    ml == null ? 0 : Math.round((ml / Math.max(1, water.goalMl)) * 100);
  const partnerLevel = useSharedValue(levelFor(partnerPct(partnerMl)));
  useEffect(() => {
    if (partnerMl == null) return;
    const target = levelFor(partnerPct(partnerMl));
    partnerLevel.value = reduced ? target : withSpring(target, { damping: 14, stiffness: 50 });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- partnerPct only reads water.goalMl, listed
  }, [partnerMl, water.goalMl, reduced, partnerLevel]);

  const lastPartner = useRef<number | null>(partnerMl);
  const [live, setLive] = useState<{ id: number; ml: number } | null>(null);
  useEffect(() => {
    const before = lastPartner.current;
    lastPartner.current = partnerMl;
    if (before == null || partnerMl == null || partnerMl <= before) return;
    lightImpactHaptic();
    setLive((l) => ({ id: (l?.id ?? 0) + 1, ml: partnerMl - before }));
    const t = setTimeout(() => setLive(null), 3600);
    return () => clearTimeout(t);
  }, [partnerMl]);

  const partnerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: CARD_H * (1 - partnerLevel.value) - 15 }],
  }));
  const meStyle = useAnimatedStyle(() => {
    const surface = CARD_H * (1 - level.value);
    // Ride the front wave at the float's x (right side), with a gentle bob.
    const x = width * 0.8;
    const bob = Math.sin((x / Math.max(1, width)) * 2 * Math.PI * 1.1 + phase.value) * 5;
    const tiltY = tilt.value * (x - width / 2);
    return {
      transform: [
        { translateY: surface - 19 + bob + tiltY },
        { rotate: `${bob * 2 - tilt.value * 40}deg` },
      ],
    };
  });

  /* ── Goal stepper ── */
  const [dir, setDir] = useState<1 | -1 | 0>(0);
  const atMin = water.goalMl <= MIN_DAILY_GOAL_ML;
  const atMax = water.goalMl >= MAX_DAILY_GOAL_ML;
  const step = (d: 1 | -1) => {
    setDir(d);
    onStepWaterGoal(d);
  };

  const bothMet = partnerMl != null && water.met && partnerMl >= DEFAULT_DAILY_GOAL_ML;

  return (
    <View style={styles.card} onLayout={onLayout}>
      {/* The water. */}
      {width > 0 ? (
        <Svg width={width} height={CARD_H} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <SvgGradient id="tank" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#7dd3fc" />
              <Stop offset="0.3" stopColor="#0ea5e9" />
              <Stop offset="1" stopColor="#1e3a8a" />
            </SvgGradient>
          </Defs>
          <AnimatedPath animatedProps={back} fill="#38bdf8" opacity={0.35} />
          <AnimatedPath animatedProps={front} fill="url(#tank)" />
        </Svg>
      ) : null}

      {pour && width > 0 ? (
        <PourStream key={pour.id} level={level} width={width} onDone={() => setPour(null)} />
      ) : null}

      {/* Partner's level: a dashed line with their face, gliding when they drink. */}
      {partner && partnerMl != null && width > 0 ? (
        <Animated.View style={[styles.partnerLine, partnerStyle]} pointerEvents="none">
          <LemonAvatar uri={partner.avatar} initial={(partner.name.charAt(0) || '?').toUpperCase()} size={30} />
          <View style={styles.dash} />
          <Text style={styles.partnerTag}>
            {partner.name} · {formatMl(partnerMl)}
          </Text>
        </Animated.View>
      ) : null}

      {/* Me: my face floating on my own surface. */}
      {width > 0 ? (
        <Animated.View style={[styles.meFloat, { left: width * 0.8 - 19 }, meStyle]} pointerEvents="none">
          <LemonAvatar uri={me.avatar} initial={(me.name.charAt(0) || '?').toUpperCase()} size={38} />
        </Animated.View>
      ) : null}

      {/* Foreground: header, number, goal, controls. */}
      <View style={styles.content} pointerEvents="box-none">
        <View style={styles.head}>
          <Text style={styles.title}>💧 Hydration</Text>
          <View style={[styles.chip, water.met && styles.chipMet]}>
            <Text style={[styles.chipText, water.met && styles.chipTextMet]}>
              {water.met ? 'Goal met ✓' : `${water.percent}%`}
            </Text>
          </View>
        </View>

        <View style={styles.bannerSlot}>
          {live && partner ? (
            <Animated.View
              key={live.id}
              entering={FadeInDown.springify().damping(14)}
              exiting={FadeOutUp.duration(250)}
              style={styles.banner}
            >
              <Text style={styles.bannerText}>
                {partner.name} just had {formatMl(live.ml)} 💧
              </Text>
            </Animated.View>
          ) : bothMet && partner ? (
            <Text style={styles.cheers}>🥂 You and {partner.name} both hit your goal</Text>
          ) : null}
        </View>

        <View style={styles.center}>
          <CountUp
            value={water.ml}
            duration={700}
            delay={0}
            format={(n) => formatMl(n)}
            style={styles.big}
          />
          <View style={styles.goalRow}>
            <Pressable
              onPress={() => step(-1)}
              disabled={atMin}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Lower the water goal"
              style={({ pressed }) => [styles.goalBtn, (pressed || atMin) && styles.goalBtnDim]}
            >
              <Text style={styles.goalBtnText}>−</Text>
            </Pressable>
            <View style={styles.goalClip}>
              <Animated.Text
                key={water.goalMl}
                entering={dir === 1 ? SlideInDown.duration(220) : dir === -1 ? SlideInUp.duration(220) : undefined}
                style={styles.goalText}
              >
                of {formatMl(water.goalMl)} goal
              </Animated.Text>
            </View>
            <Pressable
              onPress={() => step(1)}
              disabled={atMax}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Raise the water goal"
              style={({ pressed }) => [styles.goalBtn, (pressed || atMax) && styles.goalBtnDim]}
            >
              <Text style={styles.goalBtnText}>+</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.bottom}>
          <View style={styles.pills}>
            {DRINK_SIZES_ML.map((ml) => (
              <PressableScale
                key={ml}
                onPress={() => log(ml)}
                accessibilityRole="button"
                accessibilityLabel={`Pour ${formatMl(ml)}`}
                style={styles.pill}
              >
                <Text style={styles.pillText}>+{ml}</Text>
                <Text style={styles.pillUnit}>ml</Text>
              </PressableScale>
            ))}
          </View>
          <View style={styles.footRow}>
            <Text style={styles.hint}>
              {water.met ? 'Goal met — anything more is a bonus' : `${formatMl(water.remainingMl)} to go`}
            </Text>
            {onUndoWater ? (
              <Pressable
                onPress={() => {
                  selectionHaptic();
                  onUndoWater();
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Undo the last drink"
              >
                <Text style={styles.undo}>↺ Undo</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

/** A filled wave surface across the card at the current level. */
function useSurface(
  level: SharedValue<number>,
  phase: SharedValue<number>,
  tilt: SharedValue<number>,
  slosh: SharedValue<number>,
  W: number,
  amp: number,
  direction: 1 | -1,
  offset: number,
) {
  return useAnimatedProps(() => {
    const steps = 24;
    const base = CARD_H * (1 - level.value);
    const a = amp * (1 + slosh.value * 1.4);
    let d = '';
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * W;
      const y =
        base +
        a * Math.sin((i / steps) * 2 * Math.PI * 1.1 + direction * phase.value + offset) +
        tilt.value * (x - W / 2);
      d += `${i === 0 ? 'M' : 'L'} ${Math.round(x)} ${Math.round(y * 10) / 10} `;
    }
    d += `L ${W} ${CARD_H + 40} L 0 ${CARD_H + 40} Z`;
    return { d };
  });
}

/** A stream falling from the top of the card into the water, then thinning out. */
function PourStream({
  level,
  width,
  onDone,
}: {
  level: SharedValue<number>;
  width: number;
  onDone: () => void;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) });
    const id = setTimeout(onDone, 950);
    return () => clearTimeout(id);
  }, [t, onDone]);

  const style = useAnimatedStyle(() => {
    const surface = CARD_H * (1 - level.value);
    const grow = Math.min(1, t.value / 0.3);
    const fade = t.value > 0.6 ? 1 - (t.value - 0.6) / 0.4 : 1;
    return {
      height: surface * grow,
      opacity: fade,
      width: 10 * (0.5 + fade * 0.5),
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.stream, { left: width * 0.5 - 5 }, style]}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    height: CARD_H,
    borderRadius: radius['3xl'],
    overflow: 'hidden',
    backgroundColor: '#07162a',
  },
  content: { ...StyleSheet.absoluteFill, padding: 18, justifyContent: 'space-between' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { ...font('extrabold', 17, { color: '#ffffff' }), letterSpacing: -0.3 },
  chip: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 4, backgroundColor: 'rgba(125,211,252,0.18)' },
  chipMet: { backgroundColor: 'rgba(48,209,88,0.22)' },
  chipText: font('bold', 12.5, { color: '#bae6fd' }),
  chipTextMet: font('bold', 12.5, { color: '#30d158' }),
  bannerSlot: { height: 30, alignItems: 'center', justifyContent: 'center' },
  banner: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(56,189,248,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.45)',
  },
  bannerText: font('bold', 13, { color: '#e0f2fe' }),
  cheers: font('extrabold', 13, { color: '#fde68a' }),
  center: { alignItems: 'center', marginTop: -6 },
  big: {
    ...font('extrabold', 52, { color: '#ffffff' }),
    letterSpacing: -2,
    textShadowColor: 'rgba(7,22,42,0.55)',
    textShadowRadius: 12,
  },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  goalBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  goalBtnDim: { opacity: 0.35 },
  goalBtnText: { ...font('bold', 17, { color: '#ffffff' }), lineHeight: 20 },
  goalClip: { height: 22, overflow: 'hidden', justifyContent: 'center' },
  goalText: { ...font('semibold', 14, { color: 'rgba(255,255,255,0.8)' }), lineHeight: 20 },
  bottom: { gap: 10 },
  pills: { flexDirection: 'row', gap: 10 },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  pillText: { ...font('extrabold', 16, { color: '#ffffff' }), letterSpacing: -0.3 },
  pillUnit: font('semibold', 11.5, { color: 'rgba(255,255,255,0.75)' }),
  footRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 },
  hint: font('semibold', 12.5, { color: 'rgba(255,255,255,0.85)' }),
  undo: font('bold', 12.5, { color: '#ffffff' }),
  partnerLine: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dash: {
    flex: 1,
    height: 0,
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(253,224,71,0.75)',
  },
  partnerTag: { ...font('bold', 11.5, { color: '#fde68a' }) },
  meFloat: { position: 'absolute', top: 0 },
  stream: {
    position: 'absolute',
    top: 0,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    backgroundColor: '#7dd3fc',
  },
});

import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';

import { Floating, PopOnChange } from '@/components/motion';
import { successHaptic } from '@/lib/feedback';
import { font, scaleForRole } from '@/theme/typography';
import { palette, radius, surfaceShadow } from '@/theme/tokens';

import { PopChip, PulseRing } from './ios';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const IC_PUSHUP = require('../../../assets/ic-pushup.png');
const HERO_COUPLE = require('../../../assets/couple-hero.png');
const BADGE_VS = require('../../../assets/badge-vs.png');

/* ========================================================================= */
/* Step 2 — the rep counter                                                   */
/* ========================================================================= */

const RING = 212;
const RING_STROKE = 14;
const RING_R = (RING - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_R;
const GOAL_REPS = 12;

/**
 * A live-looking rep counter: the ring fills, the number pops, a "clean rep"
 * chip confirms each one. It loops, so the screen never reads as a screenshot.
 */
export function RepCounterVisual() {
  const [reps, setReps] = useState(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    const id = setInterval(() => setReps((r) => (r >= GOAL_REPS ? 0 : r + 1)), 720);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    progress.value = withTiming(reps / GOAL_REPS, {
      duration: reps === 0 ? 260 : 560,
      easing: Easing.out(Easing.cubic),
    });
  }, [reps, progress]);

  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: RING_C * (1 - progress.value) }));
  const full = reps === GOAL_REPS;

  return (
    <View style={v.counterWrap}>
      <View style={v.ringBox}>
        <Svg width={RING} height={RING}>
          <Circle cx={RING / 2} cy={RING / 2} r={RING_R} stroke="rgba(15,31,23,0.07)" strokeWidth={RING_STROKE} fill="none" />
          <AnimatedCircle
            cx={RING / 2}
            cy={RING / 2}
            r={RING_R}
            stroke={full ? palette.amber500 : palette.green500}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={`${RING_C} ${RING_C}`}
            animatedProps={ringProps}
            fill="none"
            rotation={-90}
            origin={`${RING / 2}, ${RING / 2}`}
          />
        </Svg>
        <View style={v.ringCenter}>
          <PopOnChange trigger={reps} scale={1.14}>
            <Text style={v.repNumber} {...scaleForRole('display')}>{reps}</Text>
          </PopOnChange>
          <Text style={v.repLabel} {...scaleForRole('control')}>{full ? 'SET DONE 🎉' : 'REPS'}</Text>
        </View>
      </View>

      <Floating distance={7} style={v.pushupBadge}>
        <View style={v.pushupBubble}>
          <Image source={IC_PUSHUP} style={{ width: 46, height: 46 }} contentFit="contain" />
        </View>
      </Floating>

      <Floating distance={5} delay={500} style={v.cleanChip}>
        <PopOnChange trigger={reps} scale={1.1}>
          <View style={v.chip}>
            <Text style={font('extrabold', 12, { color: palette.green700 })} {...scaleForRole('control')}>✓ Clean rep</Text>
          </View>
        </PopOnChange>
      </Floating>

      <Floating distance={6} delay={900} style={v.formChip}>
        <View style={[v.chip, { backgroundColor: palette.blue50 }]}>
          <Text style={font('extrabold', 12, { color: palette.blue700 })} {...scaleForRole('control')}>📐 Form score</Text>
        </View>
      </Floating>
    </View>
  );
}

/* ========================================================================= */
/* Step 3 — train as two                                                      */
/* ========================================================================= */

/** The pair, with the shared streak and a live duel orbiting them. */
export function CoupleVisual() {
  return (
    <View style={v.coupleWrap}>
      <View style={v.coupleGlow}>
        <PulseRing size={250} color={palette.green400} />
      </View>
      <Image source={HERO_COUPLE} style={v.coupleImg} contentFit="cover" />
      <Floating distance={6} delay={200} style={v.vsBadge}>
        <Image source={BADGE_VS} style={{ width: 56, height: 37 }} contentFit="contain" />
      </Floating>
      <Floating distance={5} delay={600} style={v.streakChip}>
        <PopChip delay={400}>
          <View style={[v.chip, { backgroundColor: palette.amber50 }]}>
            <Text style={font('extrabold', 12, { color: palette.amber800 })} {...scaleForRole('control')}>🔥 Shared streak</Text>
          </View>
        </PopChip>
      </Floating>
      <Floating distance={6} delay={1000} style={v.duelChip}>
        <PopChip delay={700}>
          <View style={[v.chip, { backgroundColor: palette.purple100 }]}>
            <Text style={font('extrabold', 12, { color: palette.purple900 })} {...scaleForRole('control')}>⚔️ Live duel</Text>
          </View>
        </PopChip>
      </Floating>
    </View>
  );
}

/* ========================================================================= */
/* "Half reps don't count" — a rep that stops short, then one that lands      */
/* ========================================================================= */

type RepResult = 'idle' | 'miss' | 'hit';

const TRACK_H = 150;
const DOT = 38;
const DEPTH_AT = 0.78;

/**
 * Plays the rule rather than stating it: the dot dips part-way and is refused
 * ("not counted — go deeper"), then goes all the way down and earns the rep.
 */
export function HalfRepDemo() {
  const y = useSharedValue(0);
  const [result, setResult] = useState<RepResult>('idle');
  const [count, setCount] = useState(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let cancelled = false;
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(() => !cancelled && fn(), ms));

    const cycle = () => {
      setResult('idle');
      y.value = withTiming(0.5, { duration: 760, easing: Easing.inOut(Easing.cubic) });
      at(780, () => setResult('miss'));
      at(1900, () => {
        y.value = withTiming(0, { duration: 620, easing: Easing.inOut(Easing.cubic) });
      });
      at(2700, () => {
        setResult('idle');
        y.value = withTiming(1, { duration: 760, easing: Easing.inOut(Easing.cubic) });
      });
      at(3500, () => {
        setResult('hit');
        setCount((c) => c + 1);
      });
      at(4700, () => {
        y.value = withTiming(0, { duration: 620, easing: Easing.inOut(Easing.cubic) });
      });
      at(5600, cycle);
    };
    cycle();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [y]);

  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value * (TRACK_H - DOT) }],
  }));

  const miss = result === 'miss';
  const hit = result === 'hit';
  const tone = miss ? palette.red500 : hit ? palette.green500 : palette.ink;

  return (
    <View style={v.demoCard}>
      <View style={v.demoTrackBox}>
        <View style={v.demoTrack} />
        <View style={[v.depthLine, { top: DEPTH_AT * TRACK_H + DOT / 2 }]}>
          <View style={v.depthDash} />
          <Text style={v.depthLabel} allowFontScaling={false}>DEPTH</Text>
        </View>
        <Animated.View
          style={[v.demoDot, { backgroundColor: tone, shadowColor: tone }, dotStyle]}
        >
          <Text style={{ fontSize: 18 }} allowFontScaling={false}>{miss ? '✕' : hit ? '✓' : '🏋️'}</Text>
        </Animated.View>
      </View>

      <View style={v.demoRight}>
        <Text style={v.demoKicker} {...scaleForRole('control')}>THIS REP</Text>
        <View style={v.demoResultBox}>
          {result === 'idle' ? (
            <Text style={[v.demoResult, { color: palette.grey500 }]} {...scaleForRole('display')}>Checking…</Text>
          ) : (
            <Animated.View key={result + count} entering={FadeIn.duration(180)} style={v.demoResultPop}>
              <Text style={[v.demoResult, { color: tone }]} {...scaleForRole('display')}>{miss ? 'Half rep' : 'Full rep'}</Text>
            </Animated.View>
          )}
        </View>
        <Text style={[v.demoSub, { color: miss ? palette.red500 : hit ? palette.green700 : palette.grey600 }]} {...scaleForRole('control')}>
          {miss ? 'Not counted. Go deeper.' : hit ? 'Counted. +1 rep' : 'Watching depth, tempo, form'}
        </Text>
        <View style={v.demoTally}>
          <Text style={v.demoTallyNum} {...scaleForRole('display')}>{count}</Text>
          <Text style={v.demoTallyLabel} {...scaleForRole('control')}> counted</Text>
        </View>
      </View>
    </View>
  );
}

/* ========================================================================= */
/* "Prop your phone up" — the camera's view of you                            */
/* ========================================================================= */

/** Side-on diagram: phone on the left, the camera's cone, you two metres away. */
export function SpaceDiagram() {
  const pulse = useSharedValue(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!reduced) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      );
    }
    const t = setTimeout(successHaptic, 1100);
    return () => clearTimeout(t);
  }, [pulse, reduced]);

  const coneStyle = useAnimatedStyle(() => ({ opacity: 0.65 + pulse.value * 0.35 }));

  return (
    <View style={v.spaceBox}>
      <Animated.View style={[StyleSheet.absoluteFill, coneStyle]}>
        <Svg width="100%" height="100%" viewBox="0 0 300 150">
          <Defs>
            <SvgGradient id="cone" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={palette.green400} stopOpacity="0.55" />
              <Stop offset="1" stopColor={palette.green400} stopOpacity="0.08" />
            </SvgGradient>
          </Defs>
          <Path d="M 52 75 L 246 8 L 246 142 Z" fill="url(#cone)" />
          <Line x1="0" y1="144" x2="300" y2="144" stroke="rgba(15,31,23,0.1)" strokeWidth="2" />
          <Line x1="58" y1="128" x2="240" y2="128" stroke={palette.amber500} strokeWidth="2" strokeDasharray="4 5" />
        </Svg>
      </Animated.View>

      <View style={v.stoolWrap}>
        <Floating distance={3} duration={3200}>
          <View style={v.spacePhone}>
            <View style={v.spacePhoneLens} />
          </View>
        </Floating>
        <View style={v.stool} />
      </View>

      <Floating distance={4} delay={300} style={v.personWrap}>
        <Text allowFontScaling={false} style={{ fontSize: 58 }}>🧍</Text>
      </Floating>

      <View style={v.distPill}>
        <Text style={font('extrabold', 12, { color: palette.amber800 })} {...scaleForRole('control')}>≈ 2 m</Text>
      </View>

      <PopChip delay={900} style={v.frameChip}>
        <View style={[v.chip, { backgroundColor: palette.green600 }]}>
          <Text style={font('extrabold', 12, { color: palette.white })} {...scaleForRole('control')}>✓ Full body in frame</Text>
        </View>
      </PopChip>
    </View>
  );
}

/* ========================================================================= */
/* Sign-in — what you are saving                                              */
/* ========================================================================= */

const VAULT_ITEMS = [
  { icon: '🔥', label: 'Streak', tint: palette.amber50, pos: { top: 4, left: 6 } },
  { icon: '🏆', label: 'League', tint: palette.green50, pos: { top: 4, right: 6 } },
  { icon: '📈', label: 'Records', tint: palette.blue50, pos: { bottom: 0, alignSelf: 'center' as const } },
] as const;

/** A glowing "saved" badge with the things it protects orbiting it. */
export function VaultVisual() {
  return (
    <View style={v.vaultBox}>
      <View style={v.vaultCenter}>
        <PulseRing size={104} color={palette.green500}>
          <LinearGradient colors={[palette.green400, palette.green700]} style={v.vaultBadge}>
            <View style={v.vaultShine} />
            <Text allowFontScaling={false} style={{ fontSize: 44 }}>☁️</Text>
            <View style={v.vaultTick}>
              <Text style={font('extrabold', 16, { color: palette.white, lineHeight: 20 })} allowFontScaling={false}>✓</Text>
            </View>
          </LinearGradient>
        </PulseRing>
      </View>
      {VAULT_ITEMS.map((it, i) => (
        <Floating key={it.label} distance={5} delay={i * 450} style={[v.vaultChip, it.pos]}>
          <PopChip delay={300 + i * 160}>
            <View style={[v.vaultChipInner, { backgroundColor: it.tint }]}>
              <Text allowFontScaling={false} style={{ fontSize: 17 }}>{it.icon}</Text>
              <Text style={font('extrabold', 13, { color: palette.ink })} {...scaleForRole('control')}>{it.label}</Text>
            </View>
          </PopChip>
        </Floating>
      ))}
    </View>
  );
}

/* ========================================================================= */
/* Offer — the Pro badge, and a celebration burst                             */
/* ========================================================================= */

/** The Pro crown, with a sheen sweeping across it and a glow behind. */
export function CrownBadge() {
  const sweep = useSharedValue(-1);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    sweep.value = withRepeat(
      withDelay(700, withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.cubic) })),
      -1,
    );
  }, [sweep, reduced]);
  const sheen = useAnimatedStyle(() => ({ transform: [{ translateX: sweep.value * 130 }, { rotate: '18deg' }] }));

  return (
    <Floating distance={6}>
      <PulseRing size={148} color={palette.green400}>
        <LinearGradient colors={[palette.green400, palette.green700]} style={v.crown}>
          <Animated.View pointerEvents="none" style={[v.crownSheen, sheen]} />
          <Text allowFontScaling={false} style={{ fontSize: 50 }}>👑</Text>
          <Text style={font('extrabold', 17, { color: palette.white, letterSpacing: 2 })} allowFontScaling={false}>PRO</Text>
        </LinearGradient>
      </PulseRing>
    </Floating>
  );
}

function Particle({ emoji, angle, dist, delay }: { emoji: string; angle: number; dist: number; delay: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withTiming(1, { duration: 900 }));
  }, [t, delay]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value < 0.05 ? 0 : 1 - Math.max(0, t.value - 0.8) * 5,
    transform: [
      { translateX: Math.cos(angle) * dist * t.value },
      { translateY: Math.sin(angle) * dist * t.value + t.value * t.value * 14 },
      { scale: 0.5 + t.value * 0.7 },
      { rotate: `${t.value * 200}deg` },
    ],
  }));
  return <Animated.Text allowFontScaling={false} style={[{ position: 'absolute', fontSize: 22 }, style]}>{emoji}</Animated.Text>;
}

/** Emoji flung outward from the centre once on mount. */
export function Burst({ emojis = ['🎉', '✨', '🔥', '⭐', '💪', '🏆'], count = 14 }: { emojis?: string[]; count?: number }) {
  const parts = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        emoji: emojis[i % emojis.length] ?? '✨',
        angle: (i / count) * Math.PI * 2 + (i % 2) * 0.2,
        dist: 90 + (i % 3) * 34,
        delay: (i % 4) * 40,
      })),
    [emojis, count],
  );
  return (
    <View pointerEvents="none" style={v.burst}>
      {parts.map((p, i) => (
        <Particle key={i} {...p} />
      ))}
    </View>
  );
}

const v = StyleSheet.create({
  chip: {
    borderRadius: radius.pill,
    backgroundColor: palette.green50,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
    ...surfaceShadow,
  },

  counterWrap: { width: 300, height: 250, alignItems: 'center', justifyContent: 'center' },
  ringBox: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  repNumber: { ...font('extrabold', 78, { color: palette.ink }), letterSpacing: -3, fontVariant: ['tabular-nums'] },
  repLabel: { ...font('extrabold', 12, { color: palette.grey600 }), letterSpacing: 2.5, marginTop: -4 },
  pushupBadge: { position: 'absolute', top: 2, left: 6 },
  pushupBubble: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...surfaceShadow,
  },
  cleanChip: { position: 'absolute', bottom: 14, right: 0 },
  formChip: { position: 'absolute', top: 18, right: 2 },

  coupleWrap: { width: 300, height: 250, alignItems: 'center', justifyContent: 'center' },
  coupleGlow: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  coupleImg: {
    width: 268,
    height: 190,
    borderRadius: radius['4xl'],
    overflow: 'hidden',
    shadowColor: '#0b2313',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 22,
  },
  vsBadge: { position: 'absolute', top: 20, alignSelf: 'center' },
  streakChip: { position: 'absolute', bottom: 8, left: 0 },
  duelChip: { position: 'absolute', top: 38, right: 0 },

  demoCard: {
    flexDirection: 'row',
    gap: 18,
    padding: 18,
    borderRadius: 26,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
    ...surfaceShadow,
  },
  demoTrackBox: { width: 78, height: TRACK_H, alignItems: 'center' },
  demoTrack: {
    position: 'absolute',
    top: DOT / 2,
    bottom: DOT / 2,
    width: 8,
    borderRadius: 4,
    backgroundColor: palette.divider,
  },
  depthLine: { position: 'absolute', left: -4, right: -4, flexDirection: 'row', alignItems: 'center' },
  depthDash: { flex: 1, height: 0, borderTopWidth: 2, borderStyle: 'dashed', borderColor: palette.amber500 },
  depthLabel: { ...font('extrabold', 9, { color: palette.amber800 }), letterSpacing: 1.2, marginLeft: 4 },
  demoDot: {
    position: 'absolute',
    top: 0,
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  demoRight: { flex: 1, justifyContent: 'center' },
  demoKicker: { ...font('extrabold', 10.5, { color: palette.grey600 }), letterSpacing: 2 },
  demoResultBox: { minHeight: 38, justifyContent: 'center', marginTop: 4 },
  demoResultPop: {},
  demoResult: { ...font('extrabold', 28, { color: palette.ink }), letterSpacing: -0.8 },
  demoSub: { ...font('bold', 13), marginTop: 2 },
  demoTally: { flexDirection: 'row', alignItems: 'baseline', marginTop: 14 },
  demoTallyNum: { ...font('extrabold', 30, { color: palette.ink }), fontVariant: ['tabular-nums'] },
  demoTallyLabel: font('bold', 13, { color: palette.grey600 }),

  spaceBox: { width: '100%', maxWidth: 340, aspectRatio: 2, alignSelf: 'center' },
  stoolWrap: { position: 'absolute', left: '3%', top: '24%', alignItems: 'center' },
  spacePhone: {
    width: 34,
    height: 62,
    borderRadius: 9,
    backgroundColor: palette.inkSoft,
    padding: 3,
    alignItems: 'center',
    ...surfaceShadow,
  },
  spacePhoneLens: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: palette.green400, marginTop: 2 },
  stool: { width: 26, height: 34, borderRadius: 5, backgroundColor: palette.borderStrong },
  personWrap: { position: 'absolute', left: '74%', top: '22%' },
  distPill: {
    position: 'absolute',
    left: '38%',
    bottom: '2%',
    backgroundColor: palette.amber50,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  frameChip: { position: 'absolute', top: -6, right: 0 },

  vaultBox: { width: 300, height: 250, alignItems: 'center', justifyContent: 'center' },
  vaultCenter: { alignItems: 'center', justifyContent: 'center' },
  vaultBadge: {
    width: 92,
    height: 92,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: palette.green600,
    shadowOpacity: 0.45,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  vaultShine: {
    position: 'absolute',
    top: -30,
    left: -10,
    width: 120,
    height: 60,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  vaultTick: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: palette.green700,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: palette.white,
  },
  vaultChip: { position: 'absolute' },
  vaultChipInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
    ...surfaceShadow,
  },

  crown: {
    width: 120,
    height: 120,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: palette.green600,
    shadowOpacity: 0.5,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  crownSheen: {
    position: 'absolute',
    top: -20,
    width: 36,
    height: 170,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  burst: { position: 'absolute', alignItems: 'center', justifyContent: 'center', width: 1, height: 1 },
});

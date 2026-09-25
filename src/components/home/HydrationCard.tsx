import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutUp,
  SensorType,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedSensor,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, Path, Rect } from 'react-native-svg';

import { BearJar, type BearTheme } from '@/components/home/BearJar';
import { Capsule, HealthCard, IOS, Metric, PersonRow } from '@/components/home/HealthCard';
import { DRINK_KINDS, DRINK_META, drinkLayers, parseDrinkKind, type DrinkKind } from '@/domain/drinkKinds';
import {
  DEFAULT_DAILY_GOAL_ML,
  DRINK_SIZES_ML,
  MAX_DAILY_GOAL_ML,
  MIN_DAILY_GOAL_ML,
  type DrinkEntry,
  type HydrationProgress,
  formatMl,
} from '@/domain/hydration';
import { lightImpactHaptic, selectionHaptic } from '@/lib/feedback';
import { font } from '@/theme/typography';

const INK = '#0f172a';
/* The partner wears the same hue, lighter — one metric, two people. */
const PARTNER = 'rgba(50,173,230,0.45)';

/** Mine rose, theirs lavender — two bears, two personalities. */
const MY_BEAR: BearTheme = { body: '#ffe4ec', rim: '#f9a8c9', tint: '#fb7185' };
const THEIR_BEAR: BearTheme = { body: '#e6e8ff', rim: '#a5b4fc', tint: '#8b5cf6' };

interface Person {
  name: string;
  avatar?: string | null;
}

/**
 * Hydration, in the Health app's grammar: today's amount large, a capsule to
 * the goal, and — when paired — the partner's line beneath, each with a small
 * bear that fills as the day does.
 *
 * My bear shows what I drank as coloured layers in the order I drank it; my
 * partner's shows their shared total. Pour repeats the last drink (water
 * 250 ml to start) and a hold opens a picker of drinks and sizes. The goal
 * steps in an iOS stepper, and Undo takes the last drink back. A pour from
 * the partner arrives live as a line beside the number.
 */
export function HydrationCard({
  water,
  drinks,
  partner,
  partnerMl,
  partnerGoalMl,
  partnerLayers,
  onLogWater,
  onUndoWater,
  onStepWaterGoal,
}: {
  water: HydrationProgress;
  /** Today's drinks, for my bear's layers. */
  drinks: readonly DrinkEntry[];
  me: Person;
  partner: Person | null;
  partnerMl: number | null;
  /** Their own goal when their app shares it; otherwise the default. */
  partnerGoalMl?: number | null;
  /** Their drinks as layers (kind + ml), bottom to top; empty reads as water. */
  partnerLayers?: readonly { k: string; ml: number }[];
  onLogWater: (ml: number, kind: DrinkKind) => void;
  onUndoWater?: () => void;
  onStepWaterGoal: (direction: 1 | -1) => void;
}) {
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  /* Shared liquid motion: drift, and tilt with the phone. */
  const phase = useSharedValue(0);
  useEffect(() => {
    if (reduced) {
      cancelAnimation(phase);
      return;
    }
    phase.value = withRepeat(withTiming(2 * Math.PI, { duration: 3000, easing: Easing.linear }), -1);
    return () => cancelAnimation(phase);
  }, [reduced, phase]);
  const gravity = useAnimatedSensor(SensorType.GRAVITY, { interval: 32 });
  const tilt = useSharedValue(0);
  useDerivedValue(() => {
    if (reduced) return;
    const gx = gravity.sensor.value.x ?? 0;
    const target = Math.max(-0.25, Math.min(0.25, gx / 9.81 / 2));
    tilt.value = tilt.value + (target - tilt.value) * 0.12;
  });

  /* My layers, oldest at the bottom. */
  const layers = useMemo(() => {
    const list = drinkLayers(drinks);
    const total = list.reduce((s, l) => s + l.ml, 0) || 1;
    return list.map((l) => ({ color: DRINK_META[l.kind].color, share: l.ml / total }));
  }, [drinks]);

  /* The "+": tap repeats the last choice; hold opens the picker. */
  const [choice, setChoice] = useState<{ kind: DrinkKind; ml: number }>({ kind: 'water', ml: 250 });
  const [picking, setPicking] = useState(false);
  const [size, setSize] = useState<number>(250);
  const [myPour, setMyPour] = useState(0);
  const add = (kind: DrinkKind, ml: number) => {
    onLogWater(ml, kind);
    setChoice({ kind, ml });
    setMyPour((n) => n + 1);
    setPicking(false);
  };

  /* Partner, live. The first value is a baseline — opening the app is not
     them drinking. */
  const lastPartner = useRef<number | null>(partnerMl);
  const [theirPour, setTheirPour] = useState(0);
  const [live, setLive] = useState<{ id: number; ml: number } | null>(null);
  useEffect(() => {
    const before = lastPartner.current;
    lastPartner.current = partnerMl;
    if (before == null || partnerMl == null || partnerMl <= before) return;
    lightImpactHaptic();
    setTheirPour((n) => n + 1);
    setLive((l) => ({ id: (l?.id ?? 0) + 1, ml: partnerMl - before }));
    const t = setTimeout(() => setLive(null), 3600);
    return () => clearTimeout(t);
  }, [partnerMl]);

  /* Their jar fills against their own goal — shared by their app — so a full
     bear means they really met it. Older apps share none: the default. */
  const theirGoal = partnerGoalMl && partnerGoalMl > 0 ? partnerGoalMl : DEFAULT_DAILY_GOAL_ML;
  const partnerPercent =
    partnerMl == null ? 0 : Math.min(100, Math.round((partnerMl / theirGoal) * 100));
  const partnerMet = partnerMl != null && partnerMl >= theirGoal;
  const theirLayers = useMemo(() => {
    const list = partnerLayers ?? [];
    const total = list.reduce((sum, l) => sum + l.ml, 0) || 1;
    return list.map((l) => ({ color: DRINK_META[parseDrinkKind(l.k)].color, share: l.ml / total }));
  }, [partnerLayers]);
  /* What they just had, for the live banner: their newest layer's kind. */
  const theirLatest = parseDrinkKind(partnerLayers?.[partnerLayers.length - 1]?.k);
  const bothMet = water.met && partnerMet;

  const atMin = water.goalMl <= MIN_DAILY_GOAL_ML;
  const atMax = water.goalMl >= MAX_DAILY_GOAL_ML;

  const meta = DRINK_META[choice.kind];
  const [amount, unit] = splitMl(water.ml);

  /* One quiet line of news beside the number: a live pour from them wins,
     then a shared goal, then who is ahead. */
  const news =
    live && partner
      ? theirLatest === 'water'
        ? `${partner.name} +${formatMl(live.ml)}`
        : `${partner.name} ${DRINK_META[theirLatest].emoji} +${formatMl(live.ml)}`
      : bothMet && partner
        ? '🥂 Both goals met'
        : null;

  return (
    <View onLayout={onLayout}>
      <HealthCard
        icon="💧"
        title="Hydration"
        tint={IOS.water}
        trailing={water.met ? 'Goal met' : `${formatMl(water.remainingMl)} to go`}
      >
        <View style={styles.metricRow}>
          <View style={{ flex: 1 }}>
            <Metric value={amount} unit={`${unit} of ${formatMl(water.goalMl)}`} />
            {news ? (
              <Animated.Text
                key={live?.id ?? 'news'}
                entering={FadeInDown.springify().damping(14)}
                exiting={FadeOutUp.duration(250)}
                style={[styles.news, live ? { color: IOS.water } : null]}
                numberOfLines={1}
              >
                {news}
              </Animated.Text>
            ) : null}
          </View>
          {/* The bear, small: the one piece of charm the card keeps. */}
          {width > 0 ? (
            <BearJar
              id="me"
              percent={water.percent}
              width={46}
              theme={MY_BEAR}
              layers={layers}
              tilt={tilt}
              phase={phase}
              pourKey={myPour}
              met={water.met}
            />
          ) : null}
        </View>
        <Capsule fraction={water.percent / 100} color={IOS.water} />

        {partner ? (
          <View style={styles.partner}>
            <PersonRow
              name={partner.name}
              avatar={partner.avatar}
              color={PARTNER}
              fraction={partnerPercent / 100}
              value={partnerMl == null ? 'Not shared yet' : `${formatMl(partnerMl)} of ${formatMl(theirGoal)}`}
              muted={partnerMl == null}
              leading={
                <BearJar
                  id="partner"
                  percent={partnerPercent}
                  width={30}
                  theme={THEIR_BEAR}
                  layers={theirLayers}
                  tilt={tilt}
                  phase={phase}
                  pourKey={theirPour}
                  met={partnerMet}
                />
              }
            />
          </View>
        ) : null}

        {/* Picker, on hold of Pour. */}
        {picking ? (
          <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(140)} style={styles.picker}>
            <View style={styles.sizes}>
              {DRINK_SIZES_ML.map((ml) => (
                <Pressable
                  key={ml}
                  onPress={() => {
                    selectionHaptic();
                    setSize(ml);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: size === ml }}
                  style={[styles.size, size === ml && styles.sizeOn]}
                >
                  <Text style={[styles.sizeText, size === ml && styles.sizeTextOn]}>{formatMl(ml)}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.kinds}>
              {DRINK_KINDS.map((kind) => {
                const m = DRINK_META[kind];
                return (
                  <Pressable
                    key={kind}
                    onPress={() => add(kind, size)}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${formatMl(size)} of ${m.label.toLowerCase()}`}
                    style={({ pressed }) => [styles.kind, pressed && { opacity: 0.6 }]}
                  >
                    <View style={[styles.kindDot, { backgroundColor: m.color }]}>
                      <Text style={styles.kindEmoji}>{m.emoji}</Text>
                    </View>
                    <Text style={styles.kindLabel}>{m.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>
        ) : null}

        {/* Controls: goal stepper · undo · pour (hold for more drinks). */}
        <View style={styles.controls}>
          <View style={styles.stepper}>
            <Pressable
              onPress={() => onStepWaterGoal(-1)}
              disabled={atMin}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Lower the water goal"
              style={[styles.stepBtn, atMin && styles.off]}
            >
              <Text style={styles.stepGlyph}>−</Text>
            </Pressable>
            <View style={styles.stepDivider} />
            <Pressable
              onPress={() => onStepWaterGoal(1)}
              disabled={atMax}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Raise the water goal"
              style={[styles.stepBtn, atMax && styles.off]}
            >
              <Text style={styles.stepGlyph}>+</Text>
            </Pressable>
          </View>
          <Text style={styles.goalCaption}>Goal</Text>

          <View style={{ flex: 1 }} />

          {onUndoWater ? (
            <Pressable
              onPress={() => {
                selectionHaptic();
                onUndoWater();
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Undo the last drink"
              style={styles.undo}
            >
              <Text style={styles.undoText}>↺</Text>
            </Pressable>
          ) : null}

          <PourButton
            color={meta.color}
            label={`${meta.emoji} ${formatMl(choice.ml)}`}
            open={picking}
            onPress={() => (picking ? setPicking(false) : add(choice.kind, choice.ml))}
            onLongPress={() => {
              lightImpactHaptic();
              setPicking(true);
            }}
          />
        </View>
      </HealthCard>
    </View>
  );
}

/** "1.25 L" → ["1.25", "L"], so the number can be large and the unit small. */
function splitMl(ml: number): [string, string] {
  const text = formatMl(ml);
  const at = text.lastIndexOf(' ');
  return at < 0 ? [text, ''] : [text.slice(0, at), text.slice(at + 1)];
}

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/* The glass, in a 24 x 28 box: a tapered tumbler with a rounded foot. */
const GLASS = 'M4 3 H20 L18.2 24.6 Q18 26.4 16.2 26.4 H7.8 Q6 26.4 5.8 24.6 Z';
const GLASS_TOP = 3;
const GLASS_BOTTOM = 26.4;
/** Where the drink rests in the glass between pours, as a fraction full. */
const REST_LEVEL = 0.5;

/**
 * The add button: a pill with a little glass that holds the chosen drink.
 *
 * Deliberately not a round "+" — Home's floating action button already is
 * one, and two plus circles a thumb apart read as the same control. This one
 * says what it does: a drop falls into the glass, the drink rises and
 * settles, and the label names the drink and size it just poured. Hold opens
 * the picker, and the pill turns into its close button.
 */
function PourButton({
  color,
  label,
  open,
  onPress,
  onLongPress,
}: {
  color: string;
  label: string;
  open: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const squeeze = useSharedValue(1);
  const level = useSharedValue(REST_LEVEL);
  const drop = useSharedValue(0);

  const press = () => {
    squeeze.set(withSequence(withTiming(0.94, { duration: 80 }), withTiming(1, { duration: 180 })));
    if (!reduceMotion) {
      drop.set(0);
      drop.set(withTiming(1, { duration: 260, easing: Easing.in(Easing.quad) }));
      level.set(
        withSequence(
          withTiming(REST_LEVEL, { duration: 200 }),
          withTiming(0.86, { duration: 220, easing: Easing.out(Easing.cubic) }),
          withTiming(REST_LEVEL, { duration: 700, easing: Easing.inOut(Easing.quad) }),
        ),
      );
    }
    onPress();
  };

  const pill = useAnimatedStyle(() => ({ transform: [{ scale: squeeze.value }] }));
  const liquid = useAnimatedProps(() => {
    const y = GLASS_BOTTOM - level.value * (GLASS_BOTTOM - GLASS_TOP);
    return { y, height: GLASS_BOTTOM - y + 1 };
  });
  const falling = useAnimatedProps(() => ({
    cy: -2 + drop.value * 16,
    opacity: drop.value > 0 && drop.value < 1 ? 1 : 0,
  }));

  /* Pale drinks need a darker outline to read against the pale pill. */
  const pale = color === DRINK_META.milk.color || color === DRINK_META.lemonade.color;
  const rim = pale ? '#94a3b8' : color;

  return (
    <Pressable
      onPress={press}
      onLongPress={onLongPress}
      delayLongPress={320}
      accessibilityRole="button"
      accessibilityLabel={open ? 'Close the drink picker' : `Pour ${label}. Hold for more drinks`}
    >
      <Animated.View style={[styles.pour, { backgroundColor: `${color}24` }, pill]}>
        {open ? (
          <Svg width={24} height={28} viewBox="0 0 24 28">
            <Path d="M7 8 L17 18 M17 8 L7 18" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
          </Svg>
        ) : (
          <Svg width={24} height={28} viewBox="0 -4 24 32">
            <Defs>
              <ClipPath id="pour-glass">
                <Path d={GLASS} />
              </ClipPath>
            </Defs>
            <Path d={GLASS} fill="#ffffff" />
            <AnimatedRect x={0} width={24} fill={color} clipPath="url(#pour-glass)" animatedProps={liquid} />
            <AnimatedCircle cx={12} r={2.2} fill={color} animatedProps={falling} />
            <Path d={GLASS} fill="none" stroke={rim} strokeWidth={1.6} strokeLinejoin="round" />
            <Path d="M7.2 6.5 L8.4 21" stroke="#ffffff" strokeOpacity={0.8} strokeWidth={1.4} strokeLinecap="round" />
          </Svg>
        )}
        <View>
          <Text style={styles.pourTitle}>{open ? 'Close' : 'Pour'}</Text>
          {open ? null : <Text style={styles.pourSub}>{label}</Text>}
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  metricRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: 4, marginBottom: 10 },
  news: font('semibold', 12.5, { color: IOS.secondary, marginTop: 2 }),
  partner: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: IOS.separator,
  },
  picker: {
    marginTop: 14,
    padding: 12,
    borderRadius: 16,
    backgroundColor: IOS.fill,
    gap: 12,
  },
  sizes: { flexDirection: 'row', backgroundColor: 'rgba(118,118,128,0.12)', borderRadius: 9, padding: 2 },
  size: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 7 },
  sizeOn: { backgroundColor: '#ffffff', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3, elevation: 1 },
  sizeText: font('medium', 13, { color: IOS.label }),
  sizeTextOn: font('bold', 13, { color: IOS.label }),
  kinds: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  kind: { width: '24%', alignItems: 'center' },
  kindDot: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  kindEmoji: { fontSize: 18 },
  kindLabel: { ...font('medium', 11.5, { color: IOS.label }), marginTop: 4 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  /* The iOS stepper: one grey capsule, split down the middle. */
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(118,118,128,0.12)',
    borderRadius: 9,
    height: 34,
  },
  stepBtn: { width: 44, height: 34, alignItems: 'center', justifyContent: 'center' },
  stepGlyph: { ...font('medium', 20, { color: IOS.label }), lineHeight: 23 },
  stepDivider: { width: StyleSheet.hairlineWidth * 2, height: 18, backgroundColor: 'rgba(60,60,67,0.25)' },
  goalCaption: font('medium', 12.5, { color: IOS.secondary }),
  off: { opacity: 0.3 },
  undo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: IOS.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  undoText: font('bold', 16, { color: IOS.secondary }),
  pour: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 8,
    paddingRight: 14,
    borderRadius: 20,
  },
  pourTitle: font('bold', 13.5, { color: IOS.label }),
  pourSub: { ...font('medium', 10.5, { color: IOS.secondary }), marginTop: -2 },
});

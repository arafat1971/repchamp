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
  useAnimatedSensor,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { BearJar, type BearTheme } from '@/components/home/BearJar';
import { HomeSectionHeader } from '@/components/home/HomeSectionHeader';
import { LemonAvatar } from '@/components/home/LemonAvatar';
import { CountUp } from '@/components/motion';
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
const MUTED = '#64748b';
const HAIR = '#e2e8f0';

/** Mine rose, theirs lavender — two bears, two personalities. */
const MY_BEAR: BearTheme = { body: '#ffe4ec', rim: '#f9a8c9', tint: '#fb7185' };
const THEIR_BEAR: BearTheme = { body: '#e6e8ff', rim: '#a5b4fc', tint: '#8b5cf6' };

interface Person {
  name: string;
  avatar?: string | null;
}

/**
 * Hydration, minimal: two bear jars on the page and one row of controls.
 *
 * My bear shows what I drank as coloured layers in the order I drank it —
 * water, then a coffee, then juice — each with its own wavy top. My partner's
 * bear shows their shared total (kinds stay on their phone) in water blue.
 *
 * One liquid "+" does the logging: tap to add my last drink again (water
 * 250 ml to start), hold to open a picker of drinks and sizes. The goal steps
 * in a small capsule beside it, and Undo takes the last drink back.
 *
 * My partner's bear fills against my goal (theirs is not synced) so the two
 * compare honestly; it squishes live when they drink, with a banner and a tap.
 */
export function HydrationCard({
  water,
  drinks,
  me,
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

  const bearW = partner ? Math.min(118, (width - 40) / 2) : 130;
  const meta = DRINK_META[choice.kind];

  return (
    <View onLayout={onLayout}>
      <HomeSectionHeader
        title="Hydration"
        right={
          <Text style={[styles.headStat, water.met && styles.headStatMet]}>
            {water.met ? 'Goal met ✓' : `${formatMl(water.remainingMl)} to go`}
          </Text>
        }
      />

      <View style={styles.status}>
        {live && partner ? (
          <Animated.Text
            key={live.id}
            entering={FadeInDown.springify().damping(14)}
            exiting={FadeOutUp.duration(250)}
            style={styles.live}
          >
            {theirLatest === 'water'
              ? `${partner.name} just drank ${formatMl(live.ml)} 💧`
              : `${partner.name} had ${DRINK_META[theirLatest].label.toLowerCase()} ${DRINK_META[theirLatest].emoji} · ${formatMl(live.ml)}`}
          </Animated.Text>
        ) : bothMet && partner ? (
          <Text style={styles.cheers}>🥂 You both hit your goal</Text>
        ) : partner && partnerMl != null ? (
          <Text style={styles.race}>
            {water.ml >= partnerMl
              ? `${formatMl(water.ml - partnerMl)} ahead of ${partner.name}`
              : `${partner.name} is ${formatMl(partnerMl - water.ml)} ahead`}
          </Text>
        ) : null}
      </View>

      {width > 0 ? (
        <View style={styles.bears}>
          <BearColumn
            id="me"
            person={me}
            label="You"
            ml={water.ml}
            percent={water.percent}
            width={bearW}
            theme={MY_BEAR}
            layers={layers}
            goalMl={water.goalMl}
            tilt={tilt}
            phase={phase}
            pourKey={myPour}
            met={water.met}
            countUp
          />
          {partner ? (
            <BearColumn
              id="partner"
              person={partner}
              label={partner.name}
              ml={partnerMl}
              percent={partnerPercent}
              width={bearW}
              theme={THEIR_BEAR}
              layers={theirLayers}
              goalMl={theirGoal}
              tilt={tilt}
              phase={phase}
              pourKey={theirPour}
              met={partnerMet}
            />
          ) : null}
        </View>
      ) : null}

      {/* Picker, on hold of the "+". */}
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

      {/* One row: goal capsule · undo · the liquid plus. */}
      <View style={styles.controls}>
        <View style={styles.goal}>
          <Pressable
            onPress={() => onStepWaterGoal(-1)}
            disabled={atMin}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Lower the water goal"
            style={[styles.goalBtn, atMin && styles.off]}
          >
            <Text style={styles.goalGlyph}>−</Text>
          </Pressable>
          <Text style={styles.goalText}>Goal {formatMl(water.goalMl)}</Text>
          <Pressable
            onPress={() => onStepWaterGoal(1)}
            disabled={atMax}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Raise the water goal"
            style={[styles.goalBtn, atMax && styles.off]}
          >
            <Text style={styles.goalGlyph}>+</Text>
          </Pressable>
        </View>

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

        <LiquidPlus
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
      <Text style={styles.hint}>Tap + to add · hold for coffee, juice, tea…</Text>
    </View>
  );
}

/** The add button: a droplet-plus that fills with the chosen drink's colour. */
function LiquidPlus({
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
  const pulse = useSharedValue(1);
  const press = () => {
    pulse.set(withSequence(withTiming(0.88, { duration: 90 }), withTiming(1, { duration: 160 })));
    onPress();
  };
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  return (
    <Pressable
      onPress={press}
      onLongPress={onLongPress}
      delayLongPress={320}
      accessibilityRole="button"
      accessibilityLabel={open ? 'Close the drink picker' : `Add ${label}. Hold for more drinks`}
      style={styles.plusWrap}
    >
      <Animated.View style={[styles.plus, { backgroundColor: color }, style]}>
        <Svg width={22} height={22} viewBox="0 0 22 22">
          <Path
            d={open ? 'M6 6 L16 16 M16 6 L6 16' : 'M11 4 L11 18 M4 11 L18 11'}
            stroke={color === DRINK_META.milk.color || color === DRINK_META.lemonade.color ? INK : '#ffffff'}
            strokeWidth={2.6}
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>
      <Text style={styles.plusLabel}>{label}</Text>
    </Pressable>
  );
}

function BearColumn({
  id,
  person,
  label,
  ml,
  percent,
  width,
  theme,
  layers,
  goalMl,
  tilt,
  phase,
  pourKey,
  met,
  countUp,
}: {
  id: string;
  person: Person;
  label: string;
  ml: number | null;
  percent: number;
  width: number;
  theme: BearTheme;
  layers?: readonly { color: string; share: number }[];
  /** Whose goal this bear fills against, shown under the amount. */
  goalMl: number;
  tilt: SharedValue<number>;
  phase: SharedValue<number>;
  pourKey: number;
  met: boolean;
  countUp?: boolean;
}) {
  return (
    <View style={styles.column}>
      <View>
        <BearJar
          id={id}
          percent={percent}
          width={width}
          theme={theme}
          layers={layers}
          tilt={tilt}
          phase={phase}
          pourKey={pourKey}
          met={met}
        />
        <View style={styles.badge}>
          <LemonAvatar uri={person.avatar} initial={(person.name.charAt(0) || '?').toUpperCase()} size={28} />
        </View>
      </View>
      {ml == null ? (
        <Text style={[styles.amount, styles.amountMuted]}>—</Text>
      ) : countUp ? (
        <CountUp value={ml} duration={600} delay={0} format={(n) => formatMl(n)} style={styles.amount} />
      ) : (
        <Text style={styles.amount}>{formatMl(ml)}</Text>
      )}
      <Text style={styles.ofGoal}>of {formatMl(goalMl)}</Text>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headStat: font('semibold', 13, { color: MUTED }),
  headStatMet: font('bold', 13, { color: '#16a34a' }),
  status: { minHeight: 20, alignItems: 'center', marginBottom: 6 },
  live: font('bold', 13, { color: '#0369a1' }),
  cheers: font('bold', 13, { color: '#b45309' }),
  race: font('medium', 12.5, { color: MUTED }),
  bears: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-end' },
  column: { alignItems: 'center' },
  badge: { position: 'absolute', right: -4, bottom: -2 },
  amount: { ...font('extrabold', 19, { color: INK }), marginTop: 6, letterSpacing: -0.4 },
  amountMuted: { color: '#94a3b8' },
  ofGoal: font('medium', 11.5, { color: '#94a3b8' }),
  label: { ...font('semibold', 12.5, { color: MUTED }), maxWidth: 120, marginTop: 1 },
  picker: {
    marginTop: 14,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: HAIR,
    backgroundColor: '#ffffff',
    gap: 12,
  },
  sizes: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 10, padding: 3 },
  size: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 8 },
  sizeOn: { backgroundColor: '#ffffff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, elevation: 1 },
  sizeText: font('semibold', 13, { color: MUTED }),
  sizeTextOn: font('bold', 13, { color: INK }),
  kinds: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  kind: { width: '24%', alignItems: 'center' },
  kindDot: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  kindEmoji: { fontSize: 18 },
  kindLabel: { ...font('medium', 11.5, { color: INK }), marginTop: 4 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  goal: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: HAIR,
    paddingHorizontal: 2,
    height: 44,
  },
  goalBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  goalGlyph: { ...font('bold', 20, { color: INK }), lineHeight: 23 },
  goalText: font('semibold', 13.5, { color: INK }),
  off: { opacity: 0.3 },
  undo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: HAIR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  undoText: font('bold', 17, { color: MUTED }),
  plusWrap: { alignItems: 'center' },
  plus: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0ea5e9',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  plusLabel: { ...font('semibold', 10.5, { color: MUTED }), marginTop: 3 },
  hint: { ...font('medium', 11, { color: '#94a3b8' }), textAlign: 'center', marginTop: 8 },
});

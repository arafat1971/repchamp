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

import { PandaJar } from '@/components/home/PandaJar';
import { HealthCard, IOS, Metric } from '@/components/home/HealthCard';
import { DropIcon } from '@/components/home/Icons';
import { DRINK_KINDS, DRINK_META, parseDrinkKind, type DrinkKind } from '@/domain/drinkKinds';
import {
  DEFAULT_DAILY_GOAL_ML,
  DRINK_SIZES_ML,
  MAX_DAILY_GOAL_ML,
  MIN_DAILY_GOAL_ML,
  type DrinkEntry,
  type HydrationProgress,
  formatMl,
} from '@/domain/hydration';
import { lightImpactHaptic, playSparkleSound, selectionHaptic, successHaptic } from '@/lib/feedback';
import { hydrationPace } from '@/domain/hydrationPace';
import { pandaMood } from '@/domain/pandaMood';
import { font } from '@/theme/typography';

/** Mine rose, theirs lavender — two bears, two personalities. */

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
  partner,
  partnerMl,
  partnerGoalMl,
  partnerLayers,
  onLogWater,
  onUndoWater,
  onStepWaterGoal,
  onSplash,
  onTickle,
  duoStreak = 0,
}: {
  water: HydrationProgress;
  /** Today's drinks. The panda's bottle shows the total, so this is currently unused. */
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
  /** Throw a live 💧 at the partner; false when throttled. */
  onSplash?: () => boolean;
  /** Tickling their panda here tickles theirs on their home screen too. */
  onTickle?: () => void;
  /** Days in a row you both filled your bears — shown by the title. */
  duoStreak?: number;
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
  /* What they just had, for the live banner: their newest layer's kind. */
  const theirLatest = parseDrinkKind(partnerLayers?.[partnerLayers.length - 1]?.k);
  const bothMet = water.met && partnerMet;

  const atMin = water.goalMl <= MIN_DAILY_GOAL_ML;
  const atMax = water.goalMl >= MAX_DAILY_GOAL_ML;

  const meta = DRINK_META[choice.kind];
  const [amount, unit] = splitMl(water.ml);
  const [theirAmount, theirUnit] = splitMl(partnerMl ?? 0);
  const [splashes, setSplashes] = useState(0);

  /* The pace coach, on a minute clock so "next sip" and the marker move. */
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const pace = useMemo(() => hydrationPace(water.ml, water.goalMl, clock), [water.ml, water.goalMl, clock]);
  /* The pandas' faces follow the day: thirsty when clearly behind, sleepy at
     night, a party once the bottle is finished. */
  const myMood = pandaMood({ met: water.met, pace: pace.status, behindMl: pace.behindMl, hour: clock.getHours() });
  const theirPace = partnerMl == null ? null : hydrationPace(partnerMl, theirGoal, clock);
  const theirMood = pandaMood({
    met: partnerMet,
    pace: theirPace?.status ?? null,
    behindMl: theirPace?.behindMl ?? 0,
    hour: clock.getHours(),
  });

  /* Hold the bear to pour: the amount climbs while held and the bear fills
     with it, so you see the glass land before you let go. */
  const hold = useHoldToPour((ml) => add(choice.kind, ml));
  const heldPercent =
    hold.amount > 0 ? Math.min(100, Math.round(((water.ml + hold.amount) / Math.max(1, water.goalMl)) * 100)) : water.percent;

  /* Goal hit, live: once, when it flips — not on every open of a full day. */
  const wasMet = useRef(water.met);
  const [cheer, setCheer] = useState(0);
  useEffect(() => {
    if (!wasMet.current && water.met) {
      successHaptic();
      playSparkleSound();
      setCheer((n) => n + 1);
    }
    wasMet.current = water.met;
  }, [water.met]);
  useEffect(() => {
    if (!cheer) return;
    const t = setTimeout(() => setCheer(0), 2800);
    return () => clearTimeout(t);
  }, [cheer]);

  /* Who is ahead, by share of each one's own goal — a bigger goal is not a lead. */
  const lead: { text: string; tone: 'me' | 'them' | 'even' } = (() => {
    if (!partner || partnerMl == null) return { text: 'Waiting on their first sip', tone: 'even' };
    const gap = water.percent - partnerPercent;
    if (water.met && partnerMet) return { text: 'Both full 🎉', tone: 'even' };
    if (gap === 0) return { text: 'Neck and neck', tone: 'even' };
    return gap > 0
      ? { text: `You lead by ${gap}%`, tone: 'me' }
      : { text: `${partner.name} leads by ${-gap}%`, tone: 'them' };
  })();

  /* One quiet line of news beside the number: a live pour from them wins,
     then a shared goal, then who is ahead. */
  const news =
    live && partner
      ? theirLatest === 'water'
        ? `${partner.name} +${formatMl(live.ml)}`
        : `${partner.name} +${formatMl(live.ml)} ${DRINK_META[theirLatest].label.toLowerCase()}`
      : bothMet && partner
        ? 'You both met your goal'
        : null;

  return (
    <View onLayout={onLayout}>
      <HealthCard
        icon={<DropIcon size={16} color={IOS.water} />}
        title="Hydration"
        tint={IOS.water}
        trailing={`${duoStreak > 0 ? `🔥 ${duoStreak} · ` : ''}${water.met ? 'Goal met' : `${formatMl(water.remainingMl)} to go`}`}
      >
        {partner ? (
          /* Face to face: two bears, two numbers, and who is ahead between
             them — one glance says whether it is your turn to drink. */
          <View style={styles.duel}>
            <View style={styles.side}>
              {width > 0 ? (
                <HoldBear hold={hold}>
                <PandaJar
                  id="me"
                  remaining={100 - heldPercent}
                  width={116}
                  phase={phase}
                  sipKey={myPour}
                  mood={myMood}
                />
                </HoldBear>
              ) : null}
              <Text style={styles.sideAmount} numberOfLines={1}>
                {amount}
                <Text style={styles.sideUnit}> {unit}</Text>
              </Text>
              <Text style={styles.sideName} numberOfLines={1}>You · {water.percent}%</Text>
            </View>

            <View style={styles.middle}>
              <View style={[styles.leadChip, lead.tone === 'me' && styles.leadMe, lead.tone === 'them' && styles.leadThem]}>
                <Text style={[styles.leadText, lead.tone === 'me' && { color: '#0369A1' }, lead.tone === 'them' && { color: '#6D28D9' }]} numberOfLines={2}>
                  {lead.text}
                </Text>
              </View>
              {news ? (
                <Animated.Text
                  key={live?.id ?? 'news'}
                  entering={FadeInDown.springify().damping(14)}
                  exiting={FadeOutUp.duration(250)}
                  style={[styles.news, styles.newsCenter, live ? { color: IOS.water } : null]}
                  numberOfLines={2}
                >
                  {news}
                </Animated.Text>
              ) : null}
            </View>

            <View style={styles.side}>
              <PandaJar
                id="partner"
                remaining={partnerMl == null ? 100 : 100 - partnerPercent}
                width={116}
                outfit="hoodie"
                mirrored
                interactive
                onPoke={onTickle}
                phase={phase}
                sipKey={theirPour}
                mood={theirMood}
              />
              <Text style={[styles.sideAmount, partnerMl == null && { color: IOS.tertiary }]} numberOfLines={1}>
                {partnerMl == null ? '—' : theirAmount}
                {partnerMl == null ? null : <Text style={styles.sideUnit}> {theirUnit}</Text>}
              </Text>
              <Text style={styles.sideName} numberOfLines={1}>
                {partner.name}
                {partnerMl == null ? '' : ` · ${partnerPercent}%`}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.metricRow}>
            {width > 0 ? (
              <HoldBear hold={hold}>
              <PandaJar
                id="me"
                remaining={100 - heldPercent}
                width={96}
                phase={phase}
                sipKey={myPour}
                mood={myMood}
              />
              </HoldBear>
            ) : null}
            <View style={{ flex: 1 }}>
              <Metric value={amount} unit={unit} />
              <Text style={styles.news} numberOfLines={1}>
                of {formatMl(water.goalMl)} · {water.percent}%
              </Text>
            </View>
          </View>
        )}
        {/* The bar, with where you should be by now marked on it. */}
        <PaceBar fraction={heldPercent / 100} marker={pace.status === 'done' ? null : pace.expectedFraction} />
        <View style={styles.coach}>
          {/* One calm line, not an alarm: orange text and a catch-up chip beside
              the drink button read as three competing calls to act. */}
          <Text
            style={[styles.coachText, pace.status === 'done' && { color: '#15803D' }]}
            numberOfLines={1}
          >
            {hold.amount > 0
              ? `Release to pour ${formatMl(hold.amount)}`
              : hold.hint
                ? 'Hold your bear to pour'
                : pace.line}
          </Text>
        </View>
        {cheer ? (
          <Animated.View entering={FadeInDown.springify().damping(12)} exiting={FadeOutUp.duration(250)} style={styles.goalHit}>
            <Text style={styles.goalHitText}>🎉 Goal hit! Your bear is full</Text>
          </Animated.View>
        ) : null}

        {/* Actions: undo · pour (hold for drinks and the goal) · splash them. */}
        <View style={styles.controls}>
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
            label={`${meta.label} ${formatMl(choice.ml)}`}
            short={`Drink +${formatMl(choice.ml)}`}
            open={picking}
            onPress={() => (picking ? setPicking(false) : add(choice.kind, choice.ml))}
            onLongPress={() => {
              lightImpactHaptic();
              setPicking(true);
            }}
          />
          <View style={{ flex: 1 }} />
          {partner && onSplash ? (
            <Pressable
              onPress={() => {
                if (onSplash()) setSplashes((n) => n + 1);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Splash ${partner.name} — a live reminder to drink`}
              style={({ pressed }) => [styles.splash, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.splashText} numberOfLines={1}>
                💧 Splash
              </Text>
              {splashes > 0 ? (
                <Animated.Text key={splashes} entering={FadeInDown.duration(200)} style={styles.splashCount}>
                  ×{splashes}
                </Animated.Text>
              ) : null}
            </Pressable>
          ) : null}
        </View>

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
            {/* The daily goal lives here now — set once, not a row every day. */}
            <View style={styles.goalRow}>
              <Text style={styles.goalCaption}>Daily goal</Text>
              <Text style={styles.goalValue}>{formatMl(water.goalMl)}</Text>
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
            </View>
          </Animated.View>
        ) : null}

      </HealthCard>
    </View>
  );
}

type Hold = ReturnType<typeof useHoldToPour>;

/**
 * Press and hold to pour: starts at 100 ml and climbs 50 ml at a time, with a
 * tick at every glass (250 ml). Release pours it; a short tap only shows the
 * hint, so scrolling past the bear never logs a drink.
 */
function useHoldToPour(onPour: (ml: number) => void) {
  const [amount, setAmount] = useState(0);
  const [hint, setHint] = useState(false);
  const amt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pour = useRef(onPour);
  useEffect(() => {
    pour.current = onPour;
  });
  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);
  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(false), 1800);
    return () => clearTimeout(t);
  }, [hint]);

  const start = () => {
    amt.current = 100;
    setAmount(100);
    lightImpactHaptic();
    timer.current = setInterval(() => {
      amt.current = Math.min(1000, amt.current + 50);
      setAmount(amt.current);
      if (amt.current % 250 === 0) selectionHaptic();
    }, 130);
  };
  const end = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    const ml = amt.current;
    amt.current = 0;
    setAmount(0);
    if (ml > 0) pour.current(ml);
  };
  return { amount, hint, start, end, tap: () => setHint(true) };
}

function HoldBear({ hold, children }: { hold: Hold; children: React.ReactNode }) {
  const holding = hold.amount > 0;
  const squish = useAnimatedStyle(() => ({
    transform: [{ scale: withTiming(holding ? 1.08 : 1, { duration: 160 }) }],
  }));
  return (
    <Pressable
      onPress={hold.tap}
      onLongPress={hold.start}
      delayLongPress={220}
      onPressOut={hold.end}
      accessibilityRole="button"
      accessibilityLabel="Hold to pour a drink"
      accessibilityHint="The longer you hold, the more you pour"
    >
      <Animated.View style={squish}>{children}</Animated.View>
      {holding ? (
        <Animated.View entering={FadeIn.duration(120)} exiting={FadeOut.duration(150)} style={styles.holdBubble} pointerEvents="none">
          <Text style={styles.holdText}>+{formatMl(hold.amount)}</Text>
        </Animated.View>
      ) : null}
    </Pressable>
  );
}

/** Progress with a "now" tick: where the pace line says you should be. */
function PaceBar({ fraction, marker }: { fraction: number; marker: number | null }) {
  const pct = Math.max(0, Math.min(1, fraction));
  return (
    <View style={styles.paceWrap}>
      <View style={styles.paceTrack}>
        {pct > 0 ? <View style={[styles.paceFill, { width: `${Math.max(3, pct * 100)}%` }]} /> : null}
      </View>
      {marker != null && marker > 0.02 && marker < 0.98 ? (
        <View style={[styles.marker, { left: `${marker * 100}%` }]} pointerEvents="none">
          <View style={styles.markerTick} />
        </View>
      ) : null}
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
  short,
  open,
  onPress,
  onLongPress,
}: {
  color: string;
  label: string;
  /** What the pill itself says: the amount a tap adds. */
  short: string;
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
      <Animated.View style={[styles.pour, pill]}>
        {open ? (
          <Svg width={24} height={28} viewBox="0 0 24 28">
            <Path d="M7 8 L17 18 M17 8 L7 18" stroke="#ffffff" strokeWidth={2.4} strokeLinecap="round" />
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
        <Text style={styles.pourTitle}>{open ? 'Close' : short}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  metricRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, marginBottom: 10 },
  news: font('semibold', 12, { color: IOS.secondary, marginTop: -2 }),
  partner: {
    marginTop: 12,
    paddingTop: 12,
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
  duel: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 10, marginBottom: 12 },
  side: { width: 124, alignItems: 'center' },
  sideAmount: { ...font('extrabold', 20, { color: IOS.label, marginTop: 6 }), letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  sideUnit: font('semibold', 12, { color: IOS.secondary }),
  sideName: font('semibold', 11.5, { color: IOS.secondary, marginTop: 1 }),
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', gap: 6 },
  leadChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: IOS.fill },
  leadMe: { backgroundColor: 'rgba(50,173,230,0.14)' },
  leadThem: { backgroundColor: 'rgba(139,92,246,0.12)' },
  leadText: { ...font('bold', 11.5, { color: IOS.secondary }), textAlign: 'center' },
  newsCenter: { textAlign: 'center', marginTop: 0 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  splash: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 19,
    backgroundColor: IOS.fill,
  },
  splashText: font('semibold', 13, { color: IOS.label }),
  splashCount: font('bold', 11, { color: IOS.secondary }),
  paceWrap: { height: 16, justifyContent: 'center', marginTop: 2 },
  paceTrack: { height: 6, borderRadius: 3, backgroundColor: IOS.fill, overflow: 'hidden' },
  paceFill: { height: '100%', borderRadius: 4, backgroundColor: IOS.water },
  marker: { position: 'absolute', top: 2, alignItems: 'center', width: 30, marginLeft: -15 },
  markerTick: { width: 2, height: 12, borderRadius: 1, backgroundColor: IOS.secondary },
  coach: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
  coachText: { ...font('medium', 12.5, { color: IOS.secondary }), flex: 1 },
  goalHit: {
    marginTop: 6,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(52,199,89,0.12)',
    alignItems: 'center',
  },
  goalHitText: font('bold', 13, { color: '#15803D' }),
  holdBubble: {
    position: 'absolute',
    top: -26,
    alignSelf: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: IOS.water,
  },
  holdText: { ...font('extrabold', 12, { color: '#ffffff' }), fontVariant: ['tabular-nums'] },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  goalValue: { ...font('bold', 13, { color: IOS.label }), flex: 1, fontVariant: ['tabular-nums'] },
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
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: IOS.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  undoText: font('bold', 16, { color: IOS.secondary }),
  pour: {
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 8,
    paddingRight: 14,
    borderRadius: 19,
    backgroundColor: IOS.water,
  },
  pourTitle: font('bold', 13.5, { color: '#ffffff' }),
});

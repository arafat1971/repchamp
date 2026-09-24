import { LinearGradient } from 'expo-linear-gradient';
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
  useAnimatedSensor,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { BearJar } from '@/components/home/BearJar';
import { HomeSectionHeader } from '@/components/home/HomeSectionHeader';
import { LemonAvatar } from '@/components/home/LemonAvatar';
import { CountUp } from '@/components/motion';
import { PressableScale } from '@/components/ui';
import {
  DRINK_SIZES_ML,
  MAX_DAILY_GOAL_ML,
  MIN_DAILY_GOAL_ML,
  type HydrationProgress,
  formatMl,
} from '@/domain/hydration';
import { lightImpactHaptic, selectionHaptic } from '@/lib/feedback';
import { font } from '@/theme/typography';
import { radius } from '@/theme/tokens';

const INK = '#1e293b';
const MUTED = '#64748b';
const DRINK_ICONS = ['🥛', '🧃', '🍶'] as const;

interface Person {
  name: string;
  avatar?: string | null;
}

/**
 * Hydration as two bear-shaped water jars: mine and my partner's.
 *
 * Each bear fills from its soles to its ears with the day's intake — waves
 * drifting inside and tilting with the phone — and wears its owner's face as
 * a lemon-slice badge at its feet. A drink squishes the bear as it lands; my
 * partner's bear does the same live over the couple document when they drink,
 * with a banner and a tap. A bear that reaches its goal sparkles.
 *
 * My partner's bear fills against my goal (theirs is not synced), so the two
 * compare honestly, and is labelled with their real amount only. Unpaired,
 * one bear takes the stage. Under Reduce Motion: no tilt, sway or squish.
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

  /* Shared surface motion for both bears: drift, and tilt with the phone. */
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

  /* My squish on each of my drinks. */
  const [myPour, setMyPour] = useState(0);
  const log = (ml: number) => {
    onLogWater(ml);
    setMyPour((n) => n + 1);
  };

  /* Theirs, live: their total rising while the card is on screen. The first
     value is a baseline — opening the app is not them drinking. */
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

  const partnerPercent =
    partnerMl == null ? 0 : Math.min(100, Math.round((partnerMl / Math.max(1, water.goalMl)) * 100));
  /* Same yardstick as the fill: a bear sparkles only when it looks full. */
  const partnerMet = partnerPercent >= 100;
  const bothMet = water.met && partnerMet;

  /* Goal stepper. */
  const [dir, setDir] = useState<1 | -1 | 0>(0);
  const atMin = water.goalMl <= MIN_DAILY_GOAL_ML;
  const atMax = water.goalMl >= MAX_DAILY_GOAL_ML;
  const step = (d: 1 | -1) => {
    setDir(d);
    onStepWaterGoal(d);
  };

  const inner = Math.max(0, width - 32);
  const bearW = partner ? Math.min(150, (inner - 16) / 2) : Math.min(170, inner * 0.55);

  return (
    <View>
      <HomeSectionHeader
        title="Hydration"
        right={
          <View style={[styles.chip, water.met && styles.chipMet]}>
            <Text style={[styles.chipText, water.met && styles.chipTextMet]}>
              {water.met ? 'Goal met ✓' : `${water.percent}%`}
            </Text>
          </View>
        }
      />

      <View onLayout={onLayout}>
        <LinearGradient
          colors={['#e0f2fe', '#ede9fe', '#fce7f3']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
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
              <Text style={styles.cheers}>🥂 You and {partner.name} both hit your goal!</Text>
            ) : partner && partnerMl != null ? (
              <Text style={styles.race}>
                {water.ml >= partnerMl
                  ? `You're ${formatMl(water.ml - partnerMl)} ahead of ${partner.name}`
                  : `${partner.name} is ${formatMl(partnerMl - water.ml)} ahead — top up!`}
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
                tint="#fb7185"
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
                  tint="#a78bfa"
                  tilt={tilt}
                  phase={phase}
                  pourKey={theirPour}
                  met={partnerMet}
                />
              ) : null}
            </View>
          ) : null}

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
                Daily goal {formatMl(water.goalMl)}
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

          <View style={styles.pills}>
            {DRINK_SIZES_ML.map((ml, i) => (
              <PressableScale
                key={ml}
                onPress={() => log(ml)}
                accessibilityRole="button"
                accessibilityLabel={`Drink ${formatMl(ml)}`}
                style={styles.pill}
              >
                <Text style={styles.pillEmoji}>{DRINK_ICONS[i]}</Text>
                <Text style={styles.pillText}>+{ml}</Text>
                <Text style={styles.pillUnit}>ml</Text>
              </PressableScale>
            ))}
          </View>

          <View style={styles.footRow}>
            <Text style={styles.hint}>
              {water.met ? 'Goal met — anything more is a bonus 💙' : `${formatMl(water.remainingMl)} to go`}
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
                style={styles.undo}
              >
                <Text style={styles.undoText}>↺ Undo</Text>
              </Pressable>
            ) : null}
          </View>
        </LinearGradient>
      </View>
    </View>
  );
}

function BearColumn({
  id,
  person,
  label,
  ml,
  percent,
  width,
  tint,
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
  tint: string;
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
          tint={tint}
          tilt={tilt}
          phase={phase}
          pourKey={pourKey}
          met={met}
        />
        {/* The owner's face as a lemon-slice badge at the bear's feet. */}
        <View style={styles.badge}>
          <LemonAvatar uri={person.avatar} initial={(person.name.charAt(0) || '?').toUpperCase()} size={34} />
        </View>
      </View>
      {ml == null ? (
        <Text style={[styles.amount, styles.amountMuted]}>—</Text>
      ) : countUp ? (
        <CountUp value={ml} duration={600} delay={0} format={(n) => formatMl(n)} style={styles.amount} />
      ) : (
        <Text style={styles.amount}>{formatMl(ml)}</Text>
      )}
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 4, backgroundColor: '#e0f2fe' },
  chipMet: { backgroundColor: '#dcfce7' },
  chipText: font('bold', 12.5, { color: '#0369a1' }),
  chipTextMet: font('bold', 12.5, { color: '#15803d' }),
  card: { borderRadius: radius['3xl'], padding: 16, gap: 12 },
  bannerSlot: { minHeight: 26, alignItems: 'center', justifyContent: 'center' },
  banner: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(56,189,248,0.2)',
  },
  bannerText: font('bold', 13, { color: '#0369a1' }),
  cheers: font('extrabold', 13.5, { color: '#b45309' }),
  race: font('semibold', 13, { color: MUTED }),
  bears: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end' },
  column: { alignItems: 'center' },
  badge: { position: 'absolute', right: -6, bottom: -4 },
  amount: { ...font('extrabold', 22, { color: INK }), marginTop: 8, letterSpacing: -0.5 },
  amountMuted: { color: '#94a3b8' },
  label: { ...font('semibold', 12.5, { color: MUTED }), maxWidth: 140 },
  goalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  goalBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  goalBtnDim: { opacity: 0.4 },
  goalBtnText: { ...font('bold', 18, { color: INK }), lineHeight: 21 },
  goalClip: { height: 22, overflow: 'hidden', justifyContent: 'center' },
  goalText: { ...font('semibold', 14, { color: INK }), lineHeight: 20 },
  pills: { flexDirection: 'row', gap: 10 },
  pill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.85)',
    shadowColor: '#6366f1',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  pillEmoji: { fontSize: 18 },
  pillText: { ...font('extrabold', 15, { color: INK }), marginTop: 2, letterSpacing: -0.3 },
  pillUnit: font('semibold', 11, { color: MUTED }),
  footRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 },
  hint: font('semibold', 12.5, { color: MUTED }),
  undo: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  undoText: font('bold', 12.5, { color: '#0369a1' }),
});

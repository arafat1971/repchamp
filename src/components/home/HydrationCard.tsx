import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp, ZoomIn } from 'react-native-reanimated';

import { LemonAvatar } from '@/components/home/LemonAvatar';
import { PourFX } from '@/components/home/PourFX';
import { WaterControls } from '@/components/home/WaterControls';
import { WaterGlass } from '@/components/home/WaterGlass';
import { DEFAULT_DAILY_GOAL_ML, type HydrationProgress, formatMl } from '@/domain/hydration';
import { lightImpactHaptic } from '@/lib/feedback';
import { font } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

const GLASS_W = 84;
const GLASS_H = 122;

/** Where the water surface sits in a `WaterGlass` of this size — mirrors its level maths. */
function surfaceY(percent: number): number {
  const fill = Math.max(0, Math.min(100, percent)) / 100;
  const minY = GLASS_H - 14;
  const maxY = 19;
  return fill === 0 ? minY : minY - fill * (minY - maxY);
}

interface Person {
  name: string;
  avatar?: string | null;
}

/**
 * Hydration, as two glasses on a table — mine and my partner's.
 *
 * Each glass wears its owner's face as a lemon slice on the rim, so there is
 * no legend to read. Water goes in with a drop and a splash — for my taps and,
 * live over the couple document, for my partner's: when their total rises
 * while this card is on screen, their glass pours, a banner says so and the
 * phone gives a light tap. That is the moment that makes the other person
 * feel present.
 *
 * Unpaired, it is one glass and the controls. The partner's glass fills
 * against the default goal (theirs is not synced) and is labelled only with
 * their real amount.
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
  /** Present when paired. */
  partner: Person | null;
  /** Their shared total today, or null until they share. */
  partnerMl: number | null;
  onLogWater: (ml: number) => void;
  onUndoWater?: () => void;
  onStepWaterGoal: (direction: 1 | -1) => void;
}) {
  const partnerPercent =
    partnerMl == null ? 0 : Math.min(100, Math.round((partnerMl / DEFAULT_DAILY_GOAL_ML) * 100));
  const bothMet = partnerMl != null && water.met && partnerMl >= DEFAULT_DAILY_GOAL_ML;

  /* Live: their total rising while the card is on screen. The first value is
     a baseline — opening the app is not them drinking. */
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

  const status = water.met ? 'Goal met ✓' : `${water.percent}%`;

  return (
    <LinearGradient
      colors={['#0c3b5e', '#0a2540', '#081a2e']}
      start={{ x: 0.2, y: 0 }}
      end={{ x: 0.8, y: 1 }}
      style={styles.card}
    >
      <View style={styles.head}>
        <Text style={styles.title}>💧 Hydration</Text>
        <View style={[styles.chip, water.met && styles.chipMet]}>
          <Text style={[styles.chipText, water.met && styles.chipTextMet]}>{status}</Text>
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
        ) : null}
      </View>

      <View style={styles.table}>
        <GlassColumn id="me" person={me} label="You" ml={water.ml} percent={water.percent} lean={partner ? 4 : 0} />
        {partner ? (
          <>
            <View style={styles.middle}>
              {bothMet ? (
                <Animated.Text entering={ZoomIn.springify()} style={styles.clink}>
                  🥂
                </Animated.Text>
              ) : (
                <Text style={styles.vs}>VS</Text>
              )}
            </View>
            <GlassColumn
              id="partner"
              person={partner}
              label={partner.name}
              ml={partnerMl}
              percent={partnerPercent}
              lean={-4}
            />
          </>
        ) : null}
      </View>

      {partner ? (
        <Text style={[styles.race, bothMet && styles.raceMet]}>
          {bothMet
            ? `Cheers! You and ${partner.name} both hit your water goal`
            : partnerMl == null
              ? `No water shared by ${partner.name} yet today`
              : water.ml >= partnerMl
                ? `You're ${formatMl(water.ml - partnerMl)} ahead of ${partner.name}`
                : `${partner.name} is ${formatMl(partnerMl - water.ml)} ahead — top up`}
        </Text>
      ) : null}

      <WaterControls
        water={water}
        onLogWater={onLogWater}
        onUndoWater={onUndoWater}
        onStepWaterGoal={onStepWaterGoal}
      />
    </LinearGradient>
  );
}

function GlassColumn({
  id,
  person,
  label,
  ml,
  percent,
  lean,
}: {
  id: string;
  person: Person;
  label: string;
  ml: number | null;
  percent: number;
  lean: number;
}) {
  return (
    <View style={[styles.column, { transform: [{ rotate: `${lean}deg` }] }]}>
      <View style={{ width: GLASS_W, height: GLASS_H }}>
        <WaterGlass id={id} percent={percent} width={GLASS_W} height={GLASS_H} />
        <PourFX ml={ml} surfaceY={surfaceY(percent)} />
        {/* The owner's face as a lemon slice, perched on the rim. */}
        <View style={styles.lemon}>
          <LemonAvatar uri={person.avatar} initial={(person.name.charAt(0) || '?').toUpperCase()} size={40} />
        </View>
      </View>
      <Text style={[styles.amount, ml == null && styles.amountMuted]}>
        {ml == null ? '—' : formatMl(ml)}
      </Text>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius['3xl'], padding: 18, overflow: 'hidden' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { ...font('extrabold', 18, { color: palette.white }), letterSpacing: -0.3 },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 4,
    backgroundColor: 'rgba(125,211,252,0.16)',
  },
  chipMet: { backgroundColor: 'rgba(48,209,88,0.2)' },
  chipText: font('bold', 12.5, { color: '#bae6fd' }),
  chipTextMet: font('bold', 12.5, { color: '#30d158' }),
  /* Room above the rim: the lemon slices poke 14pt up out of the glasses. */
  bannerSlot: { height: 34, justifyContent: 'center', alignItems: 'center', marginTop: 6, marginBottom: 18 },
  banner: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(56,189,248,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.4)',
  },
  bannerText: font('bold', 13, { color: '#e0f2fe' }),
  table: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: 10 },
  column: { alignItems: 'center', width: GLASS_W + 26 },
  lemon: { position: 'absolute', top: -14, right: -16, transform: [{ rotate: '-14deg' }] },
  amount: { ...font('extrabold', 17, { color: palette.white }), marginTop: 10, letterSpacing: -0.3 },
  amountMuted: { color: 'rgba(255,255,255,0.4)' },
  label: { ...font('semibold', 12, { color: 'rgba(235,235,245,0.6)' }), maxWidth: 100 },
  middle: { width: 34, alignItems: 'center', paddingBottom: 70 },
  vs: { ...font('extrabold', 13, { color: 'rgba(255,255,255,0.35)' }), letterSpacing: 1 },
  clink: { fontSize: 26 },
  race: { ...font('semibold', 13, { color: 'rgba(235,235,245,0.8)' }), textAlign: 'center', marginTop: 14 },
  raceMet: font('extrabold', 13.5, { color: '#fde68a' }),
});

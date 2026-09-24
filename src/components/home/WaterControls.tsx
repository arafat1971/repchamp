import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, SlideInDown, SlideInUp } from 'react-native-reanimated';
import Svg, { Path, Rect } from 'react-native-svg';

import { PressableScale } from '@/components/ui';
import {
  DRINK_SIZES_ML,
  MAX_DAILY_GOAL_ML,
  MIN_DAILY_GOAL_ML,
  type HydrationProgress,
  formatMl,
} from '@/domain/hydration';
import { font } from '@/theme/typography';
import { palette } from '@/theme/tokens';

/**
 * The water controls under the glasses, in an iOS idiom.
 *
 * Frosted tiles on hairline borders instead of saturated chips; each drink
 * size carries a drawn vessel, scaled to its volume, so the three read as
 * "cup, bottle, big bottle" before the numbers do. The goal stepper is a
 * single capsule with thin-stroke glyphs and a hairline divider, like a
 * UIStepper sat in a Settings row. Undo is a small capsule with its own icon.
 *
 * Presentational: the caller owns logging, undo and the goal.
 */
export function WaterControls({
  water,
  onLogWater,
  onUndoWater,
  onStepWaterGoal,
}: {
  water: HydrationProgress;
  onLogWater: (ml: number) => void;
  onUndoWater?: () => void;
  onStepWaterGoal: (direction: 1 | -1) => void;
}) {
  const [dir, setDir] = useState<1 | -1 | 0>(0);
  const atMin = water.goalMl <= MIN_DAILY_GOAL_ML;
  const atMax = water.goalMl >= MAX_DAILY_GOAL_ML;
  return (
    <View>
      <View style={styles.tiles}>
        {DRINK_SIZES_ML.map((ml, i) => (
          <PressableScale
            key={ml}
            onPress={() => onLogWater(ml)}
            accessibilityRole="button"
            accessibilityLabel={`Log a ${VESSELS[i]?.name.toLowerCase() ?? 'drink'} of ${formatMl(ml)}`}
            style={styles.tile}
          >
            <Vessel kind={i} />
            <Text style={styles.tileAmount}>{formatMl(ml)}</Text>
            <Text style={styles.tileName}>{VESSELS[i]?.name ?? ''}</Text>
          </PressableScale>
        ))}
      </View>

      <View style={styles.statusRow}>
        <View style={[styles.statusPill, water.met && styles.statusPillMet]}>
          <Text style={[styles.statusText, water.met && styles.statusTextMet]}>
            {water.met ? '✓  Goal met' : `${formatMl(water.remainingMl)} to go`}
          </Text>
        </View>
        {onUndoWater ? (
          <Animated.View entering={FadeIn.duration(200)}>
            <Pressable
              onPress={onUndoWater}
              accessibilityRole="button"
              accessibilityLabel="Undo the last drink"
              hitSlop={8}
              style={({ pressed }) => [styles.undo, pressed && { opacity: 0.6 }]}
            >
              <UndoGlyph />
              <Text style={styles.undoText}>Undo</Text>
            </Pressable>
          </Animated.View>
        ) : null}
      </View>

      {/* A Settings-style row: label on the left, a UIStepper-style capsule on
          the right. The goal rolls in the direction it moved; each end of the
          band dims its button rather than ticking with nothing to change.
          The haptic belongs to the caller, which knows whether it moved. */}
      <View style={styles.goalRow}>
        <View>
          <Text style={styles.goalLabel}>Daily goal</Text>
          <View style={styles.goalClip}>
            <Animated.Text
              key={water.goalMl}
              entering={dir === 1 ? SlideInDown.duration(220) : dir === -1 ? SlideInUp.duration(220) : undefined}
              style={styles.goalValue}
            >
              {formatMl(water.goalMl)}
            </Animated.Text>
          </View>
        </View>
        <View style={styles.stepper}>
          <Pressable
            onPress={() => {
              setDir(-1);
              onStepWaterGoal(-1);
            }}
            disabled={atMin}
            accessibilityRole="button"
            accessibilityLabel="Lower the water goal"
            accessibilityState={{ disabled: atMin }}
            style={({ pressed }) => [styles.stepHalf, pressed && styles.stepPressed, atMin && styles.stepOff]}
          >
            <StepGlyph plus={false} />
          </Pressable>
          <View style={styles.stepDivider} />
          <Pressable
            onPress={() => {
              setDir(1);
              onStepWaterGoal(1);
            }}
            disabled={atMax}
            accessibilityRole="button"
            accessibilityLabel="Raise the water goal"
            accessibilityState={{ disabled: atMax }}
            style={({ pressed }) => [styles.stepHalf, pressed && styles.stepPressed, atMax && styles.stepOff]}
          >
            <StepGlyph plus />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const VESSELS = [{ name: 'Cup' }, { name: 'Bottle' }, { name: 'Large' }] as const;

const STROKE = '#bae6fd';
const WATER = '#38bdf8';

/** A small drawn vessel, taller for more water, with its fill shown. */
function Vessel({ kind }: { kind: number }) {
  if (kind === 0) {
    // Cup: a short tapered tumbler.
    return (
      <Svg width={26} height={28} viewBox="0 0 26 28">
        <Path d="M6 9 L20 9 L18.6 24 Q18.4 25.5 17 25.5 L9 25.5 Q7.6 25.5 7.4 24 Z" fill={WATER} opacity={0.9} />
        <Path d="M4 5 L22 5 L19.6 24.2 Q19.3 26.5 17 26.5 L9 26.5 Q6.7 26.5 6.4 24.2 Z" stroke={STROKE} strokeWidth={1.6} fill="none" strokeLinejoin="round" />
      </Svg>
    );
  }
  if (kind === 1) {
    // Bottle: a slim bottle with a neck and cap.
    return (
      <Svg width={26} height={28} viewBox="0 0 26 28">
        <Rect x={10.2} y={1.2} width={5.6} height={3.2} rx={1} fill={STROKE} />
        <Path d="M9.2 13 L16.8 13 L16.8 24.5 Q16.8 26 15.3 26 L10.7 26 Q9.2 26 9.2 24.5 Z" fill={WATER} opacity={0.9} />
        <Path
          d="M10.5 4.4 L15.5 4.4 L15.5 7 Q18.2 8.6 18.2 11.5 L18.2 24.6 Q18.2 27 15.8 27 L10.2 27 Q7.8 27 7.8 24.6 L7.8 11.5 Q7.8 8.6 10.5 7 Z"
          stroke={STROKE}
          strokeWidth={1.6}
          fill="none"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }
  // Large: a wide sports bottle.
  return (
    <Svg width={26} height={28} viewBox="0 0 26 28">
      <Rect x={9} y={0.8} width={8} height={3.4} rx={1.2} fill={STROKE} />
      <Path d="M7 11 L19 11 L19 24.2 Q19 26 17.2 26 L8.8 26 Q7 26 7 24.2 Z" fill={WATER} opacity={0.9} />
      <Path
        d="M9.6 4.2 L16.4 4.2 L16.4 6 Q20.6 7.2 20.6 11 L20.6 24.4 Q20.6 27 18 27 L8 27 Q5.4 27 5.4 24.4 L5.4 11 Q5.4 7.2 9.6 6 Z"
        stroke={STROKE}
        strokeWidth={1.6}
        fill="none"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Thin-stroke minus / plus, as UIStepper draws them. */
function StepGlyph({ plus }: { plus: boolean }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16">
      <Path d="M3 8 L13 8" stroke={palette.white} strokeWidth={1.8} strokeLinecap="round" />
      {plus ? <Path d="M8 3 L8 13" stroke={palette.white} strokeWidth={1.8} strokeLinecap="round" /> : null}
    </Svg>
  );
}

/** Counter-clockwise arrow, the iOS undo mark. */
function UndoGlyph() {
  return (
    <Svg width={14} height={14} viewBox="0 0 14 14">
      <Path
        d="M4.2 3.2 L1.8 5.6 L4.2 8 M2.2 5.6 L8.5 5.6 Q12 5.6 12 9 Q12 12.2 8.5 12.2 L6 12.2"
        stroke="#7dd3fc"
        strokeWidth={1.6}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const HAIRLINE = 'rgba(255,255,255,0.12)';
const FROST = 'rgba(255,255,255,0.07)';

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: 10, marginTop: 18 },
  tile: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 10,
    borderRadius: 18,
    backgroundColor: FROST,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: HAIRLINE,
  },
  tileAmount: { ...font('bold', 14.5, { color: palette.white }), marginTop: 8, letterSpacing: -0.2 },
  tileName: { ...font('medium', 11, { color: 'rgba(235,235,245,0.6)' }), marginTop: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  statusPill: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: FROST,
  },
  statusPillMet: { backgroundColor: 'rgba(48,209,88,0.18)' },
  statusText: font('semibold', 12.5, { color: 'rgba(235,235,245,0.75)' }),
  statusTextMet: font('bold', 12.5, { color: '#30d158' }),
  undo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(10,132,255,0.16)',
  },
  undoText: font('semibold', 12.5, { color: '#7dd3fc' }),
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: HAIRLINE,
  },
  goalLabel: font('medium', 12, { color: 'rgba(235,235,245,0.6)' }),
  goalValue: { ...font('bold', 17, { color: palette.white }), letterSpacing: -0.3, lineHeight: 24 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: 'rgba(118,118,128,0.24)',
    overflow: 'hidden',
  },
  stepHalf: { width: 48, height: 34, alignItems: 'center', justifyContent: 'center' },
  stepPressed: { backgroundColor: 'rgba(255,255,255,0.14)' },
  stepOff: { opacity: 0.3 },
  goalClip: { overflow: 'hidden', height: 26, justifyContent: 'center' },
  stepDivider: { width: StyleSheet.hairlineWidth * 2, height: 18, backgroundColor: 'rgba(255,255,255,0.25)' },
});

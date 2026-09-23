import { StyleSheet, Text, View } from 'react-native';

import { PressableScale, ProgressBar } from '@/components/ui';
import {
  DRINK_SIZES_ML,
  type HydrationProgress,
  formatMl,
} from '@/domain/hydration';
import { font } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

/**
 * Today's water, on Home.
 *
 * Lives on Home rather than behind a modal because the whole feature rests on
 * one tap from a cold open. A screen to navigate to is where a habit this
 * small dies — the athlete is holding a glass, not looking for a feature.
 *
 * Blue on purpose. Green is training, purple is the partner, amber is the
 * league; water needs to read as its own thing at a glance rather than as
 * another training number.
 */
export function HydrationCard({
  progress,
  partner,
  onLog,
  onUndo,
  onStepGoal,
}: {
  progress: HydrationProgress;
  /**
   * The partner's intake today, or null when unpaired *or* when their phone
   * has not synced today. Null means the line is not rendered at all — see
   * below.
   */
  partner: { name: string; ml: number } | null;
  onLog: (ml: number) => void;
  /** Omitted when today has nothing to undo. */
  onUndo?: () => void;
  onStepGoal: (direction: 1 | -1) => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.headRow}>
        <Text style={styles.eyebrow}>WATER</Text>
        {onUndo ? (
          <PressableScale
            onPress={onUndo}
            accessibilityRole="button"
            accessibilityLabel="Undo the last drink"
            style={styles.undoHit}
          >
            <Text style={styles.undoText}>Undo</Text>
          </PressableScale>
        ) : null}
      </View>

      <View style={styles.amountRow}>
        <Text style={styles.amount}>{formatMl(progress.ml)}</Text>
        <Text style={styles.ofGoal}> of {formatMl(progress.goalMl)}</Text>
      </View>

      <ProgressBar
        percent={progress.percent}
        height={8}
        fillColor={progress.met ? palette.green500 : palette.blue500}
      />

      <View style={styles.chipRow}>
        {DRINK_SIZES_ML.map((ml) => (
          <PressableScale
            key={ml}
            onPress={() => onLog(ml)}
            accessibilityRole="button"
            accessibilityLabel={`Log ${formatMl(ml)} of water`}
            style={styles.chip}
          >
            <Text style={styles.chipText}>+{ml}</Text>
          </PressableScale>
        ))}
      </View>

      {/* The goal stepper sits on the number it changes rather than in
          settings — one control, where it is already being read. */}
      <View style={styles.goalRow}>
        <Text style={styles.goalLabel}>
          {progress.met
            ? 'Goal met'
            : `${formatMl(progress.remainingMl)} to go`}
        </Text>
        <View style={styles.stepper}>
          <PressableScale
            onPress={() => onStepGoal(-1)}
            accessibilityRole="button"
            accessibilityLabel="Lower the daily goal"
            style={styles.stepHit}
          >
            <Text style={styles.stepText}>−</Text>
          </PressableScale>
          <Text style={styles.stepValue}>{formatMl(progress.goalMl)}</Text>
          <PressableScale
            onPress={() => onStepGoal(1)}
            accessibilityRole="button"
            accessibilityLabel="Raise the daily goal"
            style={styles.stepHit}
          >
            <Text style={styles.stepText}>+</Text>
          </PressableScale>
        </View>
      </View>

      {/* Rendered only when the partner actually synced today. "0 today" and
          "hasn't synced today" are different claims and only one of them is
          true — so the silent case says nothing rather than reporting a zero
          the partner never earned. */}
      {partner ? (
        <Text style={styles.partnerLine}>
          {partner.name} has had {formatMl(partner.ml)} today
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.white,
    borderRadius: radius['4xl'],
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { ...font('extrabold', 10, { color: palette.blue700 }), letterSpacing: 1.2 },
  undoHit: { paddingHorizontal: 8, paddingVertical: 4 },
  undoText: { ...font('bold', 11, { color: palette.grey600 }) },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 6, marginBottom: 10 },
  amount: { ...font('extrabold', 24, { color: palette.ink }) },
  ofGoal: { ...font('semibold', 13, { color: palette.grey600 }) },
  chipRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  chip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.xl,
    backgroundColor: palette.blue50,
  },
  chipText: { ...font('extrabold', 13, { color: palette.blue700 }) },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  goalLabel: { ...font('semibold', 12, { color: palette.grey600 }) },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepHit: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.blue50,
  },
  stepText: { ...font('extrabold', 14, { color: palette.blue700 }) },
  stepValue: {
    ...font('bold', 12, { color: palette.ink }),
    minWidth: 52,
    textAlign: 'center',
  },
  partnerLine: {
    ...font('semibold', 12, { color: palette.grey600 }),
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
});

import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { PressableScale } from '@/components/ui';
import { CheckIcon } from '@/components/home/Icons';
import { ProgressRing } from '@/components/home/ProgressRing';
import type { WeekCell } from '@/domain/weekStrip';
import { font } from '@/theme/typography';
import { palette, radius, surfaceShadow } from '@/theme/tokens';

const DOT = 30;

/**
 * This week as a streak chain — the card Home opens on.
 *
 * Trained days are filled green discs joined by a bar, so consecutive days
 * read as one unbroken chain and a gap reads as a break in it: the pull of
 * "don't break the chain" rather than seven unrelated dots. Today carries a
 * live ring filling with the daily challenge and a soft pulse until it is
 * trained, so the one cell that can still change is the one that moves.
 *
 * Just the seven days: the weekly count lives on the streak tile and the
 * coaching on the challenge card, so this stays one slim row.
 */
export function WeekDateStrip({
  week,
  daysTrained,
  goal,
  todayPercent,
  onPress,
}: {
  week: WeekCell[];
  daysTrained: number;
  goal: number;
  /** Today's daily-challenge progress, 0–100, for today's ring. */
  todayPercent: number;
  onPress: () => void;
}) {

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`This week: ${daysTrained} of ${goal} training days`}
      style={styles.wrap}
    >
      <View style={styles.card}>
        <View style={styles.row}>
          {week.map((cell, i) => {
            const prev = week[i - 1];
            const next = week[i + 1];
            return (
              <View key={cell.day} style={styles.cell}>
                <Text style={[styles.letter, cell.isToday && styles.letterToday]}>{cell.letter}</Text>
                <View style={styles.dotSlot}>
                  {/* The chain: half-bars meeting between two trained days. */}
                  {cell.trained && prev?.trained ? <View style={[styles.link, styles.linkLeft]} /> : null}
                  {cell.trained && next?.trained ? <View style={[styles.link, styles.linkRight]} /> : null}
                  <Day cell={cell} todayPercent={todayPercent} />
                </View>
              </View>
            );
          })}
        </View>

      </View>
    </PressableScale>
  );
}

function Day({ cell, todayPercent }: { cell: WeekCell; todayPercent: number }) {
  const date = Number(cell.day.slice(8, 10));

  if (cell.trained) {
    return (
      <LinearGradient
        colors={[palette.green400, palette.green600]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.dot, cell.isToday && styles.dotTodayTrained]}
      >
        <CheckIcon size={15} color={palette.white} strokeWidth={3} />
      </LinearGradient>
    );
  }

  if (cell.isToday) {
    return (
      <View style={styles.dotBox}>
        <Pulse />
        <View style={[styles.dot, styles.dotToday]}>
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <ProgressRing
              percent={Math.max(2, todayPercent)}
              size={DOT}
              thickness={2.5}
              from={palette.green400}
              to={palette.green600}
              track="rgba(255,255,255,0.14)"
            />
          </View>
          <Text style={[styles.date, { color: palette.white }]}>{date}</Text>
        </View>
      </View>
    );
  }

  if (cell.isFuture) {
    return (
      <View style={[styles.dot, styles.dotFuture]}>
        <Text style={[styles.date, { color: palette.grey700 }]}>{date}</Text>
      </View>
    );
  }

  // Past and not trained: present, quiet, not red — a gap, not a scolding.
  return (
    <View style={[styles.dot, styles.dotMissed]}>
      <Text style={[styles.date, { color: palette.grey700 }]}>{date}</Text>
    </View>
  );
}

/** A soft ring breathing out from today until it is trained. */
function Pulse() {
  const t = useSharedValue(0);
  const focused = useIsFocused();
  useEffect(() => {
    if (!focused) {
      cancelAnimation(t);
      t.value = 0;
      return;
    }
    t.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 0 }),
      ),
      -1,
      false,
    );
  }, [t, focused]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.35 * (1 - t.value),
    transform: [{ scale: 1 + t.value * 0.45 }],
  }));
  return <Animated.View pointerEvents="none" style={[styles.pulse, style]} />;
}

const styles = StyleSheet.create({
  wrap: { marginTop: 10 },
  card: {
    backgroundColor: palette.white,
    borderRadius: radius['4xl'],
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
    paddingVertical: 8,
    paddingHorizontal: 8,
    ...surfaceShadow,
  },
  row: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', gap: 2 },
  letter: font('semibold', 11, { color: palette.grey700 }),
  letterToday: font('extrabold', 11, { color: palette.ink }),
  dotSlot: { width: '100%', height: DOT + 4, alignItems: 'center', justifyContent: 'center' },
  link: {
    position: 'absolute',
    top: (DOT + 4) / 2 - 2.5,
    height: 5,
    width: '50%',
    backgroundColor: palette.green500,
  },
  linkLeft: { left: 0 },
  linkRight: { right: 0 },
  dotBox: { width: DOT, height: DOT, alignItems: 'center', justifyContent: 'center' },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotTodayTrained: {
    shadowColor: palette.green600,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  dotToday: { backgroundColor: palette.ink },
  dotMissed: { backgroundColor: palette.divider },
  dotFuture: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: palette.borderStrong,
  },
  pulse: {
    position: 'absolute',
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: palette.green500,
  },
  date: { ...font('extrabold', 12.5), fontVariant: ['tabular-nums'] },

});

import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  ZoomIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { CountUp } from '@/components/motion';
import { font } from '@/theme/typography';
import { radius } from '@/theme/tokens';

const ME = '#4ade80';
const THEM = '#60a5fa';
/** Scores count for this long; the crown and verdict land when they stop. */
const COUNT_MS = 1400;
const COUNT_DELAY = 350;

/**
 * The moment of truth after a race: both scores counting up side by side.
 *
 * The share card below carries the numbers, but statically — the result
 * arrived with no reveal, which is the one beat a race most needs. Here the
 * two counts climb together from zero, like the race replaying, and only when
 * they stop does the crown drop onto the winner and the split bar fill. A loss
 * ends on the concrete next target rather than the margin alone.
 *
 * A together set has no winner: it shows both contributions adding up to the
 * shared total instead.
 */
export function ScoreReveal({
  myReps,
  theirReps,
  theirName,
  won,
  drew,
  cooperative,
}: {
  myReps: number;
  theirReps: number;
  theirName: string;
  won: boolean;
  drew: boolean;
  cooperative: boolean;
}) {
  const reduced = useReducedMotion();
  const total = myReps + theirReps;
  const share = total === 0 ? 0.5 : myReps / total;

  const split = useSharedValue(reduced ? share : 0.5);
  useEffect(() => {
    split.value = reduced
      ? share
      : withDelay(COUNT_DELAY + COUNT_MS, withTiming(share, { duration: 600, easing: Easing.out(Easing.cubic) }));
  }, [share, reduced, split]);
  const mine = useAnimatedStyle(() => ({ flex: Math.max(0.001, split.value) }));
  const theirs = useAnimatedStyle(() => ({ flex: Math.max(0.001, 1 - split.value) }));

  const margin = Math.abs(myReps - theirReps);
  const verdict = cooperative
    ? `${total} reps together`
    : drew
      ? 'Dead heat — settle it'
      : won
        ? `Won by ${margin}`
        : `Lost by ${margin} · ${theirReps + 1} reps wins it next time`;

  const crownDelay = reduced ? 0 : COUNT_DELAY + COUNT_MS;
  const showMyCrown = !cooperative && !drew && won;
  const showTheirCrown = !cooperative && !drew && !won;

  return (
    <LinearGradient colors={['#101826', '#0b1220']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
      <View style={styles.row}>
        <Side
          label="YOU"
          reps={myReps}
          color={ME}
          crown={showMyCrown}
          crownDelay={crownDelay}
          reduced={reduced}
        />
        <Text style={styles.vs}>{cooperative ? '+' : 'VS'}</Text>
        <Side
          label={theirName}
          reps={theirReps}
          color={THEM}
          crown={showTheirCrown}
          crownDelay={crownDelay}
          reduced={reduced}
        />
      </View>

      <View style={styles.bar}>
        <Animated.View style={[styles.barMe, mine]} />
        <View style={styles.barGap} />
        <Animated.View style={[styles.barThem, theirs]} />
      </View>

      <Animated.Text
        entering={reduced ? undefined : ZoomIn.delay(crownDelay).duration(300)}
        style={[styles.verdict, won && !cooperative && styles.verdictWin, cooperative && styles.verdictWin]}
      >
        {verdict}
      </Animated.Text>
    </LinearGradient>
  );
}

function Side({
  label,
  reps,
  color,
  crown,
  crownDelay,
  reduced,
}: {
  label: string;
  reps: number;
  color: string;
  crown: boolean;
  crownDelay: number;
  reduced: boolean;
}) {
  return (
    <View style={styles.side}>
      <View style={styles.crownSlot}>
        {crown ? (
          <Animated.Text entering={reduced ? undefined : ZoomIn.delay(crownDelay).springify().damping(9)} style={styles.crown}>
            👑
          </Animated.Text>
        ) : null}
      </View>
      {reduced ? (
        <Text style={[styles.score, { color }]}>{reps}</Text>
      ) : (
        <CountUp value={reps} duration={COUNT_MS} delay={COUNT_DELAY} style={[styles.score, { color }]} />
      )}
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius['3xl'], paddingHorizontal: 18, paddingVertical: 16, marginTop: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  side: { flex: 1, alignItems: 'center' },
  crownSlot: { height: 30, justifyContent: 'flex-end' },
  crown: { fontSize: 26 },
  score: { ...font('extrabold', 52), lineHeight: 58, letterSpacing: -1.5 },
  label: { ...font('extrabold', 11.5, { color: 'rgba(255,255,255,0.6)' }), letterSpacing: 1.2, maxWidth: 130 },
  vs: { ...font('extrabold', 16, { color: 'rgba(255,255,255,0.35)' }), letterSpacing: 1 },
  bar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  barMe: { backgroundColor: ME },
  barGap: { width: 2, backgroundColor: '#0b1220' },
  barThem: { backgroundColor: THEM },
  verdict: {
    ...font('bold', 14, { color: 'rgba(255,255,255,0.8)' }),
    textAlign: 'center',
    marginTop: 12,
  },
  verdictWin: font('extrabold', 15, { color: '#fde68a' }),
});

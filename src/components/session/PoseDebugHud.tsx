import { StyleSheet, Text, View } from 'react-native';

import { font } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

/**
 * Dev-only diagnostic strip for validating the pose pipeline on a real body.
 *
 * The rep-counting state machine is well covered by unit tests, but those run on
 * synthetic poses — they cannot tell you whether the *model* produces a usable
 * signal from a real person in a real room. That boundary is where rep counters
 * actually fail, and it is invisible from the normal HUD, which only shows the
 * final rep count.
 *
 * This surfaces the raw inputs the counter is deciding on, so a single set tells
 * you whether the thresholds are right:
 *
 *  - `depth` should sweep smoothly toward 1.0 at the bottom of a rep and back to
 *    ~0 at the top. If it never crosses the down threshold, reps won't count; if
 *    it jitters wildly, the model is not tracking the joints cleanly.
 *  - `tracking` should stay true throughout. Frequent dropouts mean poor framing
 *    or lighting rather than a logic bug.
 *
 * Rendered only under `__DEV__`, so it never ships to athletes.
 */
export function PoseDebugHud({
  depth,
  tracking,
  reps,
  downThreshold,
  upThreshold,
}: {
  depth: number;
  tracking: boolean;
  reps: number;
  downThreshold: number;
  upThreshold: number;
}) {
  if (!__DEV__) return null;

  // Where the current depth sits on the 0..1 bar, plus the two thresholds the
  // state machine switches on — seeing them together makes a mis-tuned
  // threshold obvious at a glance.
  const pct = Math.round(Math.max(0, Math.min(1, depth)) * 100);

  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.row}>
        <Text style={styles.label}>DEPTH</Text>
        <Text style={styles.value}>{depth.toFixed(2)}</Text>
        <Text style={[styles.label, { marginLeft: 8 }]}>REPS</Text>
        <Text style={styles.value}>{reps}</Text>
        <Text style={[styles.label, { marginLeft: 8 }]}>TRACK</Text>
        <Text style={[styles.value, { color: tracking ? palette.green400 : palette.red500 }]}>
          {tracking ? 'OK' : 'LOST'}
        </Text>
      </View>

      {/* Depth bar with the up/down thresholds marked, so you can see whether a
          real rep actually crosses them. */}
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
        <View style={[styles.tick, { left: `${upThreshold * 100}%` }]} />
        <View style={[styles.tick, styles.tickDown, { left: `${downThreshold * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 8,
    backgroundColor: 'rgba(9,14,11,0.82)',
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 8,
    zIndex: 50,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  label: { ...font('bold', 9.5, { color: 'rgba(255,255,255,0.55)' }), letterSpacing: 1 },
  value: { ...font('extrabold', 12, { color: palette.white }), marginLeft: 4 },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginTop: 4,
    overflow: 'visible',
  },
  fill: { height: 6, borderRadius: 3, backgroundColor: palette.green400 },
  tick: {
    position: 'absolute',
    top: -3,
    width: 2,
    height: 12,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  tickDown: { backgroundColor: palette.amber500 },
});

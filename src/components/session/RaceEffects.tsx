import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { heatLabel, readHeat, type Heat } from '@/domain/raceMomentum';
import { font } from '@/theme/typography';
import { palette } from '@/theme/tokens';

/**
 * The live-race layer of the duel HUD: momentum, the rival's reps landing, and
 * the closing seconds pressing in from the edges.
 *
 * All of it is `pointerEvents="none"` and sits over the camera, so none of it
 * can steal a tap from Give Up or block the pose overlay underneath.
 */

/**
 * Timestamps of each side's reps, and the momentum they add up to.
 *
 * Timestamps are taken here, when a count goes up, rather than threaded down
 * from the session: the HUD already receives both counts, and the moment a
 * count changes on this device is the moment the athlete experiences it. A
 * count going *down* means a new set, which starts the history over.
 *
 * Re-read once a second as well as on each rep, because momentum also ends
 * by nothing happening: a run has to go cold without a rep to trigger it.
 */
export function useRaceHeat(reps: number, opponentReps: number): Heat {
  const mine = useRef<number[]>([]);
  const theirs = useRef<number[]>([]);
  const last = useRef({ reps, opponentReps });
  const [heat, setHeat] = useState<Heat>({ kind: 'none' });

  useEffect(() => {
    const now = Date.now();
    const push = (list: number[], from: number, to: number) => {
      if (to < from) {
        list.length = 0;
        return;
      }
      for (let i = from; i < to; i++) list.push(now);
      // Only the window matters; keep the list from growing all set.
      if (list.length > 40) list.splice(0, list.length - 40);
    };
    push(mine.current, last.current.reps, reps);
    push(theirs.current, last.current.opponentReps, opponentReps);
    last.current = { reps, opponentReps };
    setHeat(readHeat(mine.current, theirs.current, now));
  }, [reps, opponentReps]);

  useEffect(() => {
    const id = setInterval(() => {
      setHeat((prev) => {
        const next = readHeat(mine.current, theirs.current, Date.now());
        // Same kind and run: keep the old object so nothing re-renders.
        const same =
          next.kind === prev.kind &&
          (next.kind === 'none' || (prev.kind !== 'none' && next.run === prev.run));
        return same ? prev : next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return heat;
}

/** "ON FIRE ×4" for my run, or a warning when the rival is the one surging. */
export function HeatChip({ heat, rivalName }: { heat: Heat; rivalName: string }) {
  const label = heatLabel(heat, rivalName);
  if (!label) return null;
  const mine = heat.kind === 'mine';
  return (
    <Animated.View
      key={`${heat.kind}-${mine ? heat.run : ''}`}
      entering={FadeIn.duration(160)}
      exiting={FadeOut.duration(200)}
      style={[styles.heat, mine ? styles.heatMine : styles.heatTheirs]}
      pointerEvents="none"
    >
      <Text style={styles.heatText}>
        {mine ? '🔥 ' : '⚡ '}
        {label}
      </Text>
    </Animated.View>
  );
}

/**
 * A "+1" that rises off the rival's score each time they land a rep.
 *
 * Their count popping was easy to miss while mid-rep with eyes on the floor;
 * movement in the corner of the eye is not. Keyed on the count so each rep
 * mounts a fresh float, and skipped on mount so joining mid-race does not
 * fire one for a rep nobody saw.
 */
export function RivalPing({ count, color }: { count: number; color: string }) {
  const [atMount] = useState(count);
  if (count <= atMount) return null;
  return <Float key={count} color={color} />;
}

function Float({ color }: { color: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [t]);
  const style = useAnimatedStyle(() => ({
    opacity: 1 - t.value,
    transform: [{ translateY: -28 * t.value }, { scale: 1 + 0.25 * t.value }],
  }));
  return (
    <Animated.View style={[styles.ping, style]} pointerEvents="none">
      <Text style={[styles.pingText, { color }]}>+1</Text>
    </Animated.View>
  );
}

/**
 * The closing seconds, pressing in from the edges of the screen.
 *
 * A border rather than a full-screen tint: the athlete still has to see
 * themselves in the camera and read the pose overlay, so the effect stays at
 * the rim, where peripheral vision catches it without covering anything.
 */
export function EdgePulse({ active }: { active: boolean }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = active
      ? withRepeat(
          withSequence(
            withTiming(1, { duration: 380, easing: Easing.out(Easing.quad) }),
            withTiming(0.25, { duration: 620, easing: Easing.in(Easing.quad) }),
          ),
          -1,
        )
      : withTiming(0, { duration: 200 });
  }, [active, pulse]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return <Animated.View style={[StyleSheet.absoluteFill, styles.edge, style]} pointerEvents="none" />;
}

const styles = StyleSheet.create({
  heat: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  heatMine: { backgroundColor: 'rgba(249,115,22,0.9)' },
  heatTheirs: { backgroundColor: 'rgba(37,99,235,0.85)' },
  heatText: { ...font('extrabold', 12, { color: palette.white }), letterSpacing: 1.1 },
  ping: { position: 'absolute', right: 6, top: -6 },
  pingText: {
    ...font('extrabold', 20, {}),
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 6,
  },
  edge: {
    borderWidth: 7,
    borderColor: palette.red500,
    borderRadius: 28,
  },
});


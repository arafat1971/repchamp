import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { formatMl } from '@/domain/hydration';
import { font } from '@/theme/typography';

/**
 * The moment water goes into a glass: a drop falls, splashes, and the amount
 * floats up — or, for an undo, the amount floats up in amber.
 *
 * Driven by `ml` alone, so it plays for whatever raised the total: my own
 * tap, or my partner drinking on their phone and the couple document
 * carrying it here live. The first value it sees is a baseline, never an
 * event — opening the app is not a pour.
 *
 * `surfaceY` is where the water sits in the glass, so the drop lands on it.
 */
export function PourFX({ ml, surfaceY }: { ml: number | null; surfaceY: number }) {
  const reduced = useReducedMotion();
  const prev = useRef<number | null>(ml);
  const [event, setEvent] = useState<{ id: number; delta: number } | null>(null);

  useEffect(() => {
    const before = prev.current;
    prev.current = ml;
    if (before == null || ml == null || ml === before) return;
    setEvent((e) => ({ id: (e?.id ?? 0) + 1, delta: ml - before }));
  }, [ml]);

  if (!event) return null;
  return (
    <Burst
      key={event.id}
      delta={event.delta}
      surfaceY={surfaceY}
      reduced={reduced}
      onDone={() => setEvent(null)}
    />
  );
}

function Burst({
  delta,
  surfaceY,
  reduced,
  onDone,
}: {
  delta: number;
  surfaceY: number;
  reduced: boolean;
  onDone: () => void;
}) {
  const pour = delta > 0;
  const drop = useSharedValue(0);
  const splash = useSharedValue(0);
  const label = useSharedValue(0);

  useEffect(() => {
    if (pour && !reduced) {
      drop.value = withTiming(1, { duration: 420, easing: Easing.in(Easing.quad) });
      splash.value = withDelay(400, withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) }));
    }
    label.value = withDelay(
      pour && !reduced ? 380 : 0,
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }),
        withTiming(1.001, { duration: 200 }, (finished) => {
          if (finished) runOnJS(onDone)();
        }),
      ),
    );
  }, [pour, reduced, drop, splash, label, onDone]);

  const dropStyle = useAnimatedStyle(() => ({
    opacity: drop.value === 0 || drop.value === 1 ? 0 : 1,
    transform: [{ translateY: -46 + drop.value * (surfaceY + 40) }],
  }));
  const ring = (scaleTo: number) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useAnimatedStyle(() => ({
      opacity: splash.value === 0 ? 0 : 0.8 * (1 - splash.value),
      transform: [{ translateY: surfaceY - 4 }, { scaleX: 0.3 + splash.value * scaleTo }, { scaleY: 0.3 + splash.value * scaleTo * 0.35 }],
    }));
  const ringA = ring(1.1);
  const ringB = ring(1.9);
  const labelStyle = useAnimatedStyle(() => ({
    opacity: label.value < 0.15 ? label.value / 0.15 : 1 - Math.max(0, label.value - 0.7) / 0.3,
    transform: [{ translateY: surfaceY - 18 - label.value * 42 }, { scale: 0.9 + label.value * 0.15 }],
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {pour ? (
        <>
          <Animated.View style={[styles.center, dropStyle]}>
            <Svg width={14} height={20} viewBox="0 0 14 20">
              <Path d="M7 0 C7 0 0 9 0 13 A7 7 0 0 0 14 13 C14 9 7 0 7 0 Z" fill="#bae6fd" />
              <Path d="M4.5 12 A3 3 0 0 0 6 16" stroke="#ffffff" strokeWidth={1.2} fill="none" strokeLinecap="round" />
            </Svg>
          </Animated.View>
          <Animated.View style={[styles.center, styles.ring, ringA]} />
          <Animated.View style={[styles.center, styles.ring, ringB]} />
        </>
      ) : null}
      <Animated.View style={[styles.center, labelStyle]}>
        <Text style={[styles.label, !pour && styles.labelUndo]}>
          {pour ? '+' : '−'}
          {formatMl(Math.abs(delta))}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' },
  ring: {
    alignSelf: 'center',
    left: undefined,
    right: undefined,
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: '#bae6fd',
  },
  label: {
    ...font('extrabold', 15, { color: '#e0f2fe' }),
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 6,
  },
  labelUndo: { color: '#fcd34d' },
});

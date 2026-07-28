import { useEffect, useState, type ReactNode } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { motion } from '@/theme/tokens';

/**
 * Shared motion vocabulary.
 *
 * Every animation here runs on the UI thread via Reanimated, so nothing
 * competes with the pose pipeline for the JS thread during a session. Durations
 * and easings come from `theme/tokens` so motion stays as consistent as colour.
 */

const EASE_OUT = Easing.bezier(...motion.easeOut);

/**
 * Continuous gentle vertical drift — the prototype's `floaty` keyframe.
 *
 * Used sparingly on hero badges and celebration art, where a completely static
 * element reads as a screenshot rather than a live screen.
 */
export function Floating({
  children,
  delay = 0,
  distance = 8,
  duration = 2600,
  style,
}: {
  children: ReactNode;
  delay?: number;
  distance?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const offset = useSharedValue(0);

  useEffect(() => {
    offset.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-distance, { duration: duration / 2, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: duration / 2, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      ),
    );
  }, [offset, delay, distance, duration]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

/**
 * Staggered entrance for a list or grid.
 *
 * `index` spaces each child slightly behind the last so a screen assembles
 * itself rather than appearing all at once — the single cheapest thing that
 * makes a screen feel considered.
 */
export function StaggerIn({
  children,
  index = 0,
  step = 60,
  from = 14,
  style,
}: {
  children: ReactNode;
  index?: number;
  step?: number;
  from?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View
      style={style}
      entering={FadeInDown.delay(index * step)
        .duration(motion.screenIn)
        .withInitialValues({ transform: [{ translateY: from }] })}
    >
      {children}
    </Animated.View>
  );
}

/**
 * A value that springs when it changes.
 *
 * Applied to counters and badges so a change is *felt*, not just read — the
 * number pops slightly rather than silently swapping.
 */
export function PopOnChange({
  children,
  trigger,
  scale = 1.18,
  style,
}: {
  children: ReactNode;
  trigger: number | string;
  scale?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const value = useSharedValue(1);
  const isFirst = useSharedValue(true);

  useEffect(() => {
    // Don't pop on mount — only on genuine change.
    if (isFirst.value) {
      isFirst.value = false;
      return;
    }
    value.value = withSequence(
      withTiming(scale, { duration: 100, easing: EASE_OUT }),
      withSpring(1, { damping: 10, stiffness: 320 }),
    );
  }, [trigger, value, isFirst, scale]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: value.value }] }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

/**
 * A number that counts up to its value on mount.
 *
 * Used where the number *is* the promise — a projected XP total reads as a
 * claim when it simply appears, but as something being earned when it climbs.
 * Runs on the JS thread via a rAF-style interval rather than Reanimated,
 * because the value has to be formatted (thousands separators) on the way out,
 * which a worklet cannot do.
 */
export function CountUp({
  value,
  duration = 1100,
  delay = 250,
  format = (n: number) => n.toLocaleString(),
  style,
}: {
  value: number;
  duration?: number;
  delay?: number;
  format?: (n: number) => string;
  style?: StyleProp<TextStyle>;
}) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    let raf = 0;
    let start = 0;
    let cancelled = false;

    const tick = (now: number) => {
      if (cancelled) return;
      if (!start) start = now;
      const elapsed = now - start;
      // Ease-out cubic so it decelerates into the final figure rather than
      // stopping dead.
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(value * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };

    const timer = setTimeout(() => {
      raf = requestAnimationFrame(tick);
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [value, duration, delay]);

  return <Animated.Text style={style}>{format(shown)}</Animated.Text>;
}

/**
 * Slow parallax drift for a hero image.
 *
 * A very small, very slow scale oscillation. Enough that the image is never
 * completely still, not enough to read as movement.
 */
export function BreathingImage({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const value = useSharedValue(1);

  useEffect(() => {
    value.value = withRepeat(
      withSequence(
        withTiming(1.04, { duration: 5200, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 5200, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [value]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: value.value }] }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

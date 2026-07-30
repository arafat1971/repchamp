import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { forwardRef, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { text } from '@/theme/typography';
import { gradients, palette, radius, shadow, type Gradient } from '@/theme/tokens';
import { lightImpactHaptic } from '@/lib/feedback';

export { Skeleton, SkeletonCircle } from './Skeleton';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/* ------------------------------------------------------------------ *
 * Layout
 * ------------------------------------------------------------------ */

/**
 * Standard screen container. `scroll` mirrors the prototype's `.scr .pad`
 * wrapper — 20pt gutters and enough bottom padding to clear the tab bar.
 */
export function Screen({
  children,
  scroll = true,
  style,
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const padding = { paddingTop: insets.top + 8, paddingBottom: 116 };

  if (!scroll) {
    return <View style={[styles.screen, padding, style]}>{children}</View>;
  }

  return (
    <ScrollView
      style={[styles.screen, style]}
      contentContainerStyle={[styles.screenContent, padding, contentStyle]}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

/** Section heading above a list, e.g. "Today's Challenges". */
export function SectionLabel({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[text.section, style]}>{children}</Text>;
}

/** Small muted all-caps label, e.g. "ONLINE NOW". */
export function Eyebrow({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[text.eyebrow, style]}>{children}</Text>;
}

/* ------------------------------------------------------------------ *
 * Surfaces
 * ------------------------------------------------------------------ */

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/**
 * Gradient hero card. `glow` adds the coloured drop shadow the prototype uses
 * under its brand-coloured surfaces.
 */
export function GradientCard({
  colors,
  children,
  style,
  glow,
}: {
  colors: Gradient;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  glow?: keyof typeof shadow;
}) {
  return (
    <LinearGradient
      colors={colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.gradientCard, glow ? shadow[glow] : null, style]}
    >
      {children}
    </LinearGradient>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

/* ------------------------------------------------------------------ *
 * Interaction
 * ------------------------------------------------------------------ */

/**
 * Press target that scales down on touch, matching the prototype's
 * `.press:active { transform: scale(.96) }`.
 *
 * Uses a spring rather than a timing curve so a quick tap still completes the
 * return animation instead of snapping.
 */
export const PressableScale = forwardRef<View, PressableProps & { children: ReactNode }>(
  function PressableScale({ children, style, ...props }, ref) {
    const scale = useSharedValue(1);
    const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

    return (
      <AnimatedPressable
        ref={ref}
        {...props}
        // Declared after the spread: with `{...props}` last, a caller passing
        // onPressIn/onPressOut silently replaced the scale animation and
        // haptic instead of composing with them. Both callbacks still forward
        // to the caller's handler below.
        onPressIn={(e) => {
          // eslint-disable-next-line react-hooks/immutability
          scale.value = withTiming(0.96, { duration: 90 });
          lightImpactHaptic();
          props.onPressIn?.(e);
        }}
        onPressOut={(e) => {
          // eslint-disable-next-line react-hooks/immutability
          scale.value = withSpring(1, { damping: 14, stiffness: 260 });
          props.onPressOut?.(e);
        }}
        style={[animatedStyle, style as StyleProp<ViewStyle>]}
      >
        {children}
      </AnimatedPressable>
    );
  },
);

/** Full-width primary CTA with the brand gradient. */
export function PrimaryButton({
  label,
  onPress,
  disabled,
  colors = gradients.brandStrong,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  colors?: Gradient;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={[styles.primaryButtonWrap, style]}
    >
      <LinearGradient
        colors={disabled ? [palette.border, palette.border] : colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.primaryButton}
      >
        <Text style={[text.button, disabled && { color: palette.grey450 }]}>{label}</Text>
      </LinearGradient>
    </PressableScale>
  );
}

/** Square icon button used for back chevrons and the settings gear. */
export function IconButton({
  glyph,
  onPress,
  label,
  style,
}: {
  glyph: string;
  onPress: () => void;
  label: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.iconButton, style]}
    >
      <Text style={styles.iconButtonGlyph}>{glyph}</Text>
    </PressableScale>
  );
}

/* ------------------------------------------------------------------ *
 * Data display
 * ------------------------------------------------------------------ */

export function StatTile({
  value,
  label,
  color = palette.ink,
  emoji,
}: {
  value: string | number;
  label: string;
  color?: string;
  emoji?: string;
}) {
  return (
    <Card style={styles.statTile}>
      {emoji ? <Text style={styles.statEmoji}>{emoji}</Text> : null}
      <Text style={[text.stat, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Card>
  );
}

/**
 * Horizontal progress bar. Animates width changes so XP gains slide in rather
 * than jumping, matching the prototype's `transition: width .9s`.
 */
export function ProgressBar({
  percent,
  height = 10,
  trackColor = palette.border,
  fillColors,
  fillColor = palette.green500,
}: {
  percent: number;
  height?: number;
  trackColor?: string;
  fillColors?: Gradient;
  fillColor?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const animatedStyle = useAnimatedStyle(
    () => ({ width: withTiming(`${clamped}%`, { duration: 900 }) }),
    [clamped],
  );

  return (
    <View
      style={[styles.progressTrack, { height, borderRadius: height / 2, backgroundColor: trackColor }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
    >
      <Animated.View style={[{ height: '100%', borderRadius: height / 2 }, animatedStyle]}>
        {fillColors ? (
          <LinearGradient
            colors={fillColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ flex: 1, borderRadius: height / 2 }}
          />
        ) : (
          <View style={{ flex: 1, borderRadius: height / 2, backgroundColor: fillColor }} />
        )}
      </Animated.View>
    </View>
  );
}

/** Circular initial avatar — shows photo when `uri` is provided. */
export function Avatar({
  initial,
  emoji,
  uri,
  size = 44,
  background = palette.green50,
  color = palette.green700,
  square = false,
  online,
}: {
  initial: string;
  /** App-owned emoji avatar (e.g. AI partners). Wins over `initial` when set. */
  emoji?: string;
  uri?: string | null;
  size?: number;
  background?: string;
  color?: string;
  square?: boolean;
  online?: boolean;
}) {
  const borderRadius = square ? size * 0.32 : size / 2;
  return (
    <View>
      <View
        style={{
          width: size,
          height: size,
          borderRadius,
          backgroundColor: background,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {uri ? (
          <Image source={{ uri }} style={{ width: size, height: size }} contentFit="cover" />
        ) : emoji ? (
          <Text style={{ fontSize: size * 0.5 }}>{emoji}</Text>
        ) : (
          <Text style={{ ...text.cardTitle, fontSize: size * 0.38, color }}>{initial}</Text>
        )}
      </View>
      {online !== undefined ? (
        <View
          style={[
            styles.presenceDot,
            { backgroundColor: online ? palette.green500 : palette.grey400 },
          ]}
        />
      ) : null}
    </View>
  );
}

/** Small rounded status pill, e.g. "You won" / "Earned". */
export function Badge({
  label,
  color = palette.green600,
  background = palette.green50,
  style,
}: {
  label: string;
  color?: string;
  background?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.badge, { backgroundColor: background }, style]}>
      <Text style={[text.badgeSm, { color }]}>{label}</Text>
    </View>
  );
}

/** iOS-style toggle used throughout Settings. */
export function Toggle({
  value,
  onChange,
  label,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  const animatedStyle = useAnimatedStyle(
    () => ({ transform: [{ translateX: withSpring(value ? 20 : 0, { damping: 18, stiffness: 240 }) }] }),
    [value],
  );

  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      style={[styles.toggleTrack, { backgroundColor: value ? palette.green500 : palette.borderStrong }]}
    >
      <Animated.View style={[styles.toggleThumb, animatedStyle]} />
    </Pressable>
  );
}

/** Chevron shown on the right of navigable rows. */
export function Chevron({ color = palette.grey400 }: { color?: string }) {
  return <Text style={{ color, fontSize: 20 }}>›</Text>;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.canvas,
  },
  screenContent: {
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: palette.white,
    borderRadius: radius['5xl'],
    ...shadow.card,
  },
  gradientCard: {
    borderRadius: radius['5xl'],
    overflow: 'hidden',
  },
  divider: {
    height: 1,
    backgroundColor: palette.divider,
  },
  primaryButtonWrap: {
    width: '100%',
    borderRadius: radius['4xl'],
    ...shadow.brand,
  },
  primaryButton: {
    height: 60,
    borderRadius: radius['4xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  iconButtonGlyph: {
    fontSize: 18,
    color: palette.ink,
    lineHeight: 22,
  },
  statTile: {
    flex: 1,
    padding: 16,
  },
  statEmoji: {
    fontSize: 20,
    marginBottom: 6,
  },
  statLabel: {
    ...text.caption,
    marginTop: 2,
  },
  progressTrack: {
    width: '100%',
    overflow: 'hidden',
  },
  presenceDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2.5,
    borderColor: palette.canvas,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.md,
    alignSelf: 'flex-start',
  },
  toggleTrack: {
    width: 50,
    height: 30,
    borderRadius: 16,
    padding: 3,
    justifyContent: 'center',
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: palette.white,
    shadowColor: palette.black,
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});

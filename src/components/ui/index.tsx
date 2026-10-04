import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Children, forwardRef, useEffect, useRef, type ReactNode } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { reservedControlHeight } from '@/theme/fontScale';
import { scaleFor, scaleForRole, text } from '@/theme/typography';
import { gradients, motion, palette, radius, shadow, space, SCREEN_GUTTER, type Gradient } from '@/theme/tokens';
import { lightImpactHaptic } from '@/lib/feedback';
import { useFabStore } from '@/state/fabStore';
import { AiAvatar, aiPersonaForEmoji, aiPersonaForId } from './AiAvatar';

export { Skeleton, SkeletonCircle } from './Skeleton';
export { EmptyState, ErrorState } from './EmptyState';

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
  onRefresh,
  refreshing = false,
  enter = false,
  tuckFabOnScroll = false,
}: {
  children: ReactNode;
  scroll?: boolean;
  /**
   * Staggers each top-level child in on mount, so a pushed screen assembles
   * itself as it slides in instead of arriving as a finished sheet. For
   * screens that do not already place their own `StaggerIn`s; scroll mode
   * only, since wrapping would break a `flex: 1` child of a fixed screen.
   */
  enter?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  /** Adds pull-to-refresh. Omit it and the screen scrolls exactly as before. */
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Tuck the floating Train button away while scrolling down; see `fabStore`. */
  tuckFabOnScroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const lastY = useRef(0);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const y = contentOffset.y;
    const dy = y - lastY.current;
    // Ignore the rubber-band past either end: it reads as a direction change.
    const atEnd = y + layoutMeasurement.height >= contentSize.height - 4;
    if (y <= 60) useFabStore.getState().setTucked(false);
    else if (atEnd) return;
    else if (dy > 6) useFabStore.getState().setTucked(true);
    else if (dy < -6) useFabStore.getState().setTucked(false);
    else return;
    lastY.current = y;
  };
  /*
   * Bottom clearance keeps the floating Train FAB off the last tiles.
   *
   * This was a flat 148, measured once against a device with no home
   * indicator. The FAB's real extent is arithmetic, not a measurement: the tab
   * bar is `60 + max(insets.bottom, 16)`, the FAB sits 25 above that
   * (`app/(tabs)/_layout.tsx`), and it is 58 tall. On a Pixel that comes to
   * ~166, so 148 left the button overlapping the last row — visibly, on top of
   * the Squats card.
   *
   * Derived here so the two cannot drift: if the FAB moves or grows, this
   * follows. The 16 of headroom is so a card's shadow does not tuck under it.
   *
   * Horizontal insets matter on iOS too: in landscape the notch eats one side,
   * and content that ignores it is drawn under the sensor housing.
   */
  const tabBarHeight = 60 + Math.max(insets.bottom, 16);
  const fabClearance = tabBarHeight + 25 + 58 + 16;
  const padding = {
    paddingTop: insets.top + 8,
    paddingBottom: fabClearance,
    // Added to the 20pt gutter, never replacing it: these are 0 on a portrait
    // phone, so assigning them flattened the gutter and every card bled off
    // both edges. Only landscape/notched displays report a non-zero value.
    paddingLeft: SCREEN_GUTTER + insets.left,
    paddingRight: SCREEN_GUTTER + insets.right,
  };

  if (!scroll) {
    return (
      <View style={[styles.screen, styles.screenContent, padding, style, contentStyle]}>
        {children}
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.screen, style]}
      contentContainerStyle={[styles.screenContent, padding, contentStyle]}
      showsVerticalScrollIndicator={false}
      // Lets a horizontal child (the home hero carousel) keep its own gesture
      // rather than having this vertical scroll claim it.
      directionalLockEnabled
      onScroll={tuckFabOnScroll ? onScroll : undefined}
      scrollEventThrottle={tuckFabOnScroll ? 32 : undefined}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={palette.green600}
            colors={[palette.green600]}
          />
        ) : undefined
      }
    >
      {enter
        ? Children.toArray(children).map((child, i) => (
            <Animated.View
              key={(child as { key?: string | null }).key ?? i}
              // Capped so a long list's tail is not still arriving a second
              // after the screen has settled.
              entering={FadeInDown.delay(Math.min(i, ENTER_MAX_STEPS) * ENTER_STEP)
                .duration(motion.screenIn)
                .withInitialValues({ transform: [{ translateY: 14 }] })}
            >
              {child}
            </Animated.View>
          ))
        : children}
    </ScrollView>
  );
}

const ENTER_STEP = 50;
const ENTER_MAX_STEPS = 7;

/** Section heading above a list, e.g. "Today's Challenges". */
export function SectionLabel({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text style={[text.section, style]} {...scaleFor('section')}>
      {children}
    </Text>
  );
}

/** Small muted all-caps label, e.g. "ONLINE NOW". */
export function Eyebrow({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text style={[text.eyebrow, style]} {...scaleFor('eyebrow')}>
      {children}
    </Text>
  );
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
 * Presses in on a short timing curve so the touch registers instantly, then
 * releases on a lightly underdamped spring — the control settles back with a
 * small overshoot rather than sliding to rest.
 */
const PRESS_RELEASE = { damping: 13, stiffness: 320, mass: 0.7 } as const;

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
          scale.value = withTiming(0.96, { duration: motion.fast });
          lightImpactHaptic();
          props.onPressIn?.(e);
        }}
        onPressOut={(e) => {
          // eslint-disable-next-line react-hooks/immutability
          scale.value = withSpring(1, PRESS_RELEASE);
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
  // The button grows with its label rather than clipping it. At the default
  // text size this is exactly the designed 60pt — see `@/theme/fontScale`.
  const { fontScale } = useWindowDimensions();
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
        style={[styles.primaryButton, { minHeight: reservedControlHeight(60, fontScale) }]}
      >
        <Text
          style={[text.button, disabled && { color: palette.grey450 }]}
          {...scaleFor('button')}
        >
          {label}
        </Text>
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
      <Text style={styles.iconButtonGlyph} {...scaleForRole('control')}>
        {glyph}
      </Text>
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
      <Text style={[text.stat, { color }]} {...scaleFor('stat')}>
        {value}
      </Text>
      <Text style={styles.statLabel} {...scaleForRole('control')}>
        {label}
      </Text>
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
  // Starts empty so the bar fills on arrival as well as on change — a bar that
  // is already full when the screen appears reads as decoration, not progress.
  const fill = useSharedValue(0);
  useEffect(() => {
    fill.value = withTiming(clamped, {
      duration: motion.xpFill,
      easing: Easing.bezier(...motion.easeOut),
    });
  }, [clamped, fill]);
  const animatedStyle = useAnimatedStyle(() => ({ width: `${fill.value}%` }));

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
  ai,
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
  /** An AI partner's id (roster or built-in rival) — draws its illustrated avatar. */
  ai?: string;
  uri?: string | null;
  size?: number;
  background?: string;
  color?: string;
  square?: boolean;
  online?: boolean;
}) {
  const borderRadius = square ? size * 0.32 : size / 2;
  /* The app's AI characters are drawn, not emoji. */
  const persona = uri ? null : (aiPersonaForId(ai) ?? aiPersonaForEmoji(emoji));
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
        ) : persona ? (
          <AiAvatar persona={persona} size={size} />
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
      <Text style={[text.badgeSm, { color }]} {...scaleForRole('control')}>
        {label}
      </Text>
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
    // Horizontal padding lives on `Screen` so it can fold in safe-area insets.
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
    // `minHeight` is supplied at render time from the live font scale, so the
    // label can never be clipped by its own button. Declaring a fixed `height`
    // here again would silently reinstate that clipping.
    borderRadius: radius['4xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButton: {
    // 44, not 40: the accessibility node reports the *element* bounds, so a
    // hitSlop-padded 40pt chip still audits as 40 even though the tap lands.
    // Measured on device (uiautomator) at exactly 40.0x40.0dp before this.
    //
    // `minHeight`, so a glyph rendered at a larger text size grows the chip
    // instead of being cropped by it. 44 remains the floor the audit measures.
    width: 44,
    minHeight: 44,
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
    marginBottom: space.sm,
  },
  statLabel: {
    ...text.caption,
    marginTop: space.xs,
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
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.md,
    alignSelf: 'flex-start',
  },
  toggleTrack: {
    width: 50,
    height: 30,
    borderRadius: radius.lg,
    // Load-bearing, deliberately off-grid: 24pt thumb + 3pt each side = 30pt,
    // exactly the track height. At 4 the thumb overflows and clips.
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

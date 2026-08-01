import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, Tabs, usePathname, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Image as RNImage,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ColorValue,
} from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { useProfileStore } from '@/state/profileStore';
import { useIsPro } from '@/state/proStore';
import { canStartExercise } from '@/domain/pro';
import { font, fontFamily } from '@/theme/typography';
import { palette } from '@/theme/tokens';
import { selectionHaptic } from '@/lib/feedback';

/** Matches the shape React Navigation passes to `tabBarIcon`. */
type IconProps = { color: ColorValue; focused: boolean; size: number };

/**
 * Selected tabs spring up slightly with a soft green glow; idle icons stay flat.
 */
function IconShell({ focused, children }: { focused: boolean; children: React.ReactNode }) {
  const scale = useSharedValue(focused ? 1.08 : 1);
  const glow = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    scale.value = withSpring(focused ? 1.1 : 1, { damping: 12, stiffness: 220 });
    glow.value = withTiming(focused ? 1 : 0, { duration: 180 });
  }, [focused, glow, scale]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    shadowOpacity: interpolate(glow.value, [0, 1], [0, 0.35]),
  }));

  return (
    <Animated.View
      style={[
        styles.iconWrapper,
        focused && styles.iconFocused,
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

function HomeIcon({ color, focused }: IconProps) {
  const c = String(color);
  return (
    <IconShell focused={focused}>
      <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
        {focused ? (
          <Path
            d="M11.3 3.62a1.05 1.05 0 0 1 1.4 0l8.2 6.9a1 1 0 0 1 .35.77V19.2A1.8 1.8 0 0 1 19.45 21H4.55A1.8 1.8 0 0 1 2.75 19.2v-7.91a1 1 0 0 1 .35-.77z"
            fill={c}
          />
        ) : (
          <>
            <Path d="M3.5 10.7 12 3.6l8.5 7.1" stroke={c} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
            <Path
              d="M5.1 9.5V19.1A1.7 1.7 0 0 0 6.8 20.8h10.4A1.7 1.7 0 0 0 18.9 19.1V9.5"
              stroke={c}
              strokeWidth={1.9}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Path
              d="M9.7 20.6v-5.1a1 1 0 0 1 1-1h2.6a1 1 0 0 1 1 1v5.1"
              stroke={c}
              strokeWidth={1.9}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}
      </Svg>
    </IconShell>
  );
}

function ArenaIcon({ color, focused }: IconProps) {
  const c = String(color);
  const handles =
    'M6.9 6.2H4.6A1.15 1.15 0 0 0 3.45 7.35 3.5 3.5 0 0 0 6.95 10.85M17.1 6.2h2.3A1.15 1.15 0 0 1 20.55 7.35 3.5 3.5 0 0 1 17.05 10.85';
  const stand = 'M12 14.4v2.9M9 20.2h6M10.4 17.3h3.2';
  return (
    <IconShell focused={focused}>
      <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
        {focused ? (
          <>
            <Path d="M6.8 4.6h10.4V9.2a5.2 5.2 0 0 1-10.4 0z" fill={c} />
            <Path d={handles} stroke={c} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
            <Path d={stand} stroke={c} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
          </>
        ) : (
          <>
            <Path d="M6.8 4.6h10.4V9.2a5.2 5.2 0 0 1-10.4 0z" stroke={c} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
            <Path d={handles} stroke={c} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
            <Path d={stand} stroke={c} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
      </Svg>
    </IconShell>
  );
}

function FriendsIcon({ color, focused }: IconProps) {
  const c = String(color);
  return (
    <IconShell focused={focused}>
      <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
        {focused ? (
          <>
            <Circle cx={16.6} cy={7.2} r={2.5} fill={c} />
            <Path d="M13.8 19.2c0-2.9 2.2-4.9 4.9-4.9s4.9 2 4.9 4.9z" fill={c} />
            <Circle cx={9} cy={8.4} r={3.1} fill={c} />
            <Path d="M3.7 19.4c0-3 2.4-5 5.3-5s5.3 2 5.3 5z" fill={c} />
          </>
        ) : (
          <>
            <Circle cx={16.6} cy={7.2} r={2.5} stroke={c} strokeWidth={1.9} />
            <Path d="M15.2 14.6c2.7-.2 5 1.9 5.1 4.6" stroke={c} strokeWidth={1.9} strokeLinecap="round" />
            <Circle cx={9} cy={8.4} r={3.1} stroke={c} strokeWidth={1.9} />
            <Path d="M3.7 19.4c0-3 2.4-5 5.3-5s5.3 2 5.3 5" stroke={c} strokeWidth={1.9} strokeLinecap="round" />
          </>
        )}
      </Svg>
    </IconShell>
  );
}

function ProfileIcon({ color, focused }: IconProps) {
  const c = String(color);
  return (
    <IconShell focused={focused}>
      <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
        {focused ? (
          <>
            <Circle cx={12} cy={12} r={9.3} fill={c} />
            <Circle cx={12} cy={9.6} r={2.9} fill={'#ffffff'} />
            <Path d="M6.8 18.9c0-2.9 2.3-4.8 5.2-4.8s5.2 1.9 5.2 4.8z" fill={'#ffffff'} />
          </>
        ) : (
          <>
            <Circle cx={12} cy={12} r={9.3} stroke={c} strokeWidth={1.9} />
            <Circle cx={12} cy={9.6} r={2.9} stroke={c} strokeWidth={1.9} />
            <Path d="M6.8 18.9c0-2.9 2.3-4.8 5.2-4.8s5.2 1.9 5.2 4.8" stroke={c} strokeWidth={1.9} strokeLinecap="round" />
          </>
        )}
      </Svg>
    </IconShell>
  );
}

type FabAction = {
  label: string;
  emoji: string;
  onPress: () => void;
};

/**
 * Flexed-arm glyph — crisp white silhouette for the green FAB.
 * Reads as “muscle / start training” at 28dp without emoji noise.
 */
function MuscleIcon({ size = 26, color = '#ffffff' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Shoulder → bicep bulge → upper arm */}
      <Path
        d="M8.8 6.2c1-.9 2.4-1.4 3.8-1.2 1 .1 1.9.7 2.5 1.5.5-.4 1.2-.6 1.9-.6 1.8 0 3.2 1.5 3.2 3.3 0 .6-.2 1.2-.5 1.7 1.1.8 1.8 2.1 1.8 3.6 0 2-1.3 3.7-3.1 4.3v1.4c0 .8-.6 1.4-1.4 1.4h-1.4c-.8 0-1.4-.6-1.4-1.4v-.6c-.5.2-1.1.3-1.7.3-1.6 0-3-.7-3.9-1.8-.6.8-1.6 1.3-2.7 1.3-1.9 0-3.4-1.5-3.4-3.4 0-1.3.7-2.4 1.8-3-.2-.5-.3-1-.3-1.6 0-1.9 1.4-3.4 3.2-3.6.1-.4.3-.8.6-1.1z"
        fill={color}
      />
      {/* Inner bicep cut for depth */}
      <Path
        d="M10.2 9.5c.5-.8 1.4-1.2 2.4-1.2.5 0 1 .1 1.4.4-.1.4-.2.8-.2 1.2 0 1 .4 1.8 1.1 2.4-.7.6-1.6 1-2.6 1-1 0-1.9-.5-2.5-1.3.2-.8.3-1.6.4-2.5z"
        fill="#15803d"
        opacity={0.35}
      />
    </Svg>
  );
}

/**
 * The FAB's flex mark — the illustrated `fabicon` asset.
 *
 * Falling back to the vector `MuscleIcon` if the asset ever fails to resolve
 * keeps a broken or renamed file from leaving an empty FAB.
 */
const FLEX_ASSET = require('../../assets/fabicon.png') as number;
const FLEX_ASSET_META = RNImage.resolveAssetSource(FLEX_ASSET);
const FLEX_ASSET_IS_REAL =
  (FLEX_ASSET_META?.width ?? 0) > 8 && (FLEX_ASSET_META?.height ?? 0) > 8;

/**
 * How large the artwork is drawn, relative to the circle's diameter.
 *
 * `contentFit="contain"` fits the *whole canvas* into this box, and the mark
 * sits inside a large transparent margin, so drawing it at exactly the circle
 * size would render it far smaller than the circle implies.
 *
 * This has to be tuned to the artwork and cannot be derived at runtime:
 * `resolveAssetSource` reports the canvas (1024²), not the opaque content, and
 * both the old and current marks share that canvas while differing in shape.
 * Measured for the current duo mark, whose content is 866×560 (1.55:1
 * landscape, 85% of the canvas width). At 1.3 it rendered ~64pt wide inside a
 * 58pt circle and the round clip cut both outer arms off; 0.9 was the safe
 * correction but overshot, leaving the mark ~44pt in a 58pt circle with a ring
 * of dead space around it — small enough to read as an icon that failed to
 * load rather than the primary action.
 *
 * 1.08 splits the difference: the 1.55:1 mark lands ~52pt wide, filling the
 * circle without the arms reaching the clip.
 *
 * If the artwork is swapped again, re-measure: a near-square mark can take a
 * larger value, a wide one cannot.
 */
const FLEX_ART_INSET_SCALE = 1.08;

function FlexMark({ size }: { size: number }) {
  if (!FLEX_ASSET_IS_REAL) {
    // Vector fallback sits on a light disc now, so it needs the brand green
    // rather than the white it used against the old green circle.
    return <MuscleIcon size={size - 6} color="#16a34a" />;
  }
  const drawn = size * FLEX_ART_INSET_SCALE;
  return (
    <Image
      source={FLEX_ASSET}
      style={{ width: drawn, height: drawn }}
      contentFit="contain"
      accessibilityLabel="Start workout"
    />
  );
}

/**
 * Train FAB — entrance bounce → glow → idle breathing.
 * Press expands a speed-dial (Push-ups / Squats / Sit-Ups / Custom) instead of
 * jumping straight to Train.
 */
function TrainFab({ bottomPosition }: { bottomPosition: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const focused = pathname === '/train';
  const isPro = useIsPro();
  const [open, setOpen] = useState(false);

  const entered = useSharedValue(0);
  const breathe = useSharedValue(1);
  const glow = useSharedValue(0.35);
  const focusScale = useSharedValue(1);
  const spin = useSharedValue(0);

  useEffect(() => {
    entered.value = withDelay(
      350,
      withSequence(
        withSpring(1.14, { damping: 9, stiffness: 210 }),
        withSpring(1, { damping: 12, stiffness: 200 }),
      ),
    );
    glow.value = withDelay(
      900,
      withSequence(
        withTiming(0.7, { duration: 420 }),
        withTiming(0.4, { duration: 500 }),
      ),
    );
    breathe.value = withDelay(
      1400,
      withRepeat(
        withSequence(
          withTiming(1.05, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
          withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      ),
    );
    glow.value = withDelay(
      1400,
      withRepeat(
        withSequence(
          withTiming(0.55, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.32, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      ),
    );
  }, [breathe, entered, glow]);

  useEffect(() => {
    focusScale.value = withSpring(focused ? 1.08 : 1, { damping: 14, stiffness: 240 });
  }, [focused, focusScale]);

  useEffect(() => {
    spin.value = withSpring(open ? 1 : 0, { damping: 14, stiffness: 220 });
  }, [open, spin]);

  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: entered.value * breathe.value * focusScale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    shadowOpacity: glow.value,
  }));

  const iconSpin = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(spin.value, [0, 1], [0, 45])}deg` }],
  }));

  const actions: FabAction[] = [
    {
      label: 'Push-ups',
      emoji: '💪',
      onPress: () => router.push({ pathname: '/session', params: { exercise: 'push', mode: 'practice' } }),
    },
    {
      label: 'Squats',
      emoji: '🦵',
      onPress: () => router.push({ pathname: '/session', params: { exercise: 'squat', mode: 'practice' } }),
    },
    {
      label: 'Sit-Ups',
      emoji: '🧘',
      onPress: () => {
        if (!canStartExercise(isPro, 'situp')) {
          router.push({ pathname: '/modal/paywall', params: { source: 'exercise-library' } });
          return;
        }
        router.push({ pathname: '/session', params: { exercise: 'situp', mode: 'practice' } });
      },
    },
    {
      label: 'Custom Workout',
      emoji: '🏋️',
      onPress: () => router.navigate('/train'),
    },
  ];

  const close = () => setOpen(false);

  return (
    <>
      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.fabScrim} onPress={close}>
          <View
            style={[styles.fabMenu, { bottom: bottomPosition + 70 }]}
            pointerEvents="box-none"
          >
            {actions.map((action, i) => (
              <Animated.View
                key={action.label}
                style={{
                  transform: [{ translateY: 0 }],
                  marginBottom: 8,
                }}
              >
                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={() => {
                    selectionHaptic();
                    close();
                    action.onPress();
                  }}
                  style={[styles.fabMenuItem, { opacity: 1 - i * 0.02 }]}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                >
                  <Text style={font('semibold', 15, { color: palette.ink, flex: 1 })}>{action.label}</Text>
                  <View style={styles.fabMenuEmoji}>
                    <Text style={{ fontSize: 18 }}>{action.emoji}</Text>
                  </View>
                </TouchableOpacity>
              </Animated.View>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Animated.View style={[styles.fabContainer, { bottom: bottomPosition }, scaleStyle]}>
        <Animated.View style={glowStyle}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => {
              selectionHaptic();
              setOpen((v) => !v);
            }}
            accessibilityRole="button"
            accessibilityLabel={open ? 'Close workout menu' : 'Start workout'}
            style={styles.fabButton}
          >
            {/* Closed: a light disc so the full-colour flex mark reads at its
                own colours — orange-on-green fought itself and looked like a
                sticker. The brand green stays in the glow ring, the border and
                the open state, so the FAB still reads as *the* green action.
                Open: flips to the green gradient, where a white × belongs. */}
            <LinearGradient
              colors={open ? ['#4ade80', '#15803d'] : ['#ffffff', '#f1f6f2']}
              start={{ x: 0.15, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={[styles.fabCircle, !open && styles.fabCircleClosed]}
            >
              <Animated.View style={iconSpin}>
                {open ? (
                  <Text style={font('bold', 26, { color: '#fff', lineHeight: 28 })}>×</Text>
                ) : (
                  <FlexMark size={34} />
                )}
              </Animated.View>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </>
  );
}

export default function TabsLayout() {
  const onboarded = useProfileStore((s) => s.onboarded);
  const insets = useSafeAreaInsets();

  if (!onboarded) return <Redirect href="/onboarding" />;

  const tabBarHeight = 60 + Math.max(insets.bottom, 16);

  return (
    <View style={StyleSheet.absoluteFill}>
      <Tabs
        screenListeners={{
          tabPress: () => {
            selectionHaptic();
          },
        }}
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#16a34a',
          tabBarInactiveTintColor: '#475569',
          tabBarStyle: [
            styles.tabBar,
            {
              height: tabBarHeight,
              paddingBottom: Math.max(insets.bottom, 10),
            },
          ],
          tabBarLabelStyle: styles.tabLabel,
          tabBarItemStyle: styles.tabItem,
          tabBarBackground: () =>
            Platform.OS === 'ios' ? (
              <BlurView intensity={92} tint="light" style={StyleSheet.absoluteFill} />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.97)' }]} />
            ),
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: HomeIcon }} />
        <Tabs.Screen name="arena" options={{ title: 'Arena', tabBarIcon: ArenaIcon }} />
        <Tabs.Screen name="friends" options={{ title: 'Friends', tabBarIcon: FriendsIcon }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ProfileIcon }} />
        <Tabs.Screen
          name="train"
          options={{
            title: 'Train',
            href: null,
          }}
        />
      </Tabs>
      <TrainFab bottomPosition={tabBarHeight + 10} />
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 0,
    backgroundColor: Platform.OS === 'android' ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.82)',
    borderTopWidth: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
    borderRadius: 28,
    marginBottom: 4,
    elevation: 8,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    paddingTop: 8,
  },
  tabItem: {
    paddingVertical: 4,
  },
  tabLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    letterSpacing: -0.1,
    marginTop: 4,
  },
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 30,
    width: 36,
  },
  iconFocused: {
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 3,
  },
  fabContainer: {
    position: 'absolute',
    right: 18,
    alignItems: 'flex-end',
    zIndex: 999,
    elevation: 10,
  },
  fabButton: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#ffffff',
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 10,
    // The flex art is drawn larger than the icon box to defeat its built-in
    // padding, so clip it to the circle rather than let it bleed past the rim.
    overflow: 'hidden',
  },
  /* Closed state is a light disc, so a white rim would vanish — the brand
     green moves to the border to keep the FAB reading as the primary action. */
  fabCircleClosed: {
    borderColor: '#16a34a',
    borderWidth: 2.5,
  },
  fabScrim: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.28)',
  },
  fabMenu: {
    position: 'absolute',
    right: 18,
    alignItems: 'flex-end',
  },
  fabMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 200,
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  fabMenuEmoji: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#f0fdf4',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

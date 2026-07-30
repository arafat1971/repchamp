import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, Tabs, usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform, StyleSheet, TouchableOpacity, View, type ColorValue } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { useProfileStore } from '@/state/profileStore';
import { fontFamily } from '@/theme/typography';
import { selectionHaptic } from '@/lib/feedback';

/** Matches the shape React Navigation passes to `tabBarIcon`. */
type IconProps = { color: ColorValue; focused: boolean; size: number };

/**
 * Tab icons follow Apple's HIG: SF Symbols-style glyphs that stay a constant
 * size and simply swap from an outline to a solid (`.fill`) variant in the tint
 * colour when selected — no scale/lift bounce and no Material "active dot",
 * both of which are Android patterns. React Navigation supplies the tint via
 * `tabBarActiveTintColor` / `tabBarInactiveTintColor`, so each icon just draws
 * outline vs. filled based on `focused` and paints in `color`.
 */
function IconShell({ children }: { children: React.ReactNode }) {
  return <View style={styles.iconWrapper}>{children}</View>;
}

function HomeIcon({ color, focused }: IconProps) {
  const c = String(color);
  return (
    <IconShell>
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
    <IconShell>
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
    <IconShell>
      <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
        {focused ? (
          <>
            {/* back person */}
            <Circle cx={16.6} cy={7.2} r={2.5} fill={c} />
            <Path d="M13.8 19.2c0-2.9 2.2-4.9 4.9-4.9s4.9 2 4.9 4.9z" fill={c} />
            {/* front person */}
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
    <IconShell>
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

/**
 * Floating Train FAB — 58dp circular Material-style action, sits just above
 * the tab bar so it no longer covers Quick Start tiles.
 */
function TrainFab({ bottomPosition }: { bottomPosition: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const focused = pathname === '/train';
  const entered = useSharedValue(0);
  const focusScale = useSharedValue(1);

  useEffect(() => {
    entered.value = withDelay(
      400,
      withSequence(
        withSpring(1.12, { damping: 10, stiffness: 220 }),
        withSpring(1, { damping: 12, stiffness: 200 }),
      ),
    );
  }, [entered]);

  useEffect(() => {
    focusScale.value = withSpring(focused ? 1.08 : 1, { damping: 14, stiffness: 240 });
  }, [focused, focusScale]);

  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: entered.value * focusScale.value }],
  }));

  return (
    <Animated.View style={[styles.fabContainer, { bottom: bottomPosition }, scaleStyle]}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => {
          selectionHaptic();
          router.navigate('/train');
        }}
        accessibilityRole="button"
        accessibilityLabel="Start workout"
        style={styles.fabButton}
      >
        <LinearGradient
          colors={['#34d399', '#16a34a']}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.fabCircle}
        >
          <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
            <Path
              d="M7.2 9.2c-1.6 0-2.9 1.2-2.9 2.8s1.3 2.8 2.9 2.8h1.1V9.2H7.2zm8.5 0h-1.1v5.6h1.1c1.6 0 2.9-1.2 2.9-2.8s-1.3-2.8-2.9-2.8z"
              fill="#ffffff"
            />
            <Path
              d="M8.3 10.4h7.4v3.2H8.3z"
              fill="#ffffff"
              opacity={0.95}
            />
            <Path
              d="M4.1 10.6H2.8c-.5 0-.9.4-.9.9v.9c0 .5.4.9.9.9h1.3"
              stroke="#ffffff"
              strokeWidth={1.6}
              strokeLinecap="round"
            />
            <Path
              d="M19.9 10.6h1.3c.5 0 .9.4.9.9v.9c0 .5-.4.9-.9.9h-1.3"
              stroke="#ffffff"
              strokeWidth={1.6}
              strokeLinecap="round"
            />
          </Svg>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
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
          tabBarBackground: () => (
            <BlurView
              intensity={92}
              tint="light"
              style={StyleSheet.absoluteFill}
            />
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
  /**
   * Floating glass tab bar — sits above the content with a blur backdrop,
   * subtle border, and elevated shadow for a premium floating feel.
   */
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
    paddingVertical: 2,
  },
  tabLabel: {
    fontFamily: fontFamily.extrabold,
    fontSize: 10,
    letterSpacing: -0.1,
    marginTop: 1,
  },
  /** Centers the icon within the tab item (iOS keeps a constant-size glyph). */
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 30,
  },
  fabContainer: {
    position: 'absolute',
    alignSelf: 'center',
    left: 0,
    right: 0,
    alignItems: 'center',
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
  },
});

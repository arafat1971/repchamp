import { BlurView } from 'expo-blur';
import { Redirect, Tabs, usePathname, useRouter } from 'expo-router';
import { Image, Platform, StyleSheet, TouchableOpacity, View, type ColorValue } from 'react-native';
import Animated, { useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { useProfileStore } from '@/state/profileStore';
import { fontFamily } from '@/theme/typography';
import { selectionHaptic } from '@/lib/feedback';

const IC_TRAIN = require('../../assets/ic-train.png');

/** Matches the shape React Navigation passes to `tabBarIcon`. */
type IconProps = { color: ColorValue; focused: boolean; size: number };

/**
 * Tab icons are inline SVG paths lifted from the prototype rather than an icon
 * font, so the stroke weight and corner radii match the design exactly.
 *
 * Upgraded: icons now scale + lift with spring physics, and show an active
 * indicator dot underneath when focused.
 */
function AnimatedIcon({ focused, children }: { focused: boolean; children: React.ReactNode }) {
  const style = useAnimatedStyle(
    () => ({
      transform: [
        { scale: withSpring(focused ? 1.18 : 1, { damping: 14, stiffness: 240 }) },
        { translateY: withSpring(focused ? -2 : 0, { damping: 14, stiffness: 240 }) },
      ],
    }),
    [focused],
  );
  const dotStyle = useAnimatedStyle(
    () => ({
      opacity: withTiming(focused ? 1 : 0, { duration: 200 }),
      transform: [{ scale: withSpring(focused ? 1 : 0.5, { damping: 14, stiffness: 240 }) }],
    }),
    [focused],
  );
  return (
    <View style={styles.iconWrapper}>
      <Animated.View style={style}>{children}</Animated.View>
      <Animated.View style={[styles.activeDot, dotStyle]} />
    </View>
  );
}

function HomeIcon({ color, focused }: IconProps) {
  const activeColor = String(color);
  return (
    <AnimatedIcon focused={focused}>
      <Svg width={25} height={25} viewBox="0 0 24 24" fill="none">
        {focused ? (
          <>
            <Path
              d="M12 2.5L2.5 10A1 1 0 0 0 3 11.5H4.5V20A1.5 1.5 0 0 0 6 21.5H18A1.5 1.5 0 0 0 19.5 20V11.5H21A1 1 0 0 0 21.5 10L12 2.5Z"
              fill={activeColor}
              fillOpacity={0.2}
            />
            <Path
              d="M3 10.5L12 3L21 10.5M5 9.5V20C5 20.5523 5.44772 21 6 21H18C18.5523 21 19 20.5523 19 20V9.5"
              stroke={activeColor}
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Path
              d="M10 21V14C10 13.4477 10.4477 13 11 13H13C13.5523 13 14 13.4477 14 14V21"
              stroke={activeColor}
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill={activeColor}
            />
          </>
        ) : (
          <Path
            d="M3 10.5L12 3L21 10.5M5 9.5V20C5 20.5523 5.44772 21 6 21H18C18.5523 21 19 20.5523 19 20V9.5"
            stroke={String(color)}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </Svg>
    </AnimatedIcon>
  );
}

function ArenaIcon({ color, focused }: IconProps) {
  const activeColor = String(color);
  return (
    <AnimatedIcon focused={focused}>
      <Svg width={25} height={25} viewBox="0 0 24 24" fill="none">
        {focused ? (
          <>
            <Path
              d="M6 9V4H18V9C18 12.3137 15.3137 15 12 15C8.68629 15 6 12.3137 6 9Z"
              fill={activeColor}
              fillOpacity={0.25}
            />
            <Path
              d="M6 9V4H18V9C18 12.3137 15.3137 15 12 15C8.68629 15 6 12.3137 6 9Z"
              stroke={activeColor}
              strokeWidth={2.3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Path
              d="M4 5H2.5C1.67157 5 1 5.67157 1 6.5V7C1 8.65685 2.34315 10 4 10H6M20 5H21.5C22.3284 5 23 5.67157 23 6.5V7C23 8.65685 21.6569 10 20 10H18M9 20H15M12 15V20"
              stroke={activeColor}
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        ) : (
          <Path
            d="M6 9V4H18V9C18 12.3137 15.3137 15 12 15C8.68629 15 6 12.3137 6 9ZM4 5H2.5C1.67157 5 1 5.67157 1 6.5V7C1 8.65685 2.34315 10 4 10H6M20 5H21.5C22.3284 5 23 5.67157 23 6.5V7C23 8.65685 21.6569 10 20 10H18M9 20H15M12 15V20"
            stroke={String(color)}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </Svg>
    </AnimatedIcon>
  );
}

function FriendsIcon({ color, focused }: IconProps) {
  const activeColor = String(color);
  return (
    <AnimatedIcon focused={focused}>
      <Svg width={25} height={25} viewBox="0 0 24 24" fill="none">
        {focused ? (
          <>
            <Circle cx={9} cy={8} r={3.5} fill={activeColor} fillOpacity={0.25} stroke={activeColor} strokeWidth={2.2} />
            <Path
              d="M3 20C3 16.7 5.7 14.5 9 14.5C12.3 14.5 15 16.7 15 20"
              stroke={activeColor}
              strokeWidth={2.3}
              strokeLinecap="round"
            />
            <Path
              d="M16 5.5C17.4 6.2 18.2 7.7 18.2 9.3C18.2 10.9 17.4 12.4 16 13.1M18.5 20C19.8 19 20.8 17.5 20.8 15.5C20.8 13.5 19.3 12 17.5 11.5"
              stroke={activeColor}
              strokeWidth={2.1}
              strokeLinecap="round"
            />
          </>
        ) : (
          <>
            <Circle cx={9} cy={8} r={3.2} stroke={String(color)} strokeWidth={2.2} />
            <Path d="M3 20C3 16.7 5.7 14.5 9 14.5C12.3 14.5 15 16.7 15 20" stroke={String(color)} strokeWidth={2.2} strokeLinecap="round" />
            <Path d="M16 5.5C17.4 6.2 18.2 7.7 18.2 9.3C18.2 10.9 17.4 12.4 16 13.1M18.5 20C19.8 19 20.8 17.5 20.8 15.5C20.8 13.5 19.3 12 17.5 11.5" stroke={String(color)} strokeWidth={2.0} strokeLinecap="round" />
          </>
        )}
      </Svg>
    </AnimatedIcon>
  );
}

function ProfileIcon({ color, focused }: IconProps) {
  const activeColor = String(color);
  return (
    <AnimatedIcon focused={focused}>
      <Svg width={25} height={25} viewBox="0 0 24 24" fill="none">
        {focused ? (
          <>
            <Circle cx={12} cy={8} r={3.8} fill={activeColor} fillOpacity={0.25} stroke={activeColor} strokeWidth={2.3} />
            <Path
              d="M4.5 20.2C4.5 16.2 7.9 14 12 14C16.1 14 19.5 16.2 19.5 20.2"
              stroke={activeColor}
              strokeWidth={2.4}
              strokeLinecap="round"
            />
          </>
        ) : (
          <>
            <Circle cx={12} cy={8} r={3.6} stroke={String(color)} strokeWidth={2.2} />
            <Path d="M4.5 20C4.5 16.2 7.9 14 12 14C16.1 14 19.5 16.2 19.5 20" stroke={String(color)} strokeWidth={2.2} strokeLinecap="round" />
          </>
        )}
      </Svg>
    </AnimatedIcon>
  );
}

/**
 * Floating Train FAB — the primary action button that hovers above the tab bar.
 * Premium design with gradient glow, spring bounce, and a soft green squircle.
 */
function TrainFab({ bottomPosition }: { bottomPosition: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const focused = pathname === '/train';

  const scaleStyle = useAnimatedStyle(
    () => ({
      transform: [
        { scale: withSpring(focused ? 1.14 : 1, { damping: 14, stiffness: 240 }) },
        { translateY: withSpring(focused ? -3 : 0, { damping: 14, stiffness: 240 }) },
      ],
    }),
    [focused],
  );

  return (
    <Animated.View style={[styles.fabContainer, { bottom: bottomPosition }, scaleStyle]}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => {
          selectionHaptic();
          router.navigate('/train');
        }}
        style={styles.fabButton}
      >
        <View style={styles.fabBacking} />
        <Image source={IC_TRAIN} style={styles.fabImage} resizeMode="contain" />
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
          tabBarInactiveTintColor: '#94a3b8',
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
      <TrainFab bottomPosition={Math.max(insets.bottom, 16) + 120} />
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
  /** Wrapper to center the icon and position the active dot below it. */
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
  },
  /** Small green dot that appears under the active tab icon. */
  activeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#16a34a',
    marginTop: 3,
    position: 'absolute',
    bottom: -2,
  },
  fabContainer: {
    position: 'absolute',
    right: 20,
    zIndex: 999,
    elevation: 10,
  },
  fabButton: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /**
   * Soft green squircle backing with brand shadow glow —
   * gives the FAB a premium, elevated feel that's consistent with the brand.
   */
  fabBacking: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: '#eafaf0',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 8,
  },
  fabImage: {
    width: 86,
    height: 86,
    transform: [{ translateX: -10 }, { translateY: 1 }, { rotate: '25deg' }],
  },
});

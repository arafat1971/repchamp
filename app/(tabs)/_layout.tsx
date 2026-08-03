import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, Tabs, usePathname, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
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
import { useIncomingDuelCount } from '@/state/useIncomingDuelCount';
import { buildFabModel } from '@/domain/fabActions';
import {
  markFabHintShown,
  markFabHintUsed,
  parseFabHint,
  shouldShowFabHint,
} from '@/domain/fabHint';
import { dayKey } from '@/domain/progression';
import type { ExerciseId } from '@/vision/exercises';
import { useIsPro } from '@/state/proStore';
import { canStartExercise } from '@/domain/pro';
import { font, fontFamily } from '@/theme/typography';
import { palette } from '@/theme/tokens';
import { selectionHaptic } from '@/lib/feedback';
import { storage } from '@/lib/storage';

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
  /** Not on this athlete's plan — say so before they tap into a paywall. */
  locked?: boolean;
  /** Already trained today; still offered, just not the obvious next pick. */
  doneToday?: boolean;
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
const FLEX_ART_INSET_SCALE = 1.48;

/** Movements the FAB offers, in authored order — the ranking reorders them. */
const FAB_EXERCISES: readonly ExerciseId[] = ['push', 'squat', 'situp'];
/** Mirrors app/(tabs)/index.tsx and app/modal/daily.tsx. */
const FAB_DAILY_EXERCISE: ExerciseId = 'push';
const FAB_DAILY_TARGET = 25;
/** Where the "Hold for more" teaching state lives. See `@/domain/fabHint`. */
const FAB_HINT_KEY = 'fab.hint.v1';
/** Clears the 58pt FAB disc plus its border and a little breathing room. */
const FAB_HINT_OFFSET = 68;

function FlexMark({ size }: { size: number }) {
  if (!FLEX_ASSET_IS_REAL) {
    // Back to white: the disc is dark again, and the 600-weight green this
    // used against the light disc would nearly disappear on it.
    return <MuscleIcon size={size - 6} color="#ffffff" />;
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

  /* Read straight from MMKV in the initialiser rather than in an effect: the
     read is synchronous, so the first frame already knows whether to show the
     pill and it never flashes in on an athlete who has retired it.

     Only `used` needs to be state — it hides the pill mid-session, so it has
     to re-render. The impression count is decided once per mount and never
     read again this session, so writing it through state would only trigger a
     cascading render for a value nothing rerenders on. */
  const [hintVisible, setHintVisible] = useState(() =>
    shouldShowFabHint(parseFabHint(storage.getString(FAB_HINT_KEY))),
  );
  const showHint = !open && hintVisible;

  /* Count this launch's impression once, not on every re-render of the tab
     bar — the layout re-renders on navigation, which would burn the whole
     allowance in a single session. */
  useEffect(() => {
    if (!hintVisible) return;
    const stored = parseFabHint(storage.getString(FAB_HINT_KEY));
    storage.set(FAB_HINT_KEY, JSON.stringify(markFabHintShown(stored)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount
  }, []);

  const sessions = useProfileStore((st) => st.sessions);
  const pendingDuels = useIncomingDuelCount();
  const today = dayKey();
  const dailyBest = sessions
    .filter((x) => x.day === today && x.exercise === FAB_DAILY_EXERCISE)
    .reduce((best, x) => Math.max(best, x.reps), 0);

  const fab = useMemo(
    () =>
      buildFabModel({
        sessions,
        today,
        isPro,
        candidates: FAB_EXERCISES,
        pendingDuels,
        daily: { exercise: FAB_DAILY_EXERCISE, done: dailyBest >= FAB_DAILY_TARGET },
      }),
    [sessions, today, isPro, pendingDuels, dailyBest],
  );

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

  /** Labels and glyphs for the movements the FAB can start. */
  const META: Record<string, { label: string; emoji: string }> = {
    push: { label: 'Push-ups', emoji: '💪' },
    squat: { label: 'Squats', emoji: '🦵' },
    situp: { label: 'Sit-Ups', emoji: '🧘' },
  };

  const startExercise = (exercise: ExerciseId) => {
    if (!canStartExercise(isPro, exercise)) {
      router.push({ pathname: '/modal/paywall', params: { source: 'exercise-library' } });
      return;
    }
    router.push({ pathname: '/session', params: { exercise, mode: 'practice' } });
  };

  // Built from the ranked model rather than hardcoded, so the order follows
  // what the athlete actually trains and locked rows say so up front.
  const actions: FabAction[] = [
    ...fab.order.map((row) => {
      const meta = META[row.exercise] ?? { label: row.exercise, emoji: '🏃' };
      return {
        label: meta.label,
        emoji: meta.emoji,
        locked: row.locked,
        doneToday: row.doneToday,
        onPress: () => startExercise(row.exercise),
      };
    }),
    {
      label: 'Custom Workout',
      emoji: '🏋️',
      onPress: () => router.navigate('/train'),
    },
  ];

  /**
   * One tap runs the obvious thing when there is one; otherwise it opens the
   * menu, which is still the default. Long-press always opens the menu, so the
   * full list is never more than a hold away even when the shortcut fires.
   */
  /* Every route into the menu goes through here, so discovering it retires the
     hint whichever way the athlete got in — hold, accessibility action, or a
     tap with no primary action to shortcut to. Callers own the haptic, since
     onFabPress has already fired one by the time it reaches here. */
  const openMenu = () => {
    const stored = parseFabHint(storage.getString(FAB_HINT_KEY));
    storage.set(FAB_HINT_KEY, JSON.stringify(markFabHintUsed(stored)));
    setHintVisible(false);
    setOpen(true);
  };

  const onFabPress = () => {
    selectionHaptic();
    if (open) {
      setOpen(false);
      return;
    }
    const p = fab.primary;
    if (!p) {
      openMenu();
      return;
    }
    if (p.kind === 'duel') router.push('/(tabs)/friends');
    else if (p.kind === 'daily') router.push('/modal/daily');
    else startExercise(p.exercise);
  };

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
                  <Text
                    numberOfLines={1}
                    style={font('semibold', 15, {
                      color: action.locked ? palette.grey500 : palette.ink,
                      flex: 1,
                    })}
                  >
                    {action.label}
                  </Text>
                  {action.doneToday ? (
                    <Text style={font('bold', 11, { color: palette.green600, marginRight: 8 })}>
                      ✓ today
                    </Text>
                  ) : null}
                  <View style={styles.fabMenuEmoji}>
                    <Text style={{ fontSize: 18 }}>{action.locked ? '🔒' : action.emoji}</Text>
                  </View>
                </TouchableOpacity>
              </Animated.View>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Teaching pill for the hold gesture. Decorative to assistive tech —
          the same information reaches those athletes through the FAB's
          accessibilityHint, and announcing it twice is worse than once. */}
      {showHint ? (
        <View
          style={[styles.fabHint, { bottom: bottomPosition + FAB_HINT_OFFSET }]}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text style={font('semibold', 12, { color: '#ffffff' })}>Hold for more</Text>
        </View>
      ) : null}

      <Animated.View style={[styles.fabContainer, { bottom: bottomPosition }, scaleStyle]}>
        <Animated.View style={glowStyle}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onFabPress}
            onLongPress={() => {
              selectionHaptic();
              openMenu();
            }}
            delayLongPress={280}
            accessibilityRole="button"
            accessibilityLabel={open ? 'Close workout menu' : 'Start workout'}
            /* The menu is reachable only by holding, and a hold is not a
               gesture a screen reader can produce — without the hint and the
               explicit action below, every action but the primary one is
               unreachable with TalkBack or VoiceOver on. */
            accessibilityHint={
              open ? undefined : 'Double tap to start. Touch and hold for all workout options.'
            }
            accessibilityActions={
              open ? undefined : [{ name: 'longpress', label: 'Show all workout options' }]
            }
            onAccessibilityAction={(e) => {
              if (e.nativeEvent.actionName === 'longpress') openMenu();
            }}
            style={styles.fabButton}
          >
            {/* Closed: a near-black disc. The full-colour flex mark keeps its
                own colours against it, and black separates the button from the
                pale tab bar far more sharply than the light disc did — the FAB
                is the primary action and should not blend into its own bar.
                Not pure #000: a hair of lift keeps the gradient readable and
                stops it looking like a hole punched in the UI.
                Open: flips to the green gradient, where a white × belongs. */}
            <LinearGradient
              colors={open ? ['#4ade80', '#15803d'] : ['#1C2320', '#0C110F']}
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
            {/* Count of things waiting — a duel invite, an unclaimed daily.
                Hidden while the menu is open, where it would sit over the ×. */}
            {fab.badgeCount > 0 && !open ? (
              <View style={styles.fabBadge} pointerEvents="none">
                <Text style={font('extrabold', 10.5, { color: '#ffffff' })}>
                  {fab.badgeCount > 9 ? '9+' : fab.badgeCount}
                </Text>
              </View>
            ) : null}
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
      {/* +25 rather than +10 — lifts the FAB 15pt clear of the tab bar so it
          reads as floating above it rather than sitting on its edge. */}
      <TrainFab bottomPosition={tabBarHeight + 25} />
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
  fabHint: {
    position: 'absolute',
    // Right-aligned to the FAB's own inset so the pill sits over the button
    // rather than drifting toward the middle of the tab bar.
    right: 23,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    // The same near-black as the closed FAB, so the pill reads as part of the
    // button rather than as a notification from somewhere else.
    backgroundColor: '#1C2320',
    zIndex: 999,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  fabContainer: {
    position: 'absolute',
    // 23, not 18: nudged 5pt further in from the right edge so the disc clears
    // the rounded corner of the tab bar behind it.
    right: 23,
    alignItems: 'flex-end',
    zIndex: 999,
    elevation: 10,
  },
  fabBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: palette.red500,
    alignItems: 'center',
    justifyContent: 'center',
    // Rides on the disc, so it needs the same rim treatment to read as a badge
    // rather than a stray dot overlapping the button.
    borderWidth: 2,
    borderColor: palette.canvas,
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
  /* Closed state is a dark disc: the brand green rim now has real contrast to
     sit against, so it reads as a deliberate ring rather than an outline. */
  fabCircleClosed: {
    borderColor: '#22c55e',
    borderWidth: 2.5,
  },
  fabScrim: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.28)',
  },
  fabMenu: {
    position: 'absolute',
    // Matches fabContainer's right inset — the menu is anchored to the button,
    // so the two must move together or the sheet sits 5pt off the disc.
    right: 23,
    alignItems: 'flex-end',
  },
  fabMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    // 236, not 200: the row gained a "✓ today" tag, and at the old width the
    // label lost its flex fight with it and wrapped mid-word ("Push-u / ps").
    minWidth: 236,
    backgroundColor: palette.white,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  fabMenuEmoji: {
    width: 36,
    height: 36,
    borderRadius: 12,
    // Sits inside the FAB menu sheet, which is now a dark surface — the pale
    // green tile it used to be glowed against it.
    backgroundColor: palette.tintGreenTop,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

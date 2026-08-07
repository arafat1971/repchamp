import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, Tabs, usePathname, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
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

import { ExerciseGlyph } from '@/components/ExerciseGlyph';
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
  /* The movement this row starts, so it can be drawn with the same glyph the
     exercise tiles use. Absent on rows that are not a single movement — the
     custom-workout row falls back to its emoji. */
  exercise?: ExerciseId;
  emoji: string;
  onPress: () => void;
  /** Not on this athlete's plan — say so before they tap into a paywall. */
  locked?: boolean;
  /** Already trained today; still offered, just not the obvious next pick. */
  doneToday?: boolean;
  /** The "build your own" row — drawn as a dumbbell rather than a movement. */
  custom?: boolean;
};



/** Movements the FAB offers, in authored order — the ranking reorders them. */
const FAB_EXERCISES: readonly ExerciseId[] = ['push', 'squat', 'situp'];
/** Mirrors app/(tabs)/index.tsx and app/modal/daily.tsx. */
const FAB_DAILY_EXERCISE: ExerciseId = 'push';
const FAB_DAILY_TARGET = 25;
/** Where the "Hold for more" teaching state lives. See `@/domain/fabHint`. */
const FAB_HINT_KEY = 'fab.hint.v1';
/**
 * How far above `bottomPosition` the hint pill sits.
 *
 * The disc is 56pt. 68 cleared it arithmetically but not visually: the pill is
 * wider than the disc, and since it is right-aligned to the same inset, the
 * extra width grows leftward across whatever card is behind it. Seen on device
 * it read as a label stuck to the Squats tile rather than a hint about the
 * button. Lifting it clear puts the gap where the eye expects one.
 */
const FAB_HINT_OFFSET = 78;
/** The FAB disc. 56 flat — the 3pt rim it used to carry is gone. */
const FAB_DIAMETER = 56;
/**
 * Fixed so the pill can be centred on the disc without measuring text.
 *
 * 110 rather than wider: centring pushes half the overhang right, and at 128
 * that put the pill 9pt off the screen edge, clipping the "e" in "more".
 */
const HINT_WIDTH = 110;

/**
 * The closed-state mark: a plus, drawn rather than typeset.
 *
 * A `+` glyph would inherit the font's own proportions and optical centring,
 * which never quite agree with a circle. Two rounded strokes are exactly
 * centred and take the same 3pt weight as `ExerciseGlyph`, so the FAB belongs
 * to the same drawing as the tiles it sits above.
 */
/** A padlock for a Pro-gated row, at the same weight as the movement glyphs. */
function LockMark({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M7 11 L7 7.5 A5 5 0 0 1 17 7.5 L17 11"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M5.5 11 h13 a1.5 1.5 0 0 1 1.5 1.5 v6 a1.5 1.5 0 0 1 -1.5 1.5 h-13 a1.5 1.5 0 0 1 -1.5 -1.5 v-6 a1.5 1.5 0 0 1 1.5 -1.5 z"
        stroke={color}
        strokeWidth={2.2}
        fill="none"
      />
    </Svg>
  );
}

/** A dumbbell for the "build your own" row — same weight as the movements. */
function DumbbellMark({ size, color }: { size: number; color: string }) {
  const common = {
    stroke: color,
    strokeWidth: 2.4,
    strokeLinecap: 'round' as const,
    fill: 'none' as const,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M8 12 L16 12" {...common} />
      <Path d="M5.5 8.5 L5.5 15.5" {...common} />
      <Path d="M18.5 8.5 L18.5 15.5" {...common} />
      <Path d="M3 10.5 L3 13.5" {...common} />
      <Path d="M21 10.5 L21 13.5" {...common} />
    </Svg>
  );
}

function PlusMark({ size }: { size: number }) {
  const half = size / 2;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Path
        d={`M${half} 3 L${half} ${size - 3}`}
        stroke="#ffffff"
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Path
        d={`M3 ${half} L${size - 3} ${half}`}
        stroke="#ffffff"
        strokeWidth={3}
        strokeLinecap="round"
      />
    </Svg>
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

  /* Labels only. The glyphs come from `ExerciseGlyph`, the same drawing the
     duel picker uses — these rows used 💪 🦵 🧘, where the meditation pose for
     sit-ups was describing the wrong thing entirely and all three were a
     different illustration style from the rest of the app. */
  const META: Record<string, { label: string }> = {
    push: { label: 'Push-Ups' },
    squat: { label: 'Squats' },
    situp: { label: 'Sit-Ups' },
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
      const meta = META[row.exercise] ?? { label: row.exercise };
      return {
        label: meta.label,
        exercise: row.exercise,
        emoji: '',
        locked: row.locked,
        doneToday: row.doneToday,
        onPress: () => startExercise(row.exercise),
      };
    }),
    {
      label: 'Custom Workout',
      /* The one row that is not a single movement, so it keeps a glyph of its
         own rather than borrowing one. Drawn, not emoji, so the sheet has one
         illustration style throughout. */
      emoji: '',
      custom: true,
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
  /** When the menu opened, so a finger lifting off the hold is not a dismiss. */
  const openedAtRef = useRef(0);

  const openMenu = () => {
    const stored = parseFabHint(storage.getString(FAB_HINT_KEY));
    storage.set(FAB_HINT_KEY, JSON.stringify(markFabHintUsed(stored)));
    setHintVisible(false);
    openedAtRef.current = Date.now();
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

  /* Holding opened the menu and then letting go closed it again.
   *
   * `onLongPress` fires while the finger is still down, so the modal mounts
   * under it; the release then lands on the scrim, whose `onPress` is `close`.
   * The menu was appearing and dismissing inside one gesture, which is why it
   * never looked like it stayed open — and why the disc appeared to never flip
   * to the ×, since by the time anything could be seen the state was already
   * back to closed.
   *
   * Ignoring scrim presses for a moment after opening lets the finger come up
   * without being read as "dismiss". Tapping outside still closes it, a beat
   * later, which is the behaviour the scrim is actually there for. */
  const closeFromScrim = () => {
    if (Date.now() - openedAtRef.current < 400) return;
    close();
  };

  return (
    <>
      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.fabScrim} onPress={closeFromScrim}>
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
                    {action.locked ? (
                      /* Drawn, like everything else in this sheet. A 🔒 was the
                         last emoji left once the movements became glyphs, which
                         made it the one thing on the row that looked pasted in. */
                      <LockMark size={20} color={palette.grey500} />
                    ) : action.exercise ? (
                      <ExerciseGlyph
                        exercise={action.exercise}
                        size={24}
                        color={palette.green600}
                      />
                    ) : action.custom ? (
                      <DumbbellMark size={22} color={palette.green600} />
                    ) : (
                      <Text style={{ fontSize: 18 }}>{action.emoji}</Text>
                    )}
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
            {/* One idea, not four.
                It was a dark charcoal disc carrying a photographic emoji of two
                flexing arms, ringed in green, with a red badge on top — four
                colours and two illustration styles inside 58pt, in an app whose
                every other surface is flat green on off-white. The emoji read
                as a sticker someone had dropped on the UI.
                Now the brand gradient with a drawn glyph on it: a plus, because
                the button's job is "add a set", and the same line weight the
                exercise icons use. Open flips to the × on the same green, so
                the colour never moves — only the mark does. */}
            <LinearGradient
              colors={['#22c55e', '#15803d']}
              start={{ x: 0.15, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={styles.fabCircle}
            >
              <Animated.View style={iconSpin}>
                {open ? (
                  <Text style={font('bold', 26, { color: '#fff', lineHeight: 28 })}>×</Text>
                ) : (
                  <PlusMark size={26} />
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
    /* Centred on the FAB rather than right-aligned to it.
     *
     * Right-aligning looked correct in isolation and was wrong on screen: the
     * pill is far wider than the 58pt disc, so all of that extra width grew
     * leftward, across the Quick Start card. Raising it did not help — the
     * card is tall, so any offset that still reads as "attached to the
     * button" lands on it.
     *
     * Centring splits the overhang either side, and the right half falls off
     * the screen edge where there is nothing to collide with. */
    right: 23 - (HINT_WIDTH - FAB_DIAMETER) / 2,
    width: HINT_WIDTH,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 12,
    // Near-black rather than the FAB's green: the pill is a passing hint, and
    // repeating the button's own colour would make it compete with the thing it
    // is explaining. Kept dark so it reads as a tooltip, not a second action.
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
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    /* No border. The 3pt white rim existed to separate a dark disc from a light
       page; a green disc on off-white already has that separation, and the ring
       only made the button read as an outlined sticker.
       The shadow is neutral rather than green-tinted — a coloured shadow on a
       coloured disc doubles the hue and muddies the edge — and softer, because
       elevation should suggest the button floats, not that it is glowing.
       56 is the Material FAB diameter; 58 was drifting off-spec for no reason. */
    shadowColor: '#0f1a12',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 8,
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
    // A pale green tile behind a green600 glyph: enough separation to read as
    // an icon chip, not so much that it competes with the label beside it.
    // (An older comment here claimed the sheet was dark. It is not — #f0fdf4.)
    backgroundColor: palette.tintGreenTop,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

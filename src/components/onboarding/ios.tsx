import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  FadeInUp,
  ZoomIn,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { PressableScale } from '@/components/ui';
import { selectionHaptic } from '@/lib/feedback';
import { font, scaleForRole } from '@/theme/typography';
import { palette, radius, surfaceShadow } from '@/theme/tokens';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * The onboarding "iOS kit".
 *
 * The screens built from this share one vocabulary: soft drifting colour behind
 * everything (the way iOS wallpapers and Fitness rings glow), springy entrances
 * rather than linear fades, inset-grouped rows with app-icon tiles, and
 * selections that confirm themselves — a check that pops, a tile that lifts —
 * before the flow moves on. Everything runs on the UI thread.
 */

/**
 * The body of a step, scrollable so large system text can never push the action
 * button off screen. Short content still fills the height (`flexGrow`), so
 * spacers and centred heroes behave exactly as they do without the scroll.
 */
export function StepScroll({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ flexGrow: 1, paddingBottom: 12 }}
      showsVerticalScrollIndicator={false}
      bounces={false}
    >
      {children}
    </ScrollView>
  );
}

/** A spring entrance: rises, overshoots a hair, settles. `i` staggers siblings. */
export const springIn = (i = 0, step = 70) =>
  FadeInDown.delay(i * step)
    .springify()
    .damping(15)
    .stiffness(130)
    .withInitialValues({ opacity: 0, transform: [{ translateY: 22 }] });

/* ------------------------------------------------------------------------- */

/** One soft radial glow that drifts slowly. */
function Glow({
  size,
  color,
  top,
  left,
  dx,
  dy,
  duration,
  opacity = 0.55,
}: {
  size: number;
  color: string;
  top: number;
  left: number;
  dx: number;
  dy: number;
  duration: number;
  opacity?: number;
}) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    t.value = withRepeat(
      withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [t, duration, reduced]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: dx * t.value }, { translateY: dy * t.value }],
  }));

  const id = `g${color.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top, left, opacity }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity="0.9" />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

/**
 * Colour that breathes behind a screen. Tinted per screen so each one has its
 * own mood while the motion stays the same.
 */
export function Aurora({ tint = palette.green400, second = palette.blue400 }: { tint?: string; second?: string }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Glow size={360} color={tint} top={-120} left={-90} dx={60} dy={40} duration={7000} />
      <Glow size={300} color={second} top={160} left={150} dx={-70} dy={50} duration={9000} opacity={0.35} />
      <Glow size={260} color={tint} top={520} left={-80} dx={50} dy={-40} duration={8000} opacity={0.3} />
    </View>
  );
}

/* ------------------------------------------------------------------------- */

/** Small tracked-caps label above a title, as a frosted pill. */
export function Eyebrow({ label, tint }: { label: string; tint: string }) {
  return (
    <Animated.View entering={ZoomIn.springify().damping(14)} style={[s.eyebrow, { backgroundColor: tint }]}>
      <Text style={s.eyebrowText} {...scaleForRole('control')}>{label}</Text>
    </Animated.View>
  );
}

/** Eyebrow + large tight title + body, each springing in just behind the last. */
export function ScreenHead({
  eyebrow,
  tint,
  title,
  body,
  align = 'center',
}: {
  eyebrow?: string;
  tint?: string;
  title: string;
  body?: string;
  align?: 'center' | 'left';
}) {
  const alignItems = align === 'center' ? 'center' : 'flex-start';
  const textAlign = align;
  return (
    <View style={{ alignItems }}>
      {eyebrow ? <Eyebrow label={eyebrow} tint={tint ?? palette.green50} /> : null}
      <Animated.Text entering={springIn(1)} style={[s.title, { textAlign }]} {...scaleForRole('heading')}>
        {title}
      </Animated.Text>
      {body ? (
        <Animated.Text entering={springIn(2)} style={[s.body, { textAlign }]} {...scaleForRole('body')}>
          {body}
        </Animated.Text>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------------- */

/** iOS inset-grouped list: one rounded surface, hairline separators. */
export function InsetGroup({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.group, style]}>{children}</View>;
}

/** A row in an inset group, led by a coloured rounded-square "app icon" tile. */
export function InsetRow({
  glyph,
  tile,
  title,
  sub,
  index = 0,
  last = false,
}: {
  glyph: string;
  tile: string;
  title: string;
  sub: string;
  index?: number;
  last?: boolean;
}) {
  return (
    <Animated.View entering={springIn(index + 3, 90)}>
      <View style={s.row}>
        <View style={[s.tile, { backgroundColor: tile }]}>
          <Text style={{ fontSize: 19 }} allowFontScaling={false}>{glyph}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.rowTitle} {...scaleForRole('heading')}>{title}</Text>
          <Text style={s.rowSub} {...scaleForRole('body')}>{sub}</Text>
        </View>
      </View>
      {last ? null : <View style={s.hairline} />}
    </Animated.View>
  );
}

/* ------------------------------------------------------------------------- */

/**
 * Choosing should be felt before the screen moves on: the check pops, the tile
 * lifts, and only then does the flow advance. Further taps while that beat is
 * playing are ignored, so a double tap cannot skip the next question.
 */
export function useCommitChoice<T>(onSelect: (id: T) => void, selected: T | null, beatMs = 340) {
  const [picked, setPicked] = useState<T | null>(selected);
  const locked = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const choose = useCallback(
    (id: T) => {
      if (locked.current) return;
      locked.current = true;
      selectionHaptic();
      setPicked(id);
      timer.current = setTimeout(() => onSelect(id), beatMs);
    },
    [onSelect, beatMs],
  );

  return { picked, choose };
}

/**
 * Dims a card by laying white over it. Animating the card's own opacity makes
 * Android draw its elevation shadow as a grey box, so the dimming lives in an
 * overlay instead.
 */
function Scrim({ on, round }: { on: boolean; round: number }) {
  const o = useSharedValue(0);
  useEffect(() => {
    o.value = withTiming(on ? 0.62 : 0, { duration: 200 });
  }, [on, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { borderRadius: round, backgroundColor: '#ffffff' }, style]}
    />
  );
}

/** The pop-in check badge a chosen option wears. */
export function SpringCheck({ size = 24 }: { size?: number }) {
  return (
    <Animated.View
      entering={ZoomIn.springify().damping(9).stiffness(220)}
      style={[s.check, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <Text style={font('extrabold', size * 0.55, { color: palette.white })} allowFontScaling={false}>✓</Text>
    </Animated.View>
  );
}

/** A selectable row: tile, title, subtitle, and a radio that becomes a check. */
export function ChoiceRow({
  emoji,
  label,
  sub,
  selected,
  dimmed,
  index,
  onPress,
}: {
  emoji: string;
  label: string;
  sub: string;
  selected: boolean;
  dimmed: boolean;
  index: number;
  onPress: () => void;
}) {
  const lift = useSharedValue(0);
  useEffect(() => {
    lift.value = withSpring(selected ? 1 : 0, { damping: 11, stiffness: 220 });
  }, [selected, lift]);
  const liftStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + lift.value * 0.025 }],
  }));

  return (
    <Animated.View entering={springIn(index + 3, 90)}>
      <PressableScale
        onPress={onPress}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={label}
      >
        <Animated.View style={[s.choice, selected && s.choiceOn, liftStyle]}>
          <View style={[s.choiceTile, selected && { backgroundColor: palette.green100 }]}>
            <Text style={{ fontSize: 24 }} allowFontScaling={false}>{emoji}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.choiceTitle} {...scaleForRole('heading')}>{label}</Text>
            <Text style={s.rowSub} {...scaleForRole('body')}>{sub}</Text>
          </View>
          {selected ? <SpringCheck /> : <View style={s.radio} />}
          <Scrim on={dimmed} round={22} />
        </Animated.View>
      </PressableScale>
    </Animated.View>
  );
}

/** A big square tile for 2×2 choices: emoji up top, label beneath. */
export function ChoiceTile({
  emoji,
  label,
  hint,
  tint,
  selected,
  dimmed,
  index,
  onPress,
}: {
  emoji: string;
  label: string;
  hint: string;
  tint: string;
  selected: boolean;
  dimmed: boolean;
  index: number;
  onPress: () => void;
}) {
  const pop = useSharedValue(0);
  useEffect(() => {
    pop.value = selected
      ? withSequence(withTiming(1.18, { duration: 120 }), withSpring(1, { damping: 6, stiffness: 240 }))
      : withTiming(0, { duration: 150 });
  }, [selected, pop]);
  const emojiStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value === 0 ? 1 : pop.value }, { rotate: `${(pop.value > 1 ? pop.value - 1 : 0) * -30}deg` }],
  }));

  return (
    <Animated.View entering={springIn(index + 2, 80)} style={s.tileWrap}>
      <PressableScale
        onPress={onPress}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={label}
        style={{ flex: 1 }}
      >
        <View style={[s.bigTile, selected && s.choiceOn]}>
          <View style={[s.bigTileBubble, { backgroundColor: selected ? palette.green100 : tint }]}>
            <Animated.Text style={[{ fontSize: 34 }, emojiStyle]} allowFontScaling={false}>{emoji}</Animated.Text>
          </View>
          <Text style={s.bigTileLabel} {...scaleForRole('control')}>{label}</Text>
          <Text style={s.bigTileHint} {...scaleForRole('control')}>{hint}</Text>
          {selected ? (
            <View style={s.bigTileCheck}>
              <SpringCheck size={26} />
            </View>
          ) : null}
          <Scrim on={dimmed} round={26} />
        </View>
      </PressableScale>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------------- */

/** A soft pulse ring around its child — "this is live". */
export function PulseRing({
  size,
  color = palette.green500,
  children,
}: {
  size: number;
  color?: string;
  children?: ReactNode;
}) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    t.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1, false);
  }, [t, reduced]);
  const ring = useAnimatedStyle(() => ({
    opacity: 0.5 * (1 - t.value),
    transform: [{ scale: 1 + t.value * 0.55 }],
  }));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        pointerEvents="none"
        style={[
          { position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: color },
          ring,
        ]}
      />
      {children}
    </View>
  );
}

/** Fades a chip in after `delay` ms with a spring, then hands control back. */
export function PopChip({
  children,
  delay = 0,
  style,
}: {
  children: ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(delay, withSpring(1, { damping: 10, stiffness: 180 }));
  }, [v, delay]);
  const a = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ scale: 0.6 + 0.4 * v.value }] }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

/** A ring that springs to `progress` (0–1) whenever it changes. */
export function ProgressDial({
  size,
  stroke,
  progress,
  color = palette.green500,
  children,
}: {
  size: number;
  stroke: number;
  progress: number;
  color?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withSpring(progress, { damping: 14, stiffness: 110 });
  }, [progress, p]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - p.value) }));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(15,31,23,0.07)" strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          animatedProps={props}
          fill="none"
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>{children}</View>
    </View>
  );
}

export { FadeInUp };

const s = StyleSheet.create({
  eyebrow: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 14,
  },
  eyebrowText: { ...font('extrabold', 10.5, { color: palette.green700 }), letterSpacing: 2 },
  title: {
    ...font('extrabold', 32, { color: palette.ink }),
    letterSpacing: -1.1,
    lineHeight: 37,
  },
  body: {
    ...font('medium', 15, { color: palette.grey600 }),
    lineHeight: 21,
    marginTop: 10,
    maxWidth: 320,
  },

  group: {
    borderRadius: 24,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
    overflow: 'hidden',
    ...surfaceShadow,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingHorizontal: 16 },
  tile: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { ...font('extrabold', 15.5, { color: palette.ink }), letterSpacing: -0.2 },
  rowSub: font('regular', 12.5, { color: palette.grey600 }),
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: palette.borderStrong, marginLeft: 68 },

  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: 'rgba(15,31,23,0.06)',
    ...surfaceShadow,
  },
  choiceOn: {
    borderColor: palette.green500,
    backgroundColor: palette.green50,
    shadowColor: palette.green500,
    shadowOpacity: 0.28,
    shadowRadius: 22,
  },
  choiceTile: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: palette.green50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceTitle: { ...font('extrabold', 16.5, { color: palette.ink }), letterSpacing: -0.3 },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: palette.borderStrong },
  check: { backgroundColor: palette.green600, alignItems: 'center', justifyContent: 'center' },

  tileWrap: { width: '48%', flexGrow: 1, minHeight: 188 },
  bigTile: {
    flex: 1,
    padding: 16,
    borderRadius: 26,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: 'rgba(15,31,23,0.06)',
    justifyContent: 'space-between',
    ...surfaceShadow,
  },
  bigTileBubble: { width: 62, height: 62, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  bigTileLabel: { ...font('extrabold', 17, { color: palette.ink }), letterSpacing: -0.4, marginTop: 10 },
  bigTileHint: { ...font('medium', 12, { color: palette.grey600 }), lineHeight: 16 },
  bigTileCheck: { position: 'absolute', top: 12, right: 12 },
});

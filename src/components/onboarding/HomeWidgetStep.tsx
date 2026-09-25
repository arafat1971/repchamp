import { useEffect, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInUp,
  ZoomIn,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient as Backdrop } from 'expo-linear-gradient';

import { PressableScale, PrimaryButton } from '@/components/ui';
import { SAMPLE_SNAPSHOT, WidgetPreview } from '@/components/widget/WidgetPreview';
import { DEFAULT_WIDGET_STYLE } from '@/domain/waterWidget';
import { lightImpactHaptic } from '@/lib/feedback';
import { isWidgetSupported, placedWidgetCount, requestPinWidget } from '@/services/partnerWidget';
import { font, text } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

/**
 * Onboarding: "Keep them on your home screen".
 *
 * The hook is the moment itself — a phone on a wallpaper, a notification
 * dropping in ("Alex just had a juice"), and the widget's rings filling in
 * answer — so the value is seen before it is described. One tap opens the
 * system's own "Add to home screen" sheet; the step confirms by counting the
 * widgets actually placed, then moves on by itself.
 *
 * Skipped outright where there is no widget to add (iOS, or a build without
 * the native module): a step offering the impossible is worse than none.
 */
export function HomeWidgetStep({ onNext }: { onNext: () => void }) {
  const { width } = useWindowDimensions();
  const supported = isWidgetSupported();
  const [asked, setAsked] = useState(false);
  const [placed, setPlaced] = useState(false);
  const [manual, setManual] = useState(false);

  useEffect(() => {
    if (!supported) onNext();
  }, [supported, onNext]);

  /* Once the sheet has been shown, watch for the widget to land. */
  useEffect(() => {
    if (!asked || placed) return;
    let cancelled = false;
    const timer = setInterval(() => {
      void placedWidgetCount('water').then((n) => {
        if (!cancelled && n > 0) setPlaced(true);
      });
    }, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [asked, placed]);

  /* A beat to enjoy the tick, then on. */
  useEffect(() => {
    if (!placed) return;
    const t = setTimeout(onNext, 1400);
    return () => clearTimeout(t);
  }, [placed, onNext]);

  if (!supported) return null;

  const add = async () => {
    lightImpactHaptic();
    const shown = await requestPinWidget('water');
    setAsked(true);
    setManual(!shown);
  };

  const phoneWidth = Math.min(width - 64, 330);

  return (
    <View style={styles.step}>
      <Animated.View entering={FadeInUp.duration(420)} style={{ alignItems: 'center' }}>
        <View style={styles.eyebrow}>
          <Text style={styles.eyebrowText}>ONE LAST TOUCH</Text>
        </View>
        <Text style={[text.h1, styles.title]}>Keep them on{'\n'}your home screen</Text>
        <Text style={[text.body, styles.copy]}>
          Your bear and theirs, side by side — every sip, step and rep a tug-of-war you can win from the home screen.
        </Text>
      </Animated.View>

      <Phone width={phoneWidth} placed={placed} />

      {placed ? (
        <Animated.View entering={ZoomIn.duration(320)} style={styles.done}>
          <Text style={styles.doneText}>✓ Added to your home screen</Text>
        </Animated.View>
      ) : manual ? (
        <Animated.View entering={FadeIn.duration(260)} style={styles.manual}>
          <Text style={styles.manualText}>
            Hold an empty spot on your home screen → Widgets → RepChamp → Partner today.
          </Text>
        </Animated.View>
      ) : null}

      <View style={{ gap: 6 }}>
        {placed ? null : (
          <PrimaryButton label={asked && !manual ? 'Show me again' : 'Add to home screen'} onPress={() => void add()} />
        )}
        <PressableScale
          onPress={onNext}
          accessibilityRole="button"
          accessibilityLabel={placed ? 'Continue' : 'Maybe later'}
          style={styles.later}
        >
          <Text style={styles.laterText}>{placed ? 'Continue' : 'Maybe later'}</Text>
        </PressableScale>
      </View>
    </View>
  );
}

/**
 * A phone on its home screen: wallpaper, clock, a few app icons, a partner
 * notification that drops in and slides away on a loop, and the widget.
 */
function Phone({ width, placed }: { width: number; placed: boolean }) {
  const reduced = useReducedMotion();
  const drop = useSharedValue(0);
  const float = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    drop.set(
      withRepeat(
        withSequence(
          withDelay(700, withTiming(1, { duration: 420, easing: Easing.out(Easing.back(1.4)) })),
          withDelay(2200, withTiming(0, { duration: 360, easing: Easing.in(Easing.quad) })),
          withTiming(0, { duration: 900 }),
        ),
        -1,
      ),
    );
    float.set(withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => {
      cancelAnimation(drop);
      cancelAnimation(float);
    };
  }, [reduced, drop, float]);

  const toast = useAnimatedStyle(() => ({
    opacity: drop.value,
    transform: [{ translateY: -24 + drop.value * 24 }, { scale: 0.94 + drop.value * 0.06 }],
  }));
  const bob = useAnimatedStyle(() => ({ transform: [{ translateY: -3 + float.value * 6 }] }));

  const inner = width - 20;

  return (
    <Animated.View style={[styles.phone, { width }, bob]}>
      <View style={styles.screen}>
        {/* A warm, light wallpaper so the Sunset widget pops off it. */}
        <Backdrop
          colors={['#FEF3C7', '#FBCFE8', '#C7D2FE']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.statusBar}>
          <Text style={styles.clock}>9:41</Text>
          <View style={styles.island} />
          <Text style={styles.clock}>100%</Text>
        </View>

        <Animated.View style={[styles.toast, toast]}>
          <Text style={styles.toastIcon}>🧃</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.toastTitle}>Alex just had a juice</Text>
            <Text style={styles.toastBody}>1.4 L today · your turn 💧</Text>
          </View>
        </Animated.View>

        <View style={styles.widgetSlot}>
          <WidgetPreview style={DEFAULT_WIDGET_STYLE} snap={SAMPLE_SNAPSHOT} width={inner} />
          {placed ? (
            <Animated.View entering={ZoomIn.duration(300)} style={styles.tick}>
              <Text style={styles.tickText}>✓</Text>
            </Animated.View>
          ) : null}
        </View>

        <View style={styles.dock}>
          {['#FDE68A', '#A7F3D0', '#BFDBFE', '#FBCFE8'].map((c) => (
            <View key={c} style={[styles.app, { backgroundColor: c }]} />
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  step: { flex: 1, paddingHorizontal: 20, paddingBottom: 24, paddingTop: 28 },
  eyebrow: {
    borderRadius: radius['2xl'],
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 12,
    backgroundColor: '#e0f2fe',
  },
  eyebrowText: { ...font('extrabold', 10.5, { color: '#0369a1' }), letterSpacing: 2 },
  title: { fontSize: 27, textAlign: 'center' },
  copy: { textAlign: 'center', marginTop: 8, maxWidth: 310, alignSelf: 'center' },
  phone: {
    alignSelf: 'center',
    marginTop: 22,
    marginBottom: 18,
    padding: 7,
    borderRadius: 38,
    backgroundColor: '#0b0b12',
    shadowColor: '#312e81',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
  screen: { borderRadius: 31, overflow: 'hidden', paddingHorizontal: 3, paddingBottom: 14 },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  clock: font('bold', 11, { color: palette.ink }),
  island: { width: 64, height: 18, borderRadius: 10, backgroundColor: '#000' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 10,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  toastIcon: { fontSize: 20 },
  toastTitle: font('extrabold', 12, { color: palette.ink }),
  toastBody: font('semibold', 10.5, { color: palette.grey600 }),
  widgetSlot: { marginTop: 12, alignItems: 'center' },
  tick: {
    position: 'absolute',
    top: -8,
    right: 4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: palette.green500,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: palette.white,
  },
  tickText: font('extrabold', 13, { color: palette.white }),
  dock: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 16 },
  app: { width: 36, height: 36, borderRadius: 11, opacity: 0.85 },
  done: {
    alignSelf: 'center',
    backgroundColor: palette.green50,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 12,
  },
  doneText: font('extrabold', 13, { color: palette.green700 }),
  manual: {
    backgroundColor: '#f1f5f9',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  manualText: { ...font('semibold', 12.5, { color: palette.ink }), textAlign: 'center', lineHeight: 18 },
  later: { alignItems: 'center', paddingVertical: 10 },
  laterText: font('bold', 13, { color: palette.grey600 }),
});

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
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient as Backdrop } from 'expo-linear-gradient';

import { PressableScale, PrimaryButton } from '@/components/ui';
import { AthletePreview } from '@/components/widget/AthletePreview';
import { lightImpactHaptic, selectionHaptic } from '@/lib/feedback';
import { isWidgetSupported, placedWidgetCount, requestPinWidget } from '@/services/partnerWidget';
import { useProfileStore } from '@/state/profileStore';
import { font, text } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

/** One push-up of the preview's loop (11 frames at 110 ms). */
const REP_MS = 1210;

/**
 * Onboarding: "Reps, one tap from your home screen".
 *
 * The same shape as the water-widget step: the widget is shown doing its job
 * (the athlete grinding out push-ups, a counter ticking up) before it is
 * described, one tap opens the system's own "Add to home screen" sheet, and
 * the step confirms by counting the widgets actually placed. The athlete is the
 * user's own pick — never inferred — and is saved to the profile.
 *
 * Skipped where there is no widget to add (iOS, or a build without the native
 * module).
 */
export function RepsWidgetStep({ onNext }: { onNext: () => void }) {
  const { width } = useWindowDimensions();
  const supported = isWidgetSupported();
  const sex = useProfileStore((p) => p.sex) ?? 'male';
  const setSex = useProfileStore((p) => p.setSex);
  const [asked, setAsked] = useState(false);
  const [placed, setPlaced] = useState(false);
  const [manual, setManual] = useState(false);

  useEffect(() => {
    if (!supported) onNext();
  }, [supported, onNext]);

  useEffect(() => {
    if (!asked || placed) return;
    let cancelled = false;
    const timer = setInterval(() => {
      void placedWidgetCount('reps').then((n) => {
        if (!cancelled && n > 0) setPlaced(true);
      });
    }, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [asked, placed]);

  useEffect(() => {
    if (!placed) return;
    const t = setTimeout(onNext, 1400);
    return () => clearTimeout(t);
  }, [placed, onNext]);

  if (!supported) return null;

  const add = async () => {
    lightImpactHaptic();
    const shown = await requestPinWidget('reps');
    setAsked(true);
    setManual(!shown);
  };

  return (
    <View style={styles.step}>
      <Animated.View entering={FadeInUp.duration(420)} style={{ alignItems: 'center' }}>
        <View style={styles.eyebrow}>
          <Text style={styles.eyebrowText}>ONE MORE SPOT</Text>
        </View>
        <Text style={[text.h1, styles.title]}>Reps, one tap{'\n'}from your home screen</Text>
        <Text style={[text.body, styles.copy]}>
          Your athlete does push-ups on your wallpaper. Tap it and you are straight into a set.
        </Text>
      </Animated.View>

      <Phone width={Math.min(width - 120, 230)} sex={sex} placed={placed} />

      <View style={styles.sexRow}>
        {(['male', 'female'] as const).map((s) => (
          <PressableScale
            key={s}
            onPress={() => {
              selectionHaptic();
              setSex(s);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: sex === s }}
            style={[styles.sexChip, sex === s && styles.sexChipOn]}
          >
            <Text style={[styles.sexText, sex === s && styles.sexTextOn]}>{s === 'male' ? 'Man' : 'Woman'}</Text>
          </PressableScale>
        ))}
      </View>

      {placed ? (
        <Animated.View entering={ZoomIn.duration(320)} style={styles.done}>
          <Text style={styles.doneText}>✓ Added to your home screen</Text>
        </Animated.View>
      ) : manual ? (
        <Animated.View entering={FadeIn.duration(260)} style={styles.manual}>
          <Text style={styles.manualText}>Hold an empty spot on your home screen → Widgets → RepChamp → Reps.</Text>
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

/** A phone on its wallpaper with the 2×2 reps tile and a live rep counter. */
function Phone({ width, sex, placed }: { width: number; sex: 'male' | 'female'; placed: boolean }) {
  const reduced = useReducedMotion();
  const float = useSharedValue(0);
  const [reps, setReps] = useState(0);

  useEffect(() => {
    if (reduced) return;
    float.set(withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => cancelAnimation(float);
  }, [reduced, float]);

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setReps((n) => n + 1), REP_MS);
    return () => clearInterval(id);
  }, [reduced]);

  const bob = useAnimatedStyle(() => ({ transform: [{ translateY: -3 + float.value * 6 }] }));
  const tile = Math.min(width - 40, 170);

  return (
    <Animated.View style={[styles.phone, { width }, bob]}>
      <View style={styles.screen}>
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

        <View style={styles.tileSlot}>
          <View style={[styles.tile, { width: tile, height: tile }]}>
            <Backdrop
              colors={['#0F172A', '#1E3A8A', '#0EA5E9']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <AthletePreview sex={sex} size={tile - 24} />
            <View style={styles.counter}>
              <Text style={styles.counterText}>{reduced ? 'Reps today' : `${reps} reps`}</Text>
            </View>
          </View>
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
    backgroundColor: '#dbeafe',
  },
  eyebrowText: { ...font('extrabold', 10.5, { color: '#1d4ed8' }), letterSpacing: 2 },
  title: { fontSize: 27, textAlign: 'center' },
  copy: { textAlign: 'center', marginTop: 8, maxWidth: 310, alignSelf: 'center' },
  phone: {
    alignSelf: 'center',
    marginTop: 18,
    marginBottom: 12,
    padding: 6,
    borderRadius: 32,
    backgroundColor: '#0b0b12',
    shadowColor: '#1e3a8a',
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  screen: { borderRadius: 26, overflow: 'hidden', paddingBottom: 12 },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 9,
  },
  clock: font('bold', 10, { color: palette.ink }),
  island: { width: 52, height: 15, borderRadius: 8, backgroundColor: '#000' },
  tileSlot: { marginTop: 14, alignItems: 'center' },
  tile: { borderRadius: 24, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  counter: {
    position: 'absolute',
    bottom: 8,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  counterText: font('extrabold', 11, { color: palette.white }),
  tick: {
    position: 'absolute',
    top: -8,
    right: 14,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: palette.green500,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: palette.white,
  },
  tickText: font('extrabold', 12, { color: palette.white }),
  dock: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 14 },
  app: { width: 30, height: 30, borderRadius: 9, opacity: 0.85 },
  sexRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 12 },
  sexChip: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(118,118,128,0.12)' },
  sexChipOn: { backgroundColor: '#1D4ED8' },
  sexText: font('bold', 13, { color: '#3C3C43' }),
  sexTextOn: { color: palette.white },
  done: {
    alignSelf: 'center',
    backgroundColor: palette.green50,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 12,
  },
  doneText: font('extrabold', 13, { color: palette.green700 }),
  manual: { backgroundColor: '#f1f5f9', borderRadius: 14, padding: 12, marginBottom: 12 },
  manualText: { ...font('semibold', 12.5, { color: palette.ink }), textAlign: 'center', lineHeight: 18 },
  later: { alignItems: 'center', paddingVertical: 10 },
  laterText: font('bold', 13, { color: palette.grey600 }),
});

import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  FadeOutUp,
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
import { PandaJar } from '@/components/home/PandaJar';
import type { PandaMood } from '@/domain/pandaMood';
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
export function HomeWidgetStep({ onNext, username }: { onNext: () => void; username?: string }) {
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

  const phoneWidth = Math.min(Math.floor((width - 40 - 12) / 2), 172);

  return (
    <View style={styles.step}>
      <Animated.View entering={FadeInUp.duration(420)} style={{ alignItems: 'center' }}>
        <View style={styles.eyebrow}>
          <Text style={styles.eyebrowText}>ONE LAST TOUCH</Text>
        </View>
        <Text style={[text.h1, styles.title]}>Keep them on{'\n'}your home screen</Text>
        <Text style={[text.body, styles.copy]}>
          Tickle their panda and they see it live. Take a sip and theirs does too — right on the home screen.
        </Text>
      </Animated.View>

      <PandaDuo width={phoneWidth} placed={placed} username={username?.trim() || 'Sam'} />

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

const GOAL_ML = 2000;
const SIP_ML = 250;

interface Toast {
  key: number;
  text: string;
}

/**
 * Two phones, one habit. Each shows the OTHER person's panda, exactly as the
 * home-screen widget does: tickle Alex on your phone and your panda giggles on
 * theirs; drink on theirs and their panda takes a sip on yours. A thirsty panda
 * carries the hydration reminder. Left alone it demos itself once.
 */
function PandaDuo({ width, placed, username }: { width: number; placed: boolean; username: string }) {
  const reduced = useReducedMotion();
  const float = useSharedValue(0);
  const phase = useSharedValue(0);

  const [meMl, setMeMl] = useState(500);
  const [themMl, setThemMl] = useState(750);
  const [meSip, setMeSip] = useState(0);
  const [themSip, setThemSip] = useState(0);
  const [giggle, setGiggle] = useState<{ kind: 'tickle'; key: number; giving: boolean } | null>(null);
  const [toastA, setToastA] = useState<Toast | null>(null);
  const [toastB, setToastB] = useState<Toast | null>(null);
  const touched = useRef(false);
  const keyRef = useRef(0);

  useEffect(() => {
    if (reduced) return;
    float.set(withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }), -1, true));
    phase.set(withRepeat(withTiming(2 * Math.PI, { duration: 3000, easing: Easing.linear }), -1));
    return () => {
      cancelAnimation(float);
      cancelAnimation(phase);
    };
  }, [reduced, float, phase]);

  /* A toast lives for a couple of seconds, then goes. */
  useEffect(() => {
    if (!toastA) return;
    const t = setTimeout(() => setToastA(null), 2600);
    return () => clearTimeout(t);
  }, [toastA]);
  useEffect(() => {
    if (!toastB) return;
    const t = setTimeout(() => setToastB(null), 2600);
    return () => clearTimeout(t);
  }, [toastB]);

  /* You tickle Alex: their panda giggles here, yours giggles on their phone. */
  const tickle = useCallback(() => {
    keyRef.current += 1;
    setGiggle({ kind: 'tickle', key: keyRef.current, giving: false });
    setToastA({ key: keyRef.current, text: 'You tickled Alex' });
    setToastB({ key: keyRef.current, text: `${username} tickled you` });
  }, [username]);

  /* You drink: your panda sips on THEIR phone. */
  const drinkMe = useCallback(() => {
    keyRef.current += 1;
    setMeMl((n) => Math.min(GOAL_ML, n + SIP_ML));
    setMeSip((n) => n + 1);
    setToastB({ key: keyRef.current, text: `${username} took a sip` });
  }, [username]);

  /* Alex drinks: their panda sips on YOUR phone. */
  const drinkThem = useCallback(() => {
    keyRef.current += 1;
    setThemMl((n) => Math.min(GOAL_ML, n + SIP_ML));
    setThemSip((n) => n + 1);
    setToastA({ key: keyRef.current, text: 'Alex took a sip' });
  }, []);

  /* Left alone, show the idea once: a tickle, then a sip. */
  useEffect(() => {
    if (reduced) return;
    const a = setTimeout(() => !touched.current && tickle(), 1500);
    const b = setTimeout(() => !touched.current && drinkThem(), 4200);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [reduced, tickle, drinkThem]);

  const mine = () => {
    touched.current = true;
    lightImpactHaptic();
    drinkMe();
  };
  const theirs = () => {
    touched.current = true;
    lightImpactHaptic();
    drinkThem();
  };

  const bob = useAnimatedStyle(() => ({ transform: [{ translateY: -2 + float.value * 4 }] }));

  const moodOf = (ml: number): PandaMood => (ml >= GOAL_ML ? 'celebrate' : ml < GOAL_ML * 0.4 ? 'thirsty' : 'happy');
  const pct = (ml: number) => Math.round((ml / GOAL_ML) * 100);
  const pandaWidth = Math.min(112, width - 34);

  return (
    <View style={styles.duo}>
      <Animated.View style={[{ width }, bob]}>
        <MiniPhone
          width={width}
          colors={['#FEF3C7', '#FBCFE8', '#C7D2FE']}
          toast={toastA}
          badge={placed}
          caption={`Alex · ${themMl} ml`}
          reminder={moodOf(themMl) === 'thirsty' ? 'Time for a sip' : null}
        >
          <PandaJar
            id="onb-them"
            outfit="hoodie"
            remaining={100 - pct(themMl)}
            width={pandaWidth}
            phase={phase}
            sipKey={themSip}
            mood={moodOf(themMl)}
            gesture={giggle}
            interactive
            onPoke={() => {
              touched.current = true;
              tickle();
            }}
          />
        </MiniPhone>
        <Text style={styles.who}>Your phone</Text>
        <SipButton label="I drank" onPress={mine} />
      </Animated.View>

      <Animated.View style={[{ width }, bob]}>
        <MiniPhone
          width={width}
          colors={['#BAE6FD', '#DDD6FE', '#FBCFE8']}
          toast={toastB}
          caption={`${username} · ${meMl} ml`}
          reminder={moodOf(meMl) === 'thirsty' ? 'Time for a sip' : null}
        >
          <PandaJar
            id="onb-me"
            outfit="classic"
            remaining={100 - pct(meMl)}
            width={pandaWidth}
            phase={phase}
            sipKey={meSip}
            mood={moodOf(meMl)}
            gesture={giggle}
          />
        </MiniPhone>
        <Text style={styles.who}>Alex&apos;s phone</Text>
        <SipButton label="Alex drank" onPress={theirs} />
      </Animated.View>
    </View>
  );
}

function SipButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.sip}>
      <Text style={styles.sipText}>{label}</Text>
    </PressableScale>
  );
}

/** One phone on its home screen with the panda widget, a toast and a reminder. */
function MiniPhone({
  width,
  colors,
  toast,
  badge,
  caption,
  reminder,
  children,
}: {
  width: number;
  colors: [string, string, string];
  toast: Toast | null;
  badge?: boolean;
  caption: string;
  reminder: string | null;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.phone, { width }]}>
      <View style={styles.screen}>
        <Backdrop colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={styles.statusBar}>
          <Text style={styles.clock}>9:41</Text>
          <View style={styles.island} />
          <Text style={styles.clock}>100%</Text>
        </View>

        <View style={styles.toastSlot}>
          {toast ? (
            <Animated.View
              key={toast.key}
              entering={FadeInDown.duration(320)}
              exiting={FadeOutUp.duration(220)}
              style={styles.toast}
            >
              <Text style={styles.toastText} numberOfLines={1}>
                {toast.text}
              </Text>
            </Animated.View>
          ) : null}
        </View>

        <View style={styles.stage}>{children}</View>
        <Text style={styles.caption} numberOfLines={1}>
          {caption}
        </Text>
        <View style={styles.reminderSlot}>
          {reminder ? (
            <Animated.View entering={FadeIn.duration(260)} exiting={FadeOut.duration(200)} style={styles.reminder}>
              <Text style={styles.reminderText}>{reminder}</Text>
            </Animated.View>
          ) : null}
        </View>
        {badge ? (
          <Animated.View entering={ZoomIn.duration(300)} style={styles.tick}>
            <Text style={styles.tickText}>✓</Text>
          </Animated.View>
        ) : null}
      </View>
    </View>
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
  duo: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 18, marginBottom: 14 },
  phone: {
    padding: 5,
    borderRadius: 28,
    backgroundColor: '#0b0b12',
    shadowColor: '#312e81',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  screen: { borderRadius: 23, overflow: 'hidden', paddingBottom: 8 },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  clock: font('bold', 9, { color: palette.ink }),
  island: { width: 44, height: 12, borderRadius: 7, backgroundColor: '#000' },
  toastSlot: { height: 30, marginTop: 6, marginHorizontal: 8, justifyContent: 'center' },
  toast: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: 'rgba(255,255,255,0.94)',
    alignItems: 'center',
  },
  toastText: font('extrabold', 10.5, { color: palette.ink }),
  stage: { alignItems: 'center', marginTop: 2 },
  caption: { ...font('extrabold', 11, { color: palette.ink }), textAlign: 'center', marginTop: 2 },
  reminderSlot: { height: 22, marginTop: 4, alignItems: 'center', justifyContent: 'center' },
  reminder: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: '#e0f2fe' },
  reminderText: font('extrabold', 10, { color: '#0369a1' }),
  who: { ...font('bold', 11, { color: palette.grey600 }), textAlign: 'center', marginTop: 8 },
  sip: {
    alignSelf: 'center',
    marginTop: 6,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#0ea5e9',
  },
  sipText: font('extrabold', 12, { color: palette.white }),
  tick: {
    position: 'absolute',
    top: 4,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: palette.green500,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: palette.white,
  },
  tickText: font('extrabold', 11, { color: palette.white }),
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

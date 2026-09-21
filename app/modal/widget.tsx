import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ModalHeader } from '@/components/ModalHeader';
import { Card, PressableScale, PrimaryButton, Screen, SectionLabel } from '@/components/ui';
import { isWidgetSupported, placedWidgetCount } from '@/services/partnerWidget';
import { font, text } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

/**
 * Adding the home-screen widget.
 *
 * A home-screen widget is placed by the launcher, not by the app — Android has
 * no API that lets an app drop one onto the home screen on its own, and the one
 * that exists (`requestPinAppWidget`) is launcher-dependent and silently
 * unsupported on many devices. So this screen does the only honest thing: it
 * shows what the widget looks like, gives the exact gesture, and then tells the
 * athlete whether it worked by counting the instances they actually placed.
 *
 * That count is the whole reason this screen is worth having. Without it the
 * instructions have to hedge — "you may need to…" — and hedged instructions are
 * what make a feature feel undiscoverable.
 */
export default function WidgetSetupScreen() {
  const router = useRouter();
  const supported = isWidgetSupported();
  const [placed, setPlaced] = useState<number | null>(null);

  /* Re-checked on mount and whenever the athlete comes back from the home
     screen, which is the moment the answer changes. */
  useEffect(() => {
    let cancelled = false;
    const check = () => {
      void placedWidgetCount().then((n) => {
        if (!cancelled) setPlaced(n);
      });
    };
    check();
    const timer = setInterval(check, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <Screen>
      <ModalHeader title="Home screen widget" onBack={() => router.back()} />

      {/* A preview, not a screenshot: it is the same numbers the real widget
          draws, so it cannot drift from what gets placed. */}
      <Animated.View entering={FadeInDown.duration(320)}>
        <View style={styles.preview}>
          <Text style={styles.previewEyebrow}>PARTNER</Text>
          <Text style={styles.previewHeadline}>You both trained today</Text>
          <View style={styles.previewStats}>
            <PreviewStat value="4" label="Sam" tint={palette.purple500} />
            <PreviewStat value="5" label="You" tint={palette.green600} />
            <PreviewStat value="3" label="Together" tint={palette.amber800} />
          </View>
        </View>
      </Animated.View>

      {!supported ? (
        /* Honest rather than hopeful. iOS needs a WidgetKit extension that this
           build does not ship, and saying "coming soon" to someone who cannot
           have it is worse than saying what is true. */
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Not available on this device</Text>
          <Text style={[text.caption, styles.cardBody]}>
            {Platform.OS === 'ios'
              ? 'The home screen widget is Android-only for now. Your partner card is still on the Home tab.'
              : 'This build does not include the widget. Update the app to add it to your home screen.'}
          </Text>
        </Card>
      ) : placed && placed > 0 ? (
        <Card style={[styles.card, styles.cardDone]}>
          <Text style={styles.cardTitle}>
            {placed === 1 ? 'Widget added' : `${placed} widgets added`}
          </Text>
          <Text style={[text.caption, styles.cardBody]}>
            It updates whenever you open RepChamp, and shows a reminder to open the app if the
            numbers get more than half a day old.
          </Text>
        </Card>
      ) : (
        <>
          <SectionLabel>HOW TO ADD IT</SectionLabel>
          <Card style={styles.card}>
            <Step n={1} text="Press and hold an empty space on your home screen." />
            <Step n={2} text="Tap Widgets." />
            <Step n={3} text="Find RepChamp and drag the partner card where you want it." />
            <Text style={[text.caption, styles.cardBody]}>
              This screen will confirm as soon as it is placed.
            </Text>
          </Card>
        </>
      )}

      <SectionLabel>WHAT IT SHOWS</SectionLabel>
      <Card style={styles.card}>
        <Text style={[text.caption, styles.cardBody]}>
          Which days each of you trained this week, and how many you shared. Your partner&rsquo;s
          training days sync to your bond; their reps and movements stay on their own phone, so the
          widget never shows them.
        </Text>
      </Card>

      {supported && !placed ? (
        <PressableScale
          onPress={() => void Linking.openSettings()}
          accessibilityRole="button"
          accessibilityLabel="Open system settings"
          style={styles.secondaryHit}
        >
          <Text style={styles.secondaryText}>Widget not in the list? Open settings</Text>
        </PressableScale>
      ) : null}

      <PrimaryButton
        label="Done"
        onPress={() => router.back()}
        style={{ marginTop: 16 }}
      />
    </Screen>
  );
}

function PreviewStat({ value, label, tint }: { value: string; label: string; tint: string }) {
  return (
    <View style={styles.previewStat}>
      <Text style={[styles.previewValue, { color: tint }]}>{value}</Text>
      <Text style={styles.previewLabel}>{label}</Text>
    </View>
  );
}

function Step({ n, text: body }: { n: number; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNum}>
        <Text style={styles.stepNumText}>{n}</Text>
      </View>
      <Text style={styles.stepText}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  preview: {
    backgroundColor: palette.white,
    borderRadius: radius['4xl'],
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
    marginBottom: 20,
  },
  previewEyebrow: { ...font('extrabold', 10, { color: palette.grey600 }), letterSpacing: 1.2 },
  previewHeadline: { ...font('extrabold', 16, { color: palette.ink }), marginTop: 4 },
  previewStats: { flexDirection: 'row', marginTop: 12 },
  previewStat: { flex: 1, alignItems: 'center' },
  previewValue: { ...font('extrabold', 20) },
  previewLabel: { ...font('semibold', 9.5, { color: palette.grey600 }), marginTop: 2 },
  card: { padding: 16, marginBottom: 16 },
  cardDone: { borderWidth: 1, borderColor: palette.green200 },
  cardTitle: { ...font('extrabold', 15, { color: palette.ink }), marginBottom: 6 },
  cardBody: { color: palette.grey600, lineHeight: 18 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: palette.green50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: { ...font('extrabold', 11, { color: palette.green700 }) },
  stepText: { ...font('semibold', 13, { color: palette.ink }), flex: 1, lineHeight: 18 },
  secondaryHit: { alignItems: 'center', paddingVertical: 12 },
  secondaryText: { ...font('bold', 12, { color: palette.grey600 }) },
});

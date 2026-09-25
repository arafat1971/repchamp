import { useRouter } from 'expo-router';
import { LinearGradient as Backdrop } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { ModalHeader } from '@/components/ModalHeader';
import { WidgetPublishDebug } from '@/components/debug/WidgetPublishDebug';
import { Card, Divider, PressableScale, PrimaryButton, Screen, SectionLabel, Toggle } from '@/components/ui';
import {
  SAMPLE_PREVIEW,
  THEME_SWATCH,
  WidgetPreview,
  type WidgetPreviewData,
} from '@/components/widget/WidgetPreview';
import {
  partnerGoalToday,
  partnerLayersToday,
  partnerLastDrinkToday,
  partnerRepsToday,
  partnerStepsToday,
  partnerWaterToday,
} from '@/domain/couple';
import { dayKey } from '@/domain/progression';
import {
  WATER_WIDGET_LIVE_MS,
  WIDGET_THEMES,
  buildWaterWidgetSnapshot,
  repsOnDay,
  type WidgetStyle,
  type WidgetTheme,
} from '@/domain/waterWidget';
import { lightImpactHaptic, selectionHaptic } from '@/lib/feedback';
import { isWidgetSupported, placedWidgetCount, requestPinWidget } from '@/services/partnerWidget';
import { selectTodayMl, useHydrationStore } from '@/state/hydrationStore';
import { useProfileStore } from '@/state/profileStore';
import { useCouple } from '@/state/useCouple';
import { useStepsToday } from '@/state/useStepsToday';
import { useWidgetStyleStore } from '@/state/widgetStyleStore';
import { font, text } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

/**
 * Widget studio: the "Partner today" home-screen widget, previewed live and
 * styled here.
 *
 * The preview is the real thing drawn in the app — same rings, bear and rows,
 * fed with the partner's actual numbers when paired — so every switch shows
 * its effect before it reaches the home screen, and the home screen follows
 * within a moment (Home republishes the widget whenever the style changes).
 *
 * Adding it is one tap where the launcher supports pinning: the system's own
 * "Add to home screen" sheet. Where it does not, the gesture is shown instead,
 * and either way the screen confirms by counting the widgets actually placed.
 */
export default function WidgetStudioScreen() {
  const router = useRouter();
  const [stageWidth, setStageWidth] = useState(0);
  const supported = isWidgetSupported();
  const style = useWidgetStyleStore();
  const preview = usePreviewData();

  const [placed, setPlaced] = useState<number | null>(null);
  const [pinFailed, setPinFailed] = useState(false);

  /* Re-checked while the screen is open: the answer changes the moment the
     athlete drops the widget on the home screen and comes back. */
  useEffect(() => {
    let cancelled = false;
    const check = () => {
      void placedWidgetCount('water').then((n) => {
        if (!cancelled) setPlaced(n);
      });
    };
    check();
    const timer = setInterval(check, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const add = async () => {
    lightImpactHaptic();
    const shown = await requestPinWidget('water');
    setPinFailed(!shown);
  };

  const set = (patch: Partial<WidgetStyle>) => {
    selectionHaptic();
    style.setStyle(patch);
  };

  const isPlaced = (placed ?? 0) > 0;

  return (
    <Screen>
      <ModalHeader title="Widget studio" onBack={() => router.back()} />

      {/* The stage: the widget floating on a home-screen wallpaper, so it
          reads as the thing that will sit on the phone, not as a card. */}
      <Animated.View
        entering={FadeInDown.duration(360)}
        style={styles.stage}
        onLayout={(e) => setStageWidth(e.nativeEvent.layout.width)}
      >
        <Backdrop
          colors={['#312E81', '#6D28D9', '#DB2777']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.stageIcons}>
          {['#FDE68A', '#A7F3D0', '#BFDBFE', '#FBCFE8'].map((c) => (
            <View key={c} style={[styles.stageIcon, { backgroundColor: c }]} />
          ))}
        </View>
        {stageWidth > 0 ? (
          <Animated.View layout={LinearTransition.duration(260)}>
            <WidgetPreview style={style} data={preview} width={Math.min(stageWidth - 28, 380)} />
          </Animated.View>
        ) : null}
        {isPlaced ? (
          <Animated.View entering={FadeIn.duration(300)} style={styles.placedBadge}>
            <Text style={styles.placedText}>✓ On your home screen</Text>
          </Animated.View>
        ) : null}
      </Animated.View>

      {!supported ? (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Not available on this device</Text>
          <Text style={[text.caption, styles.cardBody]}>
            {Platform.OS === 'ios'
              ? 'The home screen widget is Android-only for now. Your partner’s day is on the Home tab.'
              : 'This build does not include the widget. Update the app to add it to your home screen.'}
          </Text>
        </Card>
      ) : isPlaced ? (
        <Text style={styles.lede}>
          Changes here reach your home screen in a moment. It moves live whenever your partner drinks, walks or
          trains.
        </Text>
      ) : (
        <>
          <PrimaryButton label="Add to home screen" onPress={() => void add()} style={styles.cta} />
          {pinFailed ? (
            <Card style={styles.card}>
              <Text style={styles.cardTitle}>Add it by hand</Text>
              <Step n={1} text="Press and hold an empty space on your home screen." />
              <Step n={2} text="Tap Widgets, then find RepChamp." />
              <Step n={3} text="Drag Partner today onto your home screen." />
              <Text style={[text.caption, styles.cardBody]}>This screen confirms as soon as it’s placed.</Text>
            </Card>
          ) : (
            <Text style={styles.lede}>One tap — your phone asks where to put it.</Text>
          )}
        </>
      )}

      <SectionLabel>LOOK</SectionLabel>
      <View style={styles.themes}>
        {WIDGET_THEMES.map((theme) => (
          <ThemeTile key={theme} theme={theme} selected={style.theme === theme} onPress={() => set({ theme })} />
        ))}
      </View>

      <SectionLabel>WHAT IT SHOWS</SectionLabel>
      <Card style={styles.group}>
        <SwitchRow
          emoji="💧"
          title="Water"
          subtitle="Their bear and the inner ring — always on"
          value
          locked
        />
        <Divider />
        <SwitchRow
          emoji="👟"
          title="Steps ring"
          subtitle="Their steps toward 8,000"
          value={style.showSteps}
          onChange={(v) => set({ showSteps: v })}
        />
        <Divider />
        <SwitchRow
          emoji="💪"
          title="Reps ring"
          subtitle="Their reps today and main movement"
          value={style.showReps}
          onChange={(v) => set({ showReps: v })}
        />
        <Divider />
        <SwitchRow
          emoji="⚔️"
          title="Compare with me"
          subtitle="Your number beside theirs on every row"
          value={style.showMine}
          onChange={(v) => set({ showMine: v })}
        />
        <Divider />
        <SwitchRow
          emoji="✨"
          title="Live motion"
          subtitle="Glint, bubbles and sparkles after they’re active"
          value={style.motion}
          onChange={(v) => set({ motion: v })}
        />
      </Card>

      <PressableScale
        onPress={() => {
          selectionHaptic();
          style.reset();
        }}
        accessibilityRole="button"
        accessibilityLabel="Reset the widget to its default look"
        style={styles.secondaryHit}
      >
        <Text style={styles.secondaryText}>Reset to default</Text>
      </PressableScale>

      {supported ? (
        <>
          <SectionLabel>ALSO FOR YOUR HOME SCREEN</SectionLabel>
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>Partner’s week</Text>
            <Text style={[text.caption, styles.cardBody]}>
              Who trained which days this week, and the days you shared.
            </Text>
            <PressableScale
              onPress={() => void requestPinWidget('partner').then((ok) => setPinFailed(!ok))}
              accessibilityRole="button"
              accessibilityLabel="Add the partner's week widget"
              style={styles.inlineAdd}
            >
              <Text style={styles.inlineAddText}>＋ Add</Text>
            </PressableScale>
          </Card>
          {pinFailed ? (
            <PressableScale
              onPress={() => void Linking.openSettings()}
              accessibilityRole="button"
              accessibilityLabel="Open system settings"
              style={styles.secondaryHit}
            >
              <Text style={styles.secondaryText}>Widget not in the list? Open settings</Text>
            </PressableScale>
          ) : null}
        </>
      ) : null}

      <WidgetPublishDebug />

      <PrimaryButton label="Done" onPress={() => router.back()} style={{ marginTop: 8 }} />
    </Screen>
  );
}

/**
 * The partner's real day, through the same builder the widget uses; the
 * sample when there is no partner yet.
 */
function usePreviewData(): WidgetPreviewData {
  const couple = useCouple();
  const today = dayKey();
  const myMl = useHydrationStore((s) => selectTodayMl(s, today));
  const sessions = useProfileStore((s) => s.sessions);
  const { steps } = useStepsToday();
  const mySteps = steps.status === 'ready' ? steps.steps : null;

  return useMemo(() => {
    const partner = couple.partner;
    const name = partner?.displayName?.trim();
    if (!couple.paired || !partner || !name) return SAMPLE_PREVIEW;
    const reps = partnerRepsToday(partner, today);
    const snap = buildWaterWidgetSnapshot({
      name,
      day: today,
      ml: partnerWaterToday(partner, today) ?? 0,
      goalMl: partnerGoalToday(partner, today),
      layers: partnerLayersToday(partner, today),
      last: partnerLastDrinkToday(partner, today),
      steps: partnerStepsToday(partner, today),
      reps: reps.reps,
      topExercise: reps.topEx,
      trainedAt: reps.trainedAt,
      me: { ml: myMl, steps: mySteps, reps: repsOnDay(sessions, today).reps },
    });
    return {
      name: snap.name,
      water: { value: snap.amount, goal: snap.goal, you: snap.meWater, pct: snap.pct },
      steps: { value: snap.steps, goal: snap.stepsGoal, you: snap.meSteps, pct: snap.stepsPct },
      reps: { value: snap.reps, goal: snap.repsDetail, you: snap.meReps, pct: snap.repsPct },
      footer: snap.footer,
      live: snap.activeAt > 0 && snap.updatedAt - snap.activeAt <= WATER_WIDGET_LIVE_MS,
    };
  }, [couple.paired, couple.partner, today, myMl, sessions, mySteps]);
}

const THEME_LABEL: Record<WidgetTheme, string> = {
  auto: 'Auto',
  light: 'Light',
  dark: 'Dark',
  ocean: 'Ocean',
};

function ThemeTile({ theme, selected, onPress }: { theme: WidgetTheme; selected: boolean; onPress: () => void }) {
  const [a, b] = THEME_SWATCH[theme];
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${THEME_LABEL[theme]} theme`}
      style={[styles.tile, selected && styles.tileOn]}
    >
      <View style={styles.swatch}>
        {theme === 'auto' ? (
          <View style={styles.split}>
            <View style={{ flex: 1, backgroundColor: a }} />
            <View style={{ flex: 1, backgroundColor: b }} />
          </View>
        ) : (
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id={`sw-${theme}`} x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={a} />
                <Stop offset="1" stopColor={b} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill={`url(#sw-${theme})`} />
          </Svg>
        )}
        <View style={styles.swatchDots}>
          <View style={[styles.dot, { backgroundColor: '#FF2D55' }]} />
          <View style={[styles.dot, { backgroundColor: '#30D158' }]} />
          <View style={[styles.dot, { backgroundColor: '#32ADE6' }]} />
        </View>
      </View>
      <Text style={[styles.tileLabel, selected && styles.tileLabelOn]}>{THEME_LABEL[theme]}</Text>
    </PressableScale>
  );
}

function SwitchRow({
  emoji,
  title,
  subtitle,
  value,
  onChange,
  locked,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  value: boolean;
  onChange?: (v: boolean) => void;
  locked?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowEmoji}>{emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub}>{subtitle}</Text>
      </View>
      {locked ? <Text style={styles.lock}>Always</Text> : <Toggle value={value} label={title} onChange={(v) => onChange?.(v)} />}
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
  stage: {
    borderRadius: radius['4xl'],
    overflow: 'hidden',
    alignItems: 'center',
    paddingTop: 44,
    paddingBottom: 34,
    paddingHorizontal: 18,
    marginBottom: 16,
  },
  stageIcons: { position: 'absolute', top: 14, left: 20, flexDirection: 'row', gap: 10, opacity: 0.55 },
  stageIcon: { width: 22, height: 22, borderRadius: 7 },
  placedBadge: {
    position: 'absolute',
    bottom: 8,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  placedText: font('extrabold', 11, { color: palette.green600 }),
  cta: { marginBottom: 8 },
  lede: { ...font('semibold', 12.5, { color: palette.grey600 }), textAlign: 'center', marginBottom: 18 },
  themes: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  tile: {
    flex: 1,
    alignItems: 'center',
    padding: 6,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: palette.white,
  },
  tileOn: { borderColor: palette.green500 },
  swatch: {
    width: '100%',
    height: 46,
    borderRadius: 11,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  split: { flex: 1, flexDirection: 'row' },
  swatchDots: { position: 'absolute', bottom: 6, left: 7, flexDirection: 'row', gap: 3 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  tileLabel: { ...font('bold', 11.5, { color: palette.grey600 }), marginTop: 5 },
  tileLabelOn: { color: palette.ink },
  group: { paddingVertical: 4, paddingHorizontal: 14, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  rowEmoji: { fontSize: 18, width: 24, textAlign: 'center' },
  rowTitle: font('extrabold', 14, { color: palette.ink }),
  rowSub: { ...font('semibold', 10.5, { color: palette.grey600 }), marginTop: 1 },
  lock: font('bold', 11, { color: palette.grey600 }),
  card: { padding: 16, marginBottom: 12 },
  cardTitle: { ...font('extrabold', 15, { color: palette.ink }), marginBottom: 6 },
  cardBody: { color: palette.grey600, lineHeight: 18 },
  inlineAdd: {
    position: 'absolute',
    right: 14,
    top: 14,
    backgroundColor: palette.green500,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  inlineAddText: font('extrabold', 12, { color: palette.white }),
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: palette.green50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: font('extrabold', 11, { color: palette.green700 }),
  stepText: { ...font('semibold', 13, { color: palette.ink }), flex: 1, lineHeight: 18 },
  secondaryHit: { alignItems: 'center', paddingVertical: 12 },
  secondaryText: font('bold', 12, { color: palette.grey600 }),
});

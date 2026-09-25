import { useRouter } from 'expo-router';
import { LinearGradient as Backdrop } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { ModalHeader } from '@/components/ModalHeader';
import { WidgetPublishDebug } from '@/components/debug/WidgetPublishDebug';
import { Card, Divider, PressableScale, PrimaryButton, Screen, SectionLabel, Toggle } from '@/components/ui';
import { LOOKS, MINE, SAMPLE_SNAPSHOT, THEIRS, WidgetPreview } from '@/components/widget/WidgetPreview';
import {
  partnerGoalToday,
  partnerLayersToday,
  partnerLastDrinkToday,
  partnerRepsToday,
  partnerStepsToday,
  partnerWaterToday,
} from '@/domain/couple';
import { dayKey } from '@/domain/progression';
import { drinkLayers } from '@/domain/drinkKinds';
import { duoStreak } from '@/domain/duoStreak';
import { weekWrap } from '@/domain/week';
import { enableRealWeather, refreshWeather } from '@/services/weather';
import {
  WARDROBE,
  WIDGET_LAYOUTS,
  WIDGET_SURFACES,
  type WidgetSurface,
  nextOutfit,
  WIDGET_THEMES,
  buildWaterWidgetSnapshot,
  repsOnDay,
  type WaterWidgetSnapshot,
  type WidgetLayout,
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
import { useDuoStreakStore } from '@/state/duoStreakStore';
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
        {/* A warm, light wallpaper: every theme — Sunset most of all — has to
            stand off it the way it will off a real home screen. */}
        <Backdrop
          colors={['#FEF3C7', '#FBCFE8', '#C7D2FE']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.stageIcons}>
          {['#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF'].map((c, i) => (
            <View key={i} style={[styles.stageIcon, { backgroundColor: c }]} />
          ))}
        </View>
        {stageWidth > 0 ? (
          <Animated.View layout={LinearTransition.duration(260)}>
            <WidgetPreview style={style} snap={preview} width={Math.min(stageWidth - 28, 380)} />
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

      <SectionLabel>LAYOUT</SectionLabel>
      <View style={[styles.themes, { gap: 8 }]}>
        {WIDGET_LAYOUTS.map((layout) => (
          <LayoutTile key={layout} layout={layout} selected={style.layout === layout} onPress={() => set({ layout })} />
        ))}
      </View>

      {style.layout === 'scene' ? (
        <>
          <SectionLabel>SURFACE</SectionLabel>
          <View style={styles.themes}>
            {WIDGET_SURFACES.map((surface) => (
              <SurfaceTile key={surface} surface={surface} selected={style.surface === surface} onPress={() => set({ surface })} />
            ))}
          </View>
        </>
      ) : null}

      <SectionLabel>LOOK</SectionLabel>
      {style.layout === 'scene' ? (
        <Text style={styles.lookNote}>
          The scene follows the real sky and calendar — dawn to starlight, spring blossom to winter snow, and your
          bond’s monthly anniversary. Themes dress Duo and Rings; Glass makes them liquid glass too.
        </Text>
      ) : null}
      <View style={styles.themes}>
        {WIDGET_THEMES.map((theme) => (
          <ThemeTile key={theme} theme={theme} selected={style.theme === theme} onPress={() => set({ theme })} />
        ))}
      </View>

      <SectionLabel>THIS WEEK</SectionLabel>
      <WeekCard name={preview.name} />

      <SectionLabel>WARDROBE</SectionLabel>
      <Wardrobe />

      <SectionLabel>WHAT IT SHOWS</SectionLabel>
      <Card style={styles.group}>
        <SwitchRow
          emoji="💧"
          title="Water"
          subtitle="Both bears, and the heart of every layout"
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
          emoji="🌦️"
          title="Real weather"
          subtitle="Rain, snow and sun where you are — uses a rough area only"
          value={style.weather}
          onChange={(v) => {
            if (!v) {
              set({ weather: false });
              return;
            }
            void enableRealWeather().then((ok) => {
              set({ weather: ok });
              if (ok) void refreshWeather(true);
            });
          }}
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
function usePreviewData(): WaterWidgetSnapshot {
  const couple = useCouple();
  const today = dayKey();
  const myMl = useHydrationStore((s) => selectTodayMl(s, today));
  const myGoal = useHydrationStore((s) => s.goalMl);
  const drinks = useHydrationStore((s) => s.drinks);
  const sessions = useProfileStore((s) => s.sessions);
  const { steps } = useStepsToday();
  const mySteps = steps.status === 'ready' ? steps.steps : null;

  return useMemo(() => {
    const partner = couple.partner;
    const name = partner?.displayName?.trim();
    if (!couple.paired || !partner || !name) return SAMPLE_SNAPSHOT;
    const reps = partnerRepsToday(partner, today);
    return buildWaterWidgetSnapshot({
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
      me: {
        ml: myMl,
        steps: mySteps,
        reps: repsOnDay(sessions, today).reps,
        goalMl: myGoal,
        layers: drinkLayers(drinks.filter((d) => d.day === today)).map((l) => ({ k: l.kind, ml: l.ml })),
      },
    });
  }, [couple.paired, couple.partner, today, myMl, myGoal, drinks, sessions, mySteps]);
}

/**
 * The week together, Monday to today: each day's water for both side by
 * side, a gold dot on the days both bears were full, and who is ahead.
 */
function WeekCard({ name }: { name: string }) {
  const history = useDuoStreakStore((s) => s.week);
  const both = useDuoStreakStore((s) => s.days);
  const wrap = weekWrap(history, both, dayKey());
  const peak = Math.max(2000, ...wrap.days.map((d) => Math.max(d.them, d.me)));
  const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  return (
    <Card style={styles.card}>
      <Text style={styles.cardTitle}>
        {wrap.mine === wrap.theirs
          ? `Level this week — ${wrap.mine} days each`
          : wrap.mine > wrap.theirs
            ? `You lead the week ${wrap.mine}–${wrap.theirs}`
            : `${name} leads the week ${wrap.theirs}–${wrap.mine}`}
      </Text>
      <Text style={[text.caption, styles.cardBody]}>
        {wrap.rainbows > 0 ? `🌈 ${wrap.rainbows} ${wrap.rainbows === 1 ? 'day' : 'days'} both bears were full` : 'Fill both bears on the same day for a rainbow 🌈'}
      </Text>
      <View style={styles.week}>
        {labels.map((l, i) => {
          const d = wrap.days[i];
          return (
            <View key={i} style={styles.weekCol}>
              <View style={styles.weekBars}>
                <View style={[styles.weekBar, { height: `${d ? (d.them / peak) * 100 : 0}%`, backgroundColor: THEIRS }]} />
                <View style={[styles.weekBar, { height: `${d ? (d.me / peak) * 100 : 0}%`, backgroundColor: MINE }]} />
              </View>
              <Text style={[styles.weekDot, { opacity: d?.both ? 1 : 0 }]}>●</Text>
              <Text style={styles.weekLabel}>{l}</Text>
            </View>
          );
        })}
      </View>
      <View style={styles.legend}>
        <View style={[styles.legendSwatch, { backgroundColor: THEIRS }]} />
        <Text style={styles.legendText}>{name}</Text>
        <View style={[styles.legendSwatch, { backgroundColor: MINE, marginLeft: 12 }]} />
        <Text style={styles.legendText}>You</Text>
      </View>
    </Card>
  );
}

/**
 * What the shared streak has dressed the bears in, and what it is working
 * toward — earned items in colour, the rest waiting with the days to go.
 */
function Wardrobe() {
  const days = useDuoStreakStore((s) => s.days);
  const streak = duoStreak(days, dayKey());
  const next = nextOutfit(streak);
  return (
    <Card style={styles.card}>
      <Text style={styles.cardTitle}>
        {streak > 0 ? `🔥 ${streak}-day streak together` : 'Fill both bears to start a streak'}
      </Text>
      <Text style={[text.caption, styles.cardBody]}>
        {next
          ? `${next.days - streak} more ${next.days - streak === 1 ? 'day' : 'days'} of both bears full unlocks the ${next.label.toLowerCase()} ${next.emoji}`
          : 'Every outfit earned — your bears are fully dressed 🎉'}
      </Text>
      <View style={styles.wardrobe}>
        {WARDROBE.map((item) => {
          const earned = streak >= item.days;
          return (
            <View key={item.id} style={[styles.outfit, earned && styles.outfitOn]}>
              <Text style={[styles.outfitEmoji, !earned && styles.outfitLocked]}>{item.emoji}</Text>
              <Text style={[styles.outfitLabel, earned && { color: palette.ink }]}>{item.label}</Text>
              <Text style={styles.outfitDays}>{earned ? 'Earned' : `${item.days} days`}</Text>
            </View>
          );
        })}
      </View>
      {next ? (
        <View style={styles.meter}>
          <View style={[styles.meterFill, { width: `${Math.min(100, (streak / next.days) * 100)}%` }]} />
        </View>
      ) : null}
    </Card>
  );
}

const SURFACE_LABEL: Record<WidgetSurface, { title: string; sub: string }> = {
  glass: { title: 'Glass', sub: 'Liquid glass pane' },
  float: { title: 'Float', sub: 'Just the island' },
  sky: { title: 'Sky', sub: 'Its own sky' },
};

/** A small picture of each surface, on a wallpaper-like swatch. */
function SurfaceTile({ surface, selected, onPress }: { surface: WidgetSurface; selected: boolean; onPress: () => void }) {
  const label = SURFACE_LABEL[surface];
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label.title} surface`}
      style={[styles.tile, styles.layoutTile, selected && styles.tileOn]}
    >
      <Backdrop colors={['#1E1B4B', '#7C3AED', '#F472B6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.sketch}>
        <View
          style={[
            styles.surfacePane,
            surface === 'glass' && styles.surfaceGlass,
            surface === 'sky' && styles.surfaceSky,
          ]}
        >
          <View style={styles.surfaceIsland} />
        </View>
      </Backdrop>
      <Text style={[styles.tileLabel, selected && styles.tileLabelOn]}>{label.title}</Text>
      <Text style={styles.tileSub}>{label.sub}</Text>
    </PressableScale>
  );
}

const LAYOUT_LABEL: Record<WidgetLayout, { title: string; sub: string }> = {
  scene: { title: 'Scene', sub: 'Under the real sky' },
  duo: { title: 'Duo', sub: 'You vs them' },
  rings: { title: 'Rings', sub: 'Their day' },
};

/** A tiny sketch of each layout, so the choice is visual, not a word. */
function LayoutTile({ layout, selected, onPress }: { layout: WidgetLayout; selected: boolean; onPress: () => void }) {
  const label = LAYOUT_LABEL[layout];
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label.title} layout`}
      style={[styles.tile, styles.layoutTile, selected && styles.tileOn]}
    >
      <Backdrop
        colors={layout === 'scene' ? ['#38BDF8', '#BAE6FD'] : ['#4C1D95', '#BE185D']}
        start={{ x: 0, y: 0 }}
        end={layout === 'scene' ? { x: 0, y: 1 } : { x: 1, y: 1 }}
        style={styles.sketch}
      >
        {layout === 'scene' ? (
          <View style={{ flex: 1, justifyContent: 'flex-end' }}>
            <View style={styles.sketchSun} />
            <View style={styles.sketchRow}>
              <View style={[styles.sketchBear, { backgroundColor: '#EEF0FF' }]} />
              <View style={styles.sketchRope}>
                <View style={styles.sketchFlag} />
              </View>
              <View style={[styles.sketchBear, { backgroundColor: '#FFF0F5' }]} />
            </View>
            <View style={styles.sketchHill} />
          </View>
        ) : layout === 'duo' ? (
          <View style={styles.sketchRow}>
            <View style={[styles.sketchBear, { backgroundColor: '#C7D2FE' }]} />
            <View style={{ flex: 1, gap: 4, marginHorizontal: 6 }}>
              {[0.62, 0.4, 0.75].map((w, i) => (
                <View key={i} style={[styles.sketchTug, { backgroundColor: MINE }]}>
                  <View style={{ width: `${w * 100}%`, height: '100%', backgroundColor: THEIRS }} />
                </View>
              ))}
            </View>
            <View style={[styles.sketchBear, { backgroundColor: '#FBCFE8' }]} />
          </View>
        ) : (
          <View style={styles.sketchRow}>
            <View style={styles.sketchRing}>
              <View style={styles.sketchRingInner} />
            </View>
            <View style={{ flex: 1, gap: 4, marginLeft: 8 }}>
              {['#7DD3FC', '#86EFAC', '#FDA4AF'].map((c) => (
                <View key={c} style={[styles.sketchLine, { backgroundColor: c }]} />
              ))}
            </View>
          </View>
        )}
      </Backdrop>
      <Text style={[styles.tileLabel, selected && styles.tileLabelOn]}>{label.title}</Text>
      <Text style={styles.tileSub}>{label.sub}</Text>
    </PressableScale>
  );
}

const THEME_LABEL: Record<WidgetTheme, string> = {
  glass: 'Glass',
  sunset: 'Sunset',
  auto: 'Auto',
  light: 'Light',
  dark: 'Dark',
  ocean: 'Ocean',
};

function ThemeTile({ theme, selected, onPress }: { theme: WidgetTheme; selected: boolean; onPress: () => void }) {
  const bg = LOOKS[theme].bg;
  const a = theme === 'auto' ? '#FFFFFF' : bg[0];
  const b = theme === 'auto' ? '#1C1C1E' : bg[bg.length - 1]!;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${THEME_LABEL[theme]} theme`}
      style={[styles.tile, selected && styles.tileOn]}
    >
      <View style={styles.swatch}>
        {theme === 'glass' ? (
          <Backdrop colors={['#1E1B4B', '#7C3AED', '#F472B6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
            <View style={[styles.surfacePane, styles.surfaceGlass, { margin: 5 }]} />
          </Backdrop>
        ) : theme === 'auto' ? (
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
      <Text style={[styles.tileLabel, selected && styles.tileLabelOn]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {THEME_LABEL[theme]}
      </Text>
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
  stageIcons: { position: 'absolute', top: 14, left: 20, flexDirection: 'row', gap: 10, opacity: 0.9 },
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
  layoutTile: { paddingBottom: 8 },
  sketch: { width: '100%', height: 58, borderRadius: 11, justifyContent: 'center', paddingHorizontal: 8 },
  sketchRow: { flexDirection: 'row', alignItems: 'center' },
  sketchSun: { position: 'absolute', top: 6, right: 22, width: 12, height: 12, borderRadius: 6, backgroundColor: '#FDE047' },
  sketchRope: { flex: 1, height: 2, backgroundColor: '#92400E', marginHorizontal: 4, alignItems: 'center' },
  sketchFlag: { width: 6, height: 6, backgroundColor: '#EF4444', marginTop: -6, marginLeft: -8 },
  sketchHill: { height: 12, backgroundColor: '#22C55E', marginHorizontal: -8, marginBottom: -1, borderTopLeftRadius: 30, borderTopRightRadius: 30 },
  sketchBear: { width: 16, height: 22, borderRadius: 8 },
  sketchTug: { height: 4, borderRadius: 2, overflow: 'hidden' },
  sketchRing: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 4,
    borderColor: '#FDA4AF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sketchRingInner: { width: 18, height: 18, borderRadius: 9, borderWidth: 3, borderColor: '#7DD3FC' },
  sketchLine: { height: 5, borderRadius: 3, width: '80%' },
  tileSub: font('semibold', 10, { color: palette.grey600 }),
  wardrobe: { flexDirection: 'row', gap: 8, marginTop: 12 },
  week: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, height: 110 },
  weekCol: { flex: 1, alignItems: 'center' },
  weekBars: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  weekBar: { width: 8, borderRadius: 4, minHeight: 2 },
  weekDot: { ...font('bold', 9, { color: '#F59E0B' }), marginTop: 3 },
  weekLabel: font('bold', 10.5, { color: palette.grey600 }),
  legend: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  legendSwatch: { width: 10, height: 10, borderRadius: 5, marginRight: 5 },
  legendText: font('semibold', 11, { color: palette.grey600 }),
  outfit: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
  },
  outfitOn: { backgroundColor: '#FEF3C7' },
  outfitEmoji: { fontSize: 26 },
  outfitLocked: { opacity: 0.25 },
  outfitLabel: { ...font('bold', 10.5, { color: palette.grey600 }), marginTop: 4 },
  outfitDays: font('semibold', 9.5, { color: palette.grey600 }),
  meter: { height: 6, borderRadius: 3, backgroundColor: '#F1F5F9', marginTop: 12, overflow: 'hidden' },
  meterFill: { height: '100%', borderRadius: 3, backgroundColor: '#F59E0B' },
  surfacePane: { flex: 1, margin: 6, borderRadius: 10, justifyContent: 'flex-end', alignItems: 'center' },
  surfaceGlass: { backgroundColor: 'rgba(255,255,255,0.22)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.75)' },
  surfaceSky: { backgroundColor: '#38BDF8' },
  surfaceIsland: { width: 38, height: 8, borderRadius: 6, backgroundColor: '#84CC16', marginBottom: 8 },
  lookNote: { ...font('semibold', 11.5, { color: palette.grey600 }), marginTop: -6, marginBottom: 10 },
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

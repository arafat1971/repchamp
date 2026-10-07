import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { PopOnChange } from '@/components/motion';
import { PressableScale } from '@/components/ui';
import { PrimaryButton, Aurora, PulseRing, ScreenHead, springIn } from './ios';
import { Burst } from './Visuals';
import { HABITS, POKES, toggleTick, type HabitId } from '@/domain/ritual';
import { previewCta, previewLine } from '@/domain/togetherPreview';
import { lightImpactHaptic, selectionHaptic, successHaptic } from '@/lib/feedback';
import { font } from '@/theme/typography';
import { palette, radius, surfaceShadow } from '@/theme/tokens';

const PREVIEW_POKES = POKES.slice(0, 3);

/**
 * Onboarding: "Better together".
 *
 * The last thing before the offer, and the reason the app is more than a rep
 * counter. Instead of describing the shared day, the athlete does it: tap a
 * habit and it lights up on a partner card, tap a heart and it floats across.
 * The feeling being earned is *being needed* — a streak for two only grows when
 * both show up — and that two people's days are better when they can see each
 * other's.
 *
 * It is labelled a preview throughout. There is no partner yet and nothing is
 * sent anywhere; the copy says what will happen once they pair, never that it
 * already has. Pairing itself stays on Home, where it can actually be done.
 */
export function TogetherStep({ onNext }: { onNext: () => void }) {
  const [ticks, setTicks] = useState<HabitId[]>([]);
  const [floaters, setFloaters] = useState<{ id: number; e: string }[]>([]);
  const total = HABITS.length;
  const done = ticks.length;

  const tick = useCallback((id: HabitId) => {
    setTicks((t) => {
      const next = toggleTick(t, id);
      if (next.length === HABITS.length) successHaptic();
      else selectionHaptic();
      return next;
    });
  }, []);

  const dropFloater = useCallback((id: number) => setFloaters((all) => all.filter((x) => x.id !== id)), []);

  const poke = useCallback((e: string) => {
    lightImpactHaptic();
    setFloaters((f) => [...f.slice(-4), { id: Date.now() + Math.random(), e }]);
  }, []);

  return (
    <View style={styles.step}>
      <Aurora tint={palette.green400} second={palette.purple400} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <ScreenHead
          eyebrow="BETTER TOGETHER"
          tint={palette.green50}
          title={'Someone will feel it\nwhen you show up'}
          body="Your water, steps and workouts, shared with the one person you choose. Try it: tap a habit below."
        />

        {/* The partner's side: what they will see. */}
        <Animated.View entering={springIn(3)} style={styles.partnerCard}>
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(34,197,94,0.14)', 'rgba(34,197,94,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.partnerTop}>
            <PulseRing size={48} color={palette.green400}>
              <View style={styles.ghost}>
                <Text style={styles.ghostQ}>?</Text>
              </View>
            </PulseRing>
            <View style={{ flex: 1 }}>
              <Text style={styles.partnerName}>Your partner</Text>
              <View style={styles.previewTag}>
                <View style={styles.dot} />
                <Text style={styles.previewTagText}>Preview of their screen</Text>
              </View>
            </View>
            <View style={styles.score}>
              <PopOnChange trigger={done} scale={1.3}>
                <Text style={styles.scoreValue}>{done}</Text>
              </PopOnChange>
              <Text style={styles.scoreOf}>/{total}</Text>
            </View>
          </View>

          <View style={styles.mirrorRow}>
            {HABITS.map((h) => {
              const on = ticks.includes(h.id);
              return (
                <PopOnChange key={h.id} trigger={on ? 1 : 0} scale={1.3}>
                  <View style={[styles.mirrorDot, on && styles.mirrorDotOn]}>
                    <Text style={[styles.mirrorEmoji, !on && { opacity: 0.35 }]}>{h.emoji}</Text>
                  </View>
                </PopOnChange>
              );
            })}
          </View>

          <View style={styles.track}>
            <SpringFill value={done / total} />
          </View>

          {floaters.map((f) => (
            <Floater key={f.id} id={f.id} emoji={f.e} onDone={dropFloater} />
          ))}
          {done === total ? (
            <View style={styles.burstAnchor}>
              <Burst emojis={['🔥', '💚', '✨']} count={10} />
            </View>
          ) : null}
        </Animated.View>

        {/* Your side: the day you'd tick off. */}
        <Text style={styles.sectionLabel}>Your day</Text>
        <View style={styles.grid}>
          {HABITS.map((h) => {
            const on = ticks.includes(h.id);
            return (
              <PressableScale
                key={h.id}
                onPress={() => tick(h.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${h.label}. ${h.hint}`}
                style={styles.habitWrap}
              >
                <View style={[styles.habit, on && styles.habitOn]}>
                  <Text style={styles.habitEmoji}>{h.emoji}</Text>
                  <Text style={styles.habitLabel} numberOfLines={1}>
                    {h.label}
                  </Text>
                  {on ? (
                    <Animated.View entering={ZoomIn.duration(320)} style={styles.check}>
                      <Text style={styles.checkMark}>✓</Text>
                    </Animated.View>
                  ) : null}
                </View>
              </PressableScale>
            );
          })}
        </View>

        <View style={styles.pokeRow}>
          <Text style={styles.pokeLabel}>Send them a little love</Text>
          <View style={styles.pokes}>
            {PREVIEW_POKES.map((e) => (
              <PressableScale
                key={e}
                onPress={() => poke(e)}
                accessibilityRole="button"
                accessibilityLabel={`Send ${e}`}
                style={styles.poke}
              >
                <Text style={{ fontSize: 22 }}>{e}</Text>
              </PressableScale>
            ))}
          </View>
        </View>

        <Text style={styles.line} accessibilityLiveRegion="polite">
          {previewLine(done, total)}
        </Text>
        <Text style={styles.promise}>
          A shared streak only grows when you both show up. Pair from Home whenever you are ready —
          it takes a minute.
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton label={previewCta(done)} onPress={done > 0 ? onNext : () => tick('water')} />
        <PressableScale
          onPress={onNext}
          accessibilityRole="button"
          accessibilityLabel="Maybe later"
          style={styles.skip}
        >
          <Text style={font('extrabold', 14, { color: palette.grey600 })}>Maybe later</Text>
        </PressableScale>
      </View>
    </View>
  );
}

/** The progress bar's fill, springing to its new width instead of jumping. */
function SpringFill({ value }: { value: number }) {
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withTiming(value, { duration: 300 });
  }, [value, w]);
  const style = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return <Animated.View style={[styles.fill, style]} />;
}

/** An emoji that drifts up off the partner card and fades, then removes itself. */
function Floater({ id, emoji, onDone }: { id: number; emoji: string; onDone: (id: number) => void }) {
  const y = useSharedValue(0);
  const o = useSharedValue(0);
  const s = useSharedValue(0.6);
  const [x] = useState(() => (Math.random() - 0.5) * 90);

  useEffect(() => {
    s.value = withTiming(1.3, { duration: 250 });
    o.value = withSequence(withTiming(1, { duration: 120 }), withTiming(0, { duration: 1100 }));
    y.value = withTiming(-70, { duration: 1250 });
    // Removal happens on the JS thread, after the animation has finished.
    const t = setTimeout(() => onDone(id), 1300);
    return () => clearTimeout(t);
  }, [s, o, y, id, onDone]);

  const style = useAnimatedStyle(() => ({
    opacity: o.value,
    transform: [{ translateX: x }, { translateY: y.value }, { scale: s.value }],
  }));

  return (
    <Animated.Text pointerEvents="none" style={[styles.floater, style]}>
      {emoji}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  step: { flex: 1, paddingHorizontal: 20, paddingBottom: 24, paddingTop: 12 },
  scroll: { paddingBottom: 12 },
  head: { alignItems: 'center' },
  eyebrow: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
    backgroundColor: palette.green50,
    paddingHorizontal: 14,
    paddingVertical: 5,
    marginBottom: 12,
  },
  eyebrowText: { ...font('extrabold', 10.5, { color: palette.green700 }), letterSpacing: 2 },
  title: {
    ...font('extrabold', 27, { color: palette.ink }),
    textAlign: 'center',
    letterSpacing: -0.8,
    lineHeight: 33,
  },
  body: {
    ...font('medium', 14, { color: palette.grey600 }),
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
    maxWidth: 320,
  },

  partnerCard: {
    marginTop: 18,
    padding: 16,
    borderRadius: radius['4xl'],
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
    overflow: 'hidden',
    ...surfaceShadow,
  },
  partnerTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ghost: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: palette.green300,
    backgroundColor: palette.green50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostQ: font('extrabold', 20, { color: palette.green700 }),
  partnerName: { ...font('extrabold', 16, { color: palette.ink }), letterSpacing: -0.3 },
  previewTag: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: palette.green500 },
  previewTagText: font('semibold', 12, { color: palette.grey600 }),
  score: { flexDirection: 'row', alignItems: 'baseline' },
  scoreValue: { ...font('extrabold', 30, { color: palette.ink }), fontVariant: ['tabular-nums'] },
  scoreOf: font('bold', 14, { color: palette.grey500 }),
  mirrorRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  mirrorDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mirrorDotOn: { backgroundColor: palette.green100, borderWidth: 2, borderColor: palette.green500 },
  mirrorEmoji: { fontSize: 18 },
  track: { height: 8, borderRadius: 4, backgroundColor: palette.divider, marginTop: 14, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: palette.green500 },
  floater: { position: 'absolute', right: 40, top: 40, fontSize: 28 },
  burstAnchor: { position: 'absolute', right: 48, top: 52 },

  sectionLabel: {
    ...font('extrabold', 17, { color: palette.ink }),
    letterSpacing: -0.4,
    marginTop: 20,
    marginBottom: 10,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  habitWrap: { width: '48%', flexGrow: 1 },
  habit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 54,
    paddingHorizontal: 12,
    borderRadius: radius['2xl'],
    backgroundColor: palette.white,
    borderWidth: 1.5,
    borderColor: 'rgba(15,31,23,0.08)',
    ...surfaceShadow,
  },
  habitOn: { backgroundColor: palette.green50, borderColor: palette.green500 },
  habitEmoji: { fontSize: 20 },
  habitLabel: { ...font('bold', 13.5, { color: palette.ink }), flex: 1 },
  check: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: palette.green600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: font('extrabold', 12, { color: palette.white }),

  pokeRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  pokeLabel: font('semibold', 13, { color: palette.grey600 }),
  pokes: { flexDirection: 'row', gap: 8 },
  poke: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    ...surfaceShadow,
  },
  line: {
    ...font('extrabold', 15, { color: palette.green700 }),
    textAlign: 'center',
    marginTop: 18,
  },
  promise: {
    ...font('medium', 12.5, { color: palette.grey600 }),
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 6,
  },
  footer: { paddingTop: 8 },
  skip: { alignItems: 'center', marginTop: 8, padding: 8 },
});

import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/shallow';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { useEffect } from 'react';

import { PressableScale, ProgressBar } from '@/components/ui';
import { PUSHUP_LADDER } from '@/domain/programme';
import { getExercise } from '@/vision/exercises';
import { isPurchasesConfigured } from '@/services/purchases';
import { selectProgramme, useProfileStore } from '@/state/profileStore';
import { useEffectivePro } from '@/state/proStore';
import { font } from '@/theme/typography';
import { palette, shadow, radius } from '@/theme/tokens';

/* ── Animated sub-components ─────────────────────────────────────────── */

/** A breathing CTA pill that gently scales to draw the eye. */
function AnimatedCTA({ text, isPro = false }: { text: string; isPro?: boolean }) {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.04, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
  }, [scale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[styles.ctaPill, animStyle, isPro && styles.ctaPillPro]}
    >
      <Text style={[styles.ctaText, isPro && { color: palette.amber900 }]}>
        {text}
      </Text>
      <View style={[styles.ctaArrow, isPro && { backgroundColor: palette.amber800 }]}>
        <Text style={font('extrabold', 13, { color: palette.white })}>→</Text>
      </View>
    </Animated.View>
  );
}

/** Floating emoji that bobs up and down. */
function FloatingEmoji({ emoji, delay = 0 }: { emoji: string; delay?: number }) {
  const y = useSharedValue(0);

  useEffect(() => {
    const d = delay;
    setTimeout(() => {
      y.value = withRepeat(
        withSequence(
          withTiming(-6, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
          withTiming(6, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        true,
      );
    }, d);
  }, [y, delay]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
  }));

  return (
    <Animated.Text style={[{ fontSize: 28 }, animStyle]}>{emoji}</Animated.Text>
  );
}

/** Glowing ring progress indicator. */
function GlowRing({
  percent,
  size = 68,
  color = '#15803d',
}: {
  percent: number;
  size?: number;
  color?: string;
}) {
  return (
    <View
      style={[
        styles.glowRing,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: color,
          shadowColor: color,
        },
      ]}
    >
      <Text style={font('extrabold', 18, { color: palette.white })}>
        {percent}%
      </Text>
    </View>
  );
}

/* ── Main component ──────────────────────────────────────────────────── */

/**
 * The training-programme surface on the Train tab.
 *
 * Enrolled → shows today's programme day (exercise + target) with a progress bar
 * across the whole ladder, and starts that exact session on tap. Not enrolled →
 * a start CTA for the flagship push-up ladder. All the maths lives in the pure
 * `programme.ts`; this only renders and routes.
 */
export function ProgrammeCard() {
  const router = useRouter();
  const state = useProfileStore(useShallow(selectProgramme));
  const startProgramme = useProfileStore((s) => s.startProgramme);
  const completeProgrammeRestDay = useProfileStore((s) => s.completeProgrammeRestDay);
  const isPro = useEffectivePro();

  const gated = !isPro && isPurchasesConfigured();
  const enroll = (programmeId: string) => {
    if (gated) {
      router.push({ pathname: '/modal/paywall', params: { source: 'programme' } });
      return;
    }
    startProgramme(programmeId);
  };

  // ---- Not enrolled: offer the flagship ladder ----
  if (!state) {
    return (
      <PressableScale
        onPress={() => enroll(PUSHUP_LADDER.id)}
        accessibilityRole="button"
        accessibilityLabel={`Start the programme: ${PUSHUP_LADDER.title}`}
      >
        <LinearGradient
          colors={['#15803d', '#16a34a', '#22c55e']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          {/* Warm orange accent glow at top-right */}
          <View style={styles.cornerGlow} />

          <View style={styles.headerRow}>
            <View style={styles.badgePill}>
              <View style={styles.badgeDot} />
              <Text style={styles.badgeText}>NEW · 4-WEEK PROGRAMME</Text>
            </View>
            {gated ? (
              <LinearGradient
                colors={['#f59e0b', '#f97316']}
                style={styles.proTag}
              >
                <Text style={font('extrabold', 9.5, { color: palette.white })}>PRO</Text>
              </LinearGradient>
            ) : null}
          </View>

          <View style={styles.contentRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{PUSHUP_LADDER.title}</Text>
              <Text style={styles.body}>{PUSHUP_LADDER.description}</Text>
              <AnimatedCTA
                text={gated ? 'Unlock with Pro' : 'Start challenge'}
                isPro={gated}
              />
            </View>
            <View style={styles.emojiStack}>
              <FloatingEmoji emoji="💪" delay={0} />
              <FloatingEmoji emoji="🔥" delay={600} />
            </View>
          </View>

          {/* Stats chips at bottom */}
          <View style={styles.statsRow}>
            <View style={styles.statChip}>
              <Text style={styles.statValue}>4</Text>
              <Text style={styles.statLabel}>Weeks</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statChip}>
              <Text style={styles.statValue}>20</Text>
              <Text style={styles.statLabel}>Days</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statChip}>
              <Text style={styles.statValue}>2×</Text>
              <Text style={styles.statLabel}>XP Boost</Text>
            </View>
          </View>
        </LinearGradient>
      </PressableScale>
    );
  }

  // ---- Finished ----
  if (state.finished || !state.currentDay) {
    return (
      <PressableScale
        onPress={() => enroll(PUSHUP_LADDER.id)}
        accessibilityRole="button"
        accessibilityLabel="Restart a programme"
      >
        <LinearGradient
          colors={['#ea580c', '#f59e0b', '#fbbf24']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <View style={styles.headerRow}>
            <View style={[styles.badgePill, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
              <Text style={{ fontSize: 10 }}>🏆</Text>
              <Text style={[styles.badgeText, { color: palette.white }]}>PROGRAMME COMPLETE</Text>
            </View>
          </View>
          <Text style={styles.title}>
            {state.programme.title} — done 🎉
          </Text>
          <Text style={styles.body}>
            You finished all {state.totalDays} days. Start another to keep climbing.
          </Text>
          <AnimatedCTA text="Start again" />
        </LinearGradient>
      </PressableScale>
    );
  }

  // ---- Active: today's day ----
  const day = state.currentDay;
  const def = getExercise(day.exercise);
  const progressPercent = Math.round(state.percent * 100);

  const onStart = () => {
    if (day.rest) {
      completeProgrammeRestDay();
      return;
    }
    router.push({
      pathname: '/session',
      params: { exercise: day.exercise, mode: 'solo', target: String(day.target) },
    });
  };

  return (
    <PressableScale
      onPress={onStart}
      accessibilityRole="button"
      accessibilityLabel={
        day.rest
          ? 'Mark rest day complete'
          : `Programme day ${day.index}: ${day.target} ${def.label}`
      }
    >
      <LinearGradient
        colors={['#15803d', '#16a34a', '#22c55e']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View style={styles.cornerGlow} />

        <View style={styles.headerRow}>
          <View style={styles.badgePill}>
            <View style={styles.badgeDot} />
            <Text style={styles.badgeText}>
              {state.programme.title.toUpperCase()} · WK {day.week} DAY {day.dayOfWeek}
            </Text>
          </View>
          <Text style={styles.dayCount}>
            {state.completedDays}/{state.totalDays}
          </Text>
        </View>

        {day.rest ? (
          <View style={styles.contentRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Rest day 🧘</Text>
              <Text style={styles.body}>
                Recovery is part of the plan. Tap when you&apos;re ready for the next day.
              </Text>
              <AnimatedCTA text="Mark rest complete" />
            </View>
          </View>
        ) : (
          <View style={styles.contentRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.targetNumber}>{day.target}</Text>
              <Text style={styles.targetLabel}>{def.label}</Text>
              <Text style={styles.body}>
                Clear today&apos;s target to advance the ladder.
              </Text>
              <AnimatedCTA text={`Start day ${day.index}`} />
            </View>
            <GlowRing percent={progressPercent} />
          </View>
        )}

        <View style={{ marginTop: 16 }}>
          <ProgressBar
            percent={progressPercent}
            trackColor="rgba(255,255,255,0.25)"
            fillColor={palette.white}
          />
        </View>
      </LinearGradient>
    </PressableScale>
  );
}

/* ── Styles ───────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  card: {
    borderRadius: radius['4xl'],
    padding: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    ...shadow.brand,
  },
  cornerGlow: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(249,115,22,0.25)',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.md,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.white,
    shadowColor: palette.white,
    shadowOpacity: 0.9,
    shadowRadius: 4,
  },
  badgeText: {
    ...font('extrabold', 10, { color: palette.white }),
    letterSpacing: 1.2,
  },
  proTag: {
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dayCount: {
    ...font('extrabold', 13, { color: 'rgba(255,255,255,0.85)' }),
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 16,
  },
  title: {
    ...font('extrabold', 22, { color: palette.white }),
    lineHeight: 26,
  },
  body: {
    ...font('semibold', 12, { color: 'rgba(255,255,255,0.8)' }),
    marginTop: 4,
    lineHeight: 17,
  },
  targetNumber: {
    ...font('extrabold', 48, { color: palette.white }),
    lineHeight: 52,
    textShadowColor: 'rgba(0,0,0,0.15)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  targetLabel: {
    ...font('extrabold', 15, { color: 'rgba(255,255,255,0.9)' }),
    marginTop: -2,
    letterSpacing: 0.5,
  },
  emojiStack: {
    alignItems: 'center',
    gap: 4,
  },

  // CTA
  ctaPill: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingLeft: 16,
    paddingRight: 4,
    paddingVertical: 8,
    borderRadius: 24,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    shadowColor: 'rgba(0,0,0,0.2)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 4,
  },
  ctaPillPro: {
    backgroundColor: palette.amber400,
    borderColor: palette.amber300,
    shadowColor: '#f59e0b',
  },
  ctaText: font('extrabold', 14, { color: palette.white }),
  ctaArrow: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Stats row (not-enrolled card)
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.18)',
    gap: 0,
  },
  statChip: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: font('extrabold', 18, { color: palette.white }),
  statLabel: font('semibold', 10, { color: 'rgba(255,255,255,0.65)' }),
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },

  // Glow ring
  glowRing: {
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },

  ghostPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius['2xl'],
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
});

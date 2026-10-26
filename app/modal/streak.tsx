import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import { CountUp } from '@/components/motion';
import { Confetti } from '@/components/session/Confetti';
import { PressableScale } from '@/components/ui';
import { dayKey, weekdayLetter } from '@/domain/progression';
import { celebrationCopy, nextMilestoneAfter } from '@/domain/streakCelebration';
import { shiftDay } from '@/domain/streakFreeze';
import { track } from '@/lib/analytics';
import { successHaptic } from '@/lib/feedback';
import { useProfileStore } from '@/state/profileStore';
import { font } from '@/theme/typography';
import { gradients, palette, radius } from '@/theme/tokens';

const LINK = 'repchamp.web.app';

/**
 * The full-screen streak milestone celebration (3, 7, 14, 30… days).
 *
 * Opened once per milestone from the result screen's Done. The top half is
 * the share card itself, so what the athlete posts is exactly what they see.
 */
export default function StreakMilestoneScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ n?: string }>();
  const streak = Math.max(0, Math.floor(Number(params.n) || 0));
  const name = useProfileStore((s) => s.displayName || s.username || '');
  const sessions = useProfileStore((s) => s.sessions);
  const frozenDays = useProfileStore((s) => s.frozenDays);
  const cardRef = useRef<View>(null);

  const copy = celebrationCopy(streak);
  const next = nextMilestoneAfter(streak);

  /* The last seven days, oldest first — the run the number stands for. */
  const days = useMemo(() => {
    const trained = new Set(sessions.map((s) => s.day));
    const frozen = new Set(frozenDays);
    const today = dayKey();
    return Array.from({ length: 7 }, (_, i) => {
      const day = shiftDay(today, i - 6);
      return { day, letter: weekdayLetter(day), trained: trained.has(day), frozen: frozen.has(day) };
    });
  }, [sessions, frozenDays]);

  useEffect(() => {
    successHaptic();
    track('streak_milestone_shown', { streak });
  }, [streak]);

  /* A slow flicker: the flame breathes rather than bounces. */
  const flame = useSharedValue(1);
  useEffect(() => {
    flame.set(
      withRepeat(withSequence(withTiming(1.08, { duration: 700 }), withTiming(0.96, { duration: 700 })), -1, true),
    );
  }, [flame]);
  const flameStyle = useAnimatedStyle(() => ({ transform: [{ scale: flame.get() }] }));

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  const share = async () => {
    track('share_opened', { kind: 'streak-milestone' });
    const text = `${copy.share} ${LINK}`;
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your streak' });
        return;
      }
    } catch {
      // Fall through to text, which works everywhere.
    }
    void Share.share({ message: text });
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient colors={gradients.heroAmber} style={StyleSheet.absoluteFill} />
      <Confetti />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* The share card: everything above the buttons. */}
        <View ref={cardRef} collapsable={false} style={styles.card}>
          <LinearGradient colors={gradients.heroAmber} style={StyleSheet.absoluteFill} />
          <Animated.View entering={ZoomIn.springify().damping(11)} style={[styles.flameWrap, flameStyle]}>
            <Text style={styles.flame}>🔥</Text>
          </Animated.View>

          <CountUp value={streak} delay={250} duration={900} style={styles.number} />
          <Animated.Text entering={FadeInUp.delay(350)} style={styles.title}>
            {copy.title}
          </Animated.Text>
          <Animated.Text entering={FadeInUp.delay(450)} style={styles.line}>
            {copy.line}
          </Animated.Text>

          <Animated.View entering={FadeInUp.delay(550)} style={styles.week}>
            {days.map((d) => (
              <View key={d.day} style={styles.dayCol}>
                <View
                  style={[styles.dot, d.trained && styles.dotOn, d.frozen && !d.trained && styles.dotFrozen]}
                >
                  <Text style={styles.dotMark}>{d.trained ? '✓' : d.frozen ? '❄' : ''}</Text>
                </View>
                <Text style={styles.dayLetter}>{d.letter}</Text>
              </View>
            ))}
          </Animated.View>

          {next ? (
            <Animated.View entering={FadeInUp.delay(650)} style={styles.nextWrap}>
              <View style={styles.nextTrack}>
                <View style={[styles.nextFill, { width: `${Math.round((streak / next) * 100)}%` }]} />
              </View>
              <Text style={styles.nextText}>{`Next: ${next} days`}</Text>
            </Animated.View>
          ) : null}

          <Text style={styles.brand}>{name ? `${name} · ` : ''}RepChamp</Text>
        </View>

        <Animated.View entering={FadeInDown.delay(700)} style={styles.actions}>
          <PressableScale
            onPress={() => void share()}
            accessibilityRole="button"
            accessibilityLabel="Share your streak"
            style={styles.primary}
          >
            <Text style={styles.primaryText}>Share my streak</Text>
          </PressableScale>
          <PressableScale onPress={close} accessibilityRole="button" accessibilityLabel="Continue" style={styles.secondary}>
            <Text style={styles.secondaryText}>Continue</Text>
          </PressableScale>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#6B210A' },
  safe: { flex: 1, paddingHorizontal: 20, justifyContent: 'space-between' },
  card: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius['4xl'],
    overflow: 'hidden',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  flameWrap: { marginBottom: 4 },
  flame: { fontSize: 96 },
  number: { ...font('extrabold', 88, { color: palette.white }), letterSpacing: -3, lineHeight: 96 },
  title: { ...font('extrabold', 26, { color: palette.white }), marginTop: 2 },
  line: {
    ...font('semibold', 15, { color: 'rgba(255,255,255,0.88)' }),
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 280,
  },
  week: { flexDirection: 'row', gap: 10, marginTop: 28 },
  dayCol: { alignItems: 'center', gap: 6 },
  dot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotOn: { backgroundColor: palette.amber300 },
  dotFrozen: { backgroundColor: palette.blue500 },
  dotMark: font('extrabold', 14, { color: '#6B210A' }),
  dayLetter: font('bold', 11, { color: 'rgba(255,255,255,0.75)' }),
  nextWrap: { alignSelf: 'stretch', marginTop: 28, alignItems: 'center', gap: 8 },
  nextTrack: {
    alignSelf: 'stretch',
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  nextFill: { height: '100%', borderRadius: 4, backgroundColor: palette.amber300 },
  nextText: font('bold', 13, { color: 'rgba(255,255,255,0.85)' }),
  brand: { ...font('extrabold', 12, { color: 'rgba(255,255,255,0.6)' }), marginTop: 24, letterSpacing: 1 },
  actions: { gap: 10, paddingBottom: 8, paddingTop: 12 },
  primary: {
    backgroundColor: palette.white,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryText: font('extrabold', 16, { color: '#9A3412' }),
  secondary: { paddingVertical: 12, alignItems: 'center' },
  secondaryText: font('bold', 15, { color: 'rgba(255,255,255,0.9)' }),
});

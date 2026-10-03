import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ProgressRing } from '@/components/connected/ProgressRing';
import { ExerciseGlyph } from '@/components/ExerciseGlyph';
import { ModalHeader } from '@/components/ModalHeader';
import { PressableScale, PrimaryButton, Screen } from '@/components/ui';
import { challengeXpReward, dailyChallengeProgress } from '@/domain/dailyChallenge';
import { trackerHistory } from '@/domain/coupleTracker';
import { dayKey } from '@/domain/progression';
import { useAuthStore } from '@/state/authStore';
import { useCouple } from '@/state/useCouple';
import { useProfileStore } from '@/state/profileStore';
import { getExercise } from '@/vision/exercises';
import { font } from '@/theme/typography';
import { gradients, palette, radius, shadow, surfaceShadow } from '@/theme/tokens';

/** Hours until the challenge resets at local midnight. */
function hoursUntilReset(now = new Date()): number {
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return Math.max(1, Math.round((midnight.getTime() - now.getTime()) / 3_600_000));
}

/**
 * Today's challenge: one big ring, one number to beat, one button.
 *
 * Connected to the bond below the hero — when paired, it says whether your
 * partner has trained today and opens Today, together; when not, it offers the
 * pairing flow, so the daily is never a dead end for someone training alone.
 */
export default function DailyChallengeScreen() {
  const router = useRouter();
  const sessions = useProfileStore((s) => s.sessions);
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const { couple, paired, partner } = useCouple();

  const today = dayKey();
  const { best, target, cleared, remaining, percent, exercise, name } = dailyChallengeProgress(
    sessions,
    today,
  );
  const label = getExercise(exercise).label;

  const bondToday = paired ? (trackerHistory(couple, uid, today, 1)[0]?.status ?? 'none') : null;
  const partnerName = partner?.displayName?.trim() || 'Your partner';

  const start = () =>
    router.replace({
      pathname: '/session',
      params: { exercise, mode: 'solo', target: String(target) },
    });

  return (
    <Screen>
      <ModalHeader title="Daily challenge" />

      <Animated.View entering={FadeInDown.duration(340)}>
        <LinearGradient
          colors={gradients.heroEmerald}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, shadow.brand]}
        >
          <View style={styles.topRow}>
            <View style={styles.chip}>
              <Text style={styles.chipText}>{name.toUpperCase()}</Text>
            </View>
            <View style={styles.chip}>
              <Text style={styles.chipText}>RESETS IN {hoursUntilReset()}H</Text>
            </View>
          </View>

          <View style={styles.ringWrap}>
            <ProgressRing percent={percent} size={176} stroke={14} color={cleared ? palette.amber300 : palette.green400}>
              <ExerciseGlyph exercise={exercise} size={34} color="rgba(255,255,255,0.85)" />
              <Text style={styles.ringValue}>
                {best}
                <Text style={styles.ringOf}> / {target}</Text>
              </Text>
              <Text style={styles.ringCaption}>{cleared ? 'CLEARED' : 'YOUR BEST SET'}</Text>
            </ProgressRing>
          </View>

          <Text style={styles.title}>
            {cleared ? `You beat ${target} ${label.toLowerCase()}` : `Beat ${target} ${label.toLowerCase()}`}
          </Text>
          <Text style={styles.sub}>
            {cleared
              ? 'Reward banked. Go for a higher score — or come back tomorrow.'
              : best === 0
                ? 'One set, as many as you can. A new challenge drops tomorrow.'
                : `Just ${remaining} more to clear it.`}
          </Text>

          {/* Derived, not typed: `challengeXpReward` reads the same
              `xpForSession` that actually grants it, so the advertised number
              cannot drift from the paid one. */}
          <View style={styles.reward}>
            <Text style={styles.rewardValue}>+{challengeXpReward()} XP</Text>
            <Text style={styles.rewardLabel}>{cleared ? 'earned today' : 'for clearing it'}</Text>
          </View>
        </LinearGradient>
      </Animated.View>

      <PrimaryButton
        label={cleared ? 'Beat your score' : best > 0 ? 'Try again' : 'Start challenge'}
        colors={gradients.brandStrong}
        onPress={start}
        style={{ marginTop: 16 }}
      />

      <Animated.View entering={FadeInDown.delay(90).duration(320)}>
        {paired && partner ? (
          <PressableScale
            onPress={() => router.push('/couple/partner')}
            accessibilityRole="button"
            accessibilityLabel={`Open today with ${partnerName}`}
            style={styles.bondRow}
          >
            <View style={[styles.bondDot, bondToday === 'both' && styles.bondDotBoth]}>
              <Text style={styles.bondGlyph}>♥</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bondTitle} numberOfLines={1}>
                {bondLine(bondToday, partnerName)}
              </Text>
              <Text style={styles.bondSub}>Open today, together</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </PressableScale>
        ) : (
          <PressableScale
            onPress={() => router.push('/couple')}
            accessibilityRole="button"
            accessibilityLabel="Train with someone"
            style={styles.bondRow}
          >
            <View style={styles.bondDot}>
              <Text style={styles.bondGlyph}>♥</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bondTitle}>Do it with someone</Text>
              <Text style={styles.bondSub}>Scan or share a code to build a streak together</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </PressableScale>
        )}
      </Animated.View>
    </Screen>
  );
}

function bondLine(status: string | null, partnerName: string): string {
  switch (status) {
    case 'both':
      return 'You both trained today';
    case 'mine':
      return `Waiting on ${partnerName}`;
    case 'theirs':
      return `${partnerName} trained — your turn`;
    default:
      return 'Your streak needs you both';
  }
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius['6xl'], padding: 22, alignItems: 'center', overflow: 'hidden' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch' },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
  },
  chipText: font('extrabold', 10, { color: palette.white, letterSpacing: 0.6 }),
  ringWrap: { marginTop: 22 },
  ringValue: font('extrabold', 40, { color: palette.white, marginTop: 2 }),
  ringOf: font('bold', 18, { color: 'rgba(255,255,255,0.65)' }),
  ringCaption: font('extrabold', 10, { color: 'rgba(255,255,255,0.7)', letterSpacing: 0.8 }),
  title: font('extrabold', 22, { color: palette.white, marginTop: 20, textAlign: 'center' }),
  sub: {
    ...font('semibold', 13.5, { color: 'rgba(255,255,255,0.85)' }),
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 270,
  },
  reward: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 18,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  rewardValue: font('extrabold', 16, { color: palette.amber300 }),
  rewardLabel: font('semibold', 12, { color: 'rgba(255,255,255,0.8)' }),

  bondRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 14,
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: palette.white,
    ...surfaceShadow,
  },
  bondDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.green50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bondDotBoth: { backgroundColor: palette.green100 },
  bondGlyph: { fontSize: 18, color: palette.red500 },
  bondTitle: font('bold', 15, { color: palette.ink }),
  bondSub: { ...font('medium', 12.5, { color: palette.slate500 }), marginTop: 1 },
  chevron: font('semibold', 22, { color: palette.grey500 }),
});

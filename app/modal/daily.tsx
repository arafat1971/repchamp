import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { ModalHeader } from '@/components/ModalHeader';
import { Card, PrimaryButton, ProgressBar, Screen, SectionLabel } from '@/components/ui';
import { dayKey } from '@/domain/progression';
import { useProfileStore } from '@/state/profileStore';
import { font } from '@/theme/typography';
import { gradients, palette, radius, shadow } from '@/theme/tokens';

const DAILY_TARGET = 25;

/** Hours until the challenge resets at local midnight. */
function hoursUntilReset(now = new Date()): number {
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return Math.max(1, Math.round((midnight.getTime() - now.getTime()) / 3_600_000));
}

export default function DailyChallengeScreen() {
  const router = useRouter();
  const sessions = useProfileStore((s) => s.sessions);

  const today = dayKey();
  const todaysBest = sessions
    .filter((s) => s.day === today && s.exercise === 'push')
    .reduce((max, s) => Math.max(max, s.reps), 0);

  const cleared = todaysBest >= DAILY_TARGET;
  const remaining = Math.max(0, DAILY_TARGET - todaysBest);
  const percent = Math.min(100, Math.round((todaysBest / DAILY_TARGET) * 100));

  return (
    <Screen>
      <ModalHeader title="Daily Challenge" />

      <LinearGradient colors={gradients.brandStrong} style={[styles.hero, shadow.brand]}>
        <Svg width={150} height={150} viewBox="0 0 100 100" style={styles.heroWatermark}>
          <Circle cx={50} cy={50} r={44} stroke={palette.white} strokeWidth={4} fill="none" opacity={0.16} />
          <Circle cx={50} cy={50} r={28} stroke={palette.white} strokeWidth={4} fill="none" opacity={0.16} />
          <Circle cx={50} cy={50} r={12} fill={palette.white} opacity={0.16} />
        </Svg>
        <View style={styles.heroChip}>
          <Text style={font('extrabold', 10, { color: palette.white, letterSpacing: 0.5 })}>
            RESETS IN {hoursUntilReset()}H
          </Text>
        </View>
        <Text style={font('extrabold', 26, { color: palette.white, marginTop: 12 })}>
          Beat {DAILY_TARGET} Push-ups
        </Text>
        <Text style={styles.heroCopy}>
          Do as many push-ups as you can before the timer runs out. Beat the target to keep your
          streak alive.
        </Text>
        <View style={styles.heroStats}>
          <View>
            <Text style={font('extrabold', 22, { color: palette.white })}>+300</Text>
            <Text style={styles.heroStatLabel}>XP REWARD</Text>
          </View>
        </View>
      </LinearGradient>

      <Card style={styles.progressCard}>
        <View style={styles.progressHeader}>
          <SectionLabel>Your best today</SectionLabel>
          <Text style={font('extrabold', 12, { color: palette.grey600 })}>
            {todaysBest} / {DAILY_TARGET}
          </Text>
        </View>
        <ProgressBar percent={percent} height={12} fillColors={gradients.brand} />
        <Text style={font('bold', 12, { color: palette.green600, marginTop: 8 })}>
          {cleared
            ? 'Cleared today — nice work'
            : todaysBest === 0
              ? 'Not started yet — go claim it'
              : `Just ${remaining} more to clear it`}
        </Text>
      </Card>

      <PrimaryButton
        label={cleared ? 'Beat your score' : 'Start Challenge'}
        colors={gradients.brandStrong}
        onPress={() =>
          router.replace({
            pathname: '/session',
            params: { exercise: 'push', mode: 'solo', target: String(DAILY_TARGET) },
          })
        }
        style={{ marginTop: 20 }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius['6xl'], padding: 24, overflow: 'hidden' },
  heroWatermark: { position: 'absolute', right: -18, top: -16 },
  heroChip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  heroCopy: {
    ...font('semibold', 13, { color: 'rgba(255,255,255,0.92)' }),
    maxWidth: 230,
    marginTop: 4,
  },
  heroStats: { flexDirection: 'row', gap: 20, marginTop: 16 },
  heroStatLabel: {
    ...font('bold', 10, { color: 'rgba(255,255,255,0.85)' }),
  },
  progressCard: { padding: 16, marginTop: 16 },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
});

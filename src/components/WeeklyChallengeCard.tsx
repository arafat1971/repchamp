import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale, ProgressBar } from '@/components/ui';
import { dayKey } from '@/domain/progression';
import { weeklyChallengeProgress } from '@/domain/weeklyChallenge';
import { useProfileStore } from '@/state/profileStore';
import { font } from '@/theme/typography';
import { palette, radius, shadow } from '@/theme/tokens';

/** The day-keys (YYYY-MM-DD) of the current Mon–Sun week. */
function currentWeekDays(date = new Date()): Set<string> {
  const dayNum = date.getDay() || 7; // Mon=1 … Sun=7
  const monday = new Date(date);
  monday.setDate(date.getDate() - (dayNum - 1));
  const set = new Set<string>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    set.add(dayKey(d));
  }
  return set;
}

/**
 * This week's rotating challenge — a time-boxed goal that pulls athletes back
 * and gives them something to share. Progress + countdown come from the pure
 * `weeklyChallenge` domain; a tap starts the challenge exercise.
 */
export function WeeklyChallengeCard() {
  const router = useRouter();
  const sessions = useProfileStore((s) => s.sessions);

  const progress = useMemo(() => {
    return weeklyChallengeProgress(sessions, currentWeekDays());
  }, [sessions]);

  const { def, reps, percent, complete, daysLeft } = progress;

  const onStart = () =>
    router.push({ pathname: '/session', params: { exercise: def.exercise, mode: 'practice' } });

  return (
    <PressableScale
      onPress={onStart}
      accessibilityRole="button"
      accessibilityLabel={`This week's challenge: ${def.title}, ${reps} of ${def.target} done`}
    >
      <LinearGradient
        colors={complete ? ['#f59e0b', '#d97706'] : ['#34d26a', '#12923f']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, shadow.brand]}
      >
        <View style={styles.headerRow}>
          <Text style={styles.eyebrow}>THIS WEEK’S CHALLENGE</Text>
          <View style={styles.countdown}>
            <Text style={styles.countdownText}>
              {daysLeft} {daysLeft === 1 ? 'DAY' : 'DAYS'} LEFT
            </Text>
          </View>
        </View>

        <View style={styles.titleRow}>
          <Text style={{ fontSize: 30 }}>{def.emoji}</Text>
          <Text style={styles.title}>{def.title}</Text>
        </View>
        <Text style={styles.blurb}>{complete ? 'Done — nice work! 🎉 Share it and challenge a friend.' : def.blurb}</Text>

        <View style={styles.progressRow}>
          <Text style={styles.progressCount}>
            {Math.min(reps, def.target)}
            <Text style={styles.progressTarget}> / {def.target}</Text>
          </Text>
          <Text style={styles.ctaText}>{complete ? 'Keep going →' : 'Start now →'}</Text>
        </View>
        <ProgressBar
          percent={Math.round(percent * 100)}
          height={9}
          trackColor="rgba(255,255,255,0.25)"
          fillColor={palette.white}
        />
      </LinearGradient>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius['4xl'], padding: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { ...font('extrabold', 10, { color: 'rgba(255,255,255,0.85)' }), letterSpacing: 1.5 },
  countdown: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  countdownText: { ...font('extrabold', 9.5, { color: palette.white }), letterSpacing: 0.8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  title: { ...font('extrabold', 22, { color: palette.white }) },
  blurb: { ...font('bold', 12, { color: 'rgba(255,255,255,0.9)' }), marginTop: 6, lineHeight: 18 },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 16,
    marginBottom: 8,
  },
  progressCount: { ...font('extrabold', 20, { color: palette.white }) },
  progressTarget: { ...font('extrabold', 14, { color: 'rgba(255,255,255,0.7)' }) },
  ctaText: { ...font('extrabold', 14, { color: palette.white }) },
});

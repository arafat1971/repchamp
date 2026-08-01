import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { ModalHeader } from '@/components/ModalHeader';
import { Badge, Card, Eyebrow, Screen } from '@/components/ui';
import { evaluateAchievements, type Achievement } from '@/domain/achievements';
import { selectBestStreak, selectWeeklyXp, useProfileStore } from '@/state/profileStore';
import { font, text } from '@/theme/typography';
import { gradients, palette, radius, shadow } from '@/theme/tokens';

export default function AchievementsScreen() {
  const profile = useProfileStore();

  const achievements = evaluateAchievements({
    sessions: profile.sessions,
    bestStreak: selectBestStreak(profile),
    weeklyXp: selectWeeklyXp(profile),
  });

  const earned = achievements.filter((a) => a.earned);
  const inProgress = achievements.filter((a) => !a.earned);

  return (
    <Screen>
      <ModalHeader title="Achievements" />

      <LinearGradient colors={gradients.brand} style={[styles.summary, shadow.brand]}>
        <Text style={font('extrabold', 34, { color: palette.white })}>
          {earned.length}
          <Text style={font('extrabold', 18, { color: 'rgba(255,255,255,0.75)' })}>
            /{achievements.length}
          </Text>
        </Text>
        <View style={{ flex: 1 }}>
          <Text style={font('extrabold', 14, { color: palette.white })}>Badges unlocked</Text>
          <Text style={font('semibold', 11, { color: 'rgba(255,255,255,0.85)' })}>
            Keep training to earn the rest
          </Text>
        </View>
      </LinearGradient>

      {earned.length > 0 ? (
        <>
          <Eyebrow style={styles.eyebrow}>EARNED</Eyebrow>
          <View style={{ gap: 8, marginBottom: 24 }}>
            {earned.map((a) => (
              <AchievementRow key={a.id} achievement={a} />
            ))}
          </View>
        </>
      ) : null}

      {inProgress.length > 0 ? (
        <>
          <Eyebrow style={styles.eyebrow}>IN PROGRESS</Eyebrow>
          <View style={{ gap: 8 }}>
            {inProgress.map((a) => (
              <AchievementRow key={a.id} achievement={a} />
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

function AchievementRow({ achievement }: { achievement: Achievement }) {
  const percent = Math.min(100, Math.round((achievement.current / achievement.goal) * 100));

  return (
    <Card style={[styles.row, achievement.earned && styles.earnedRow]}>
      <View
        style={[
          styles.icon,
          achievement.earned ? styles.earnedIcon : styles.lockedIcon,
        ]}
      >
        <Text style={{ fontSize: 24, opacity: achievement.earned ? 1 : 0.6 }}>
          {achievement.emoji}
        </Text>
      </View>

      <View style={{ flex: 1 }}>
        <Text style={text.cardTitle}>{achievement.title}</Text>
        <Text style={text.caption}>{achievement.description}</Text>

        {!achievement.earned ? (
          <View style={styles.track}>
            <LinearGradient
              colors={gradients.brand}
              style={[styles.fill, { width: `${percent}%` }]}
            />
          </View>
        ) : null}
      </View>

      {achievement.earned ? (
        <Badge label="Earned" color={palette.green600} background={palette.green50} />
      ) : (
        <Text style={font('extrabold', 11, { color: palette.grey600 })}>{achievement.label}</Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radius['4xl'],
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  eyebrow: { marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  earnedRow: { borderWidth: 1, borderColor: '#bbf7d0' },
  icon: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  earnedIcon: {
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
  },
  lockedIcon: {
    backgroundColor: '#f3f4f3',
  },
  track: {
    height: 6,
    borderRadius: 4,
    backgroundColor: palette.divider,
    marginTop: 8,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 4 },
});

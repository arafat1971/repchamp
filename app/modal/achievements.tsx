import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { ModalHeader } from '@/components/ModalHeader';
import { Badge, Screen } from '@/components/ui';
import { HomeSectionHeader } from '@/components/home/HomeSectionHeader';
import { HomeCard as Card } from '@/components/ui/HomeCard';
import { evaluateAchievements, type Achievement } from '@/domain/achievements';
import { selectBestStreak, selectWeeklyXp, useProfileStore } from '@/state/profileStore';
import { font, text } from '@/theme/typography';
import { gradients, palette, radius, surfaceShadow } from '@/theme/tokens';

const TROPHY = require('../../assets/trophy-gold.png');

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

      <View style={styles.summary}>
        <Image source={TROPHY} style={styles.summaryTrophy} contentFit="contain" />
        <View style={{ flex: 1 }}>
          <Text style={font('extrabold', 34, { color: palette.ink })}>
            {earned.length}
            <Text style={font('extrabold', 18, { color: palette.grey500 })}>/{achievements.length}</Text>
          </Text>
          <Text style={font('extrabold', 14, { color: palette.ink })}>Badges unlocked</Text>
          <Text style={font('semibold', 12, { color: palette.grey600 })}>
            Keep training to earn the rest
          </Text>
        </View>
      </View>

      {earned.length > 0 ? (
        <>
          <HomeSectionHeader title="Earned" />
          <View style={{ gap: 10, marginBottom: 8 }}>
            {earned.map((a) => (
              <AchievementRow key={a.id} achievement={a} />
            ))}
          </View>
        </>
      ) : null}

      {inProgress.length > 0 ? (
        <>
          <HomeSectionHeader title="In progress" />
          <View style={{ gap: 10 }}>
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
    marginBottom: 8,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
    ...surfaceShadow,
  },
  summaryTrophy: { width: 84, height: 84 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  earnedRow: { borderColor: palette.green500, backgroundColor: palette.green50 },
  icon: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  earnedIcon: {
    backgroundColor: palette.tintGreenBottom,
    borderWidth: 1,
    borderColor: palette.green300,
  },
  lockedIcon: {
    backgroundColor: '#f3f4f3',
  },
  track: {
    height: 6,
    borderRadius: radius.xs,
    backgroundColor: palette.divider,
    marginTop: 8,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.xs },
});

import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Image, StyleSheet, Text, View } from 'react-native';

import { Card, PressableScale, ProgressBar, Screen, SectionLabel, StatTile } from '@/components/ui';
import { StaggerIn } from '@/components/motion';
import { ACHIEVEMENTS, evaluateAchievements } from '@/domain/achievements';
import {
  selectBestStreak,
  selectDuelsWon,
  selectLevel,
  selectTotalReps,
  selectWeeklyXp,
  selectWinRate,
  useProfileStore,
} from '@/state/profileStore';
import { useIsPro } from '@/state/proStore';
import { font, text } from '@/theme/typography';
import { gradients, palette, radius, shadow } from '@/theme/tokens';

export default function ProfileScreen() {
  const router = useRouter();
  const profile = useProfileStore();
  const isPro = useIsPro();
  const setAvatar = useProfileStore((s) => s.setAvatar);

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) setAvatar(result.assets[0].uri);
  };

  const level = selectLevel(profile);
  const totalReps = selectTotalReps(profile);
  const duelsWon = selectDuelsWon(profile);
  const winRate = selectWinRate(profile);
  const bestStreak = selectBestStreak(profile);

  const achievements = evaluateAchievements({
    sessions: profile.sessions,
    bestStreak,
    weeklyXp: selectWeeklyXp(profile),
  });
  const featured = achievements.slice(0, 3);
  const initial = (profile.username || 'C').charAt(0).toUpperCase();

  return (
    <Screen>
      <StaggerIn index={0}>
        <View style={styles.settingsRow}>
          <PressableScale
            onPress={() => router.push('/modal/settings')}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            style={styles.settingsButton}
          >
            <Text style={{ fontSize: 18 }}>⚙️</Text>
          </PressableScale>
        </View>
      </StaggerIn>

      <StaggerIn index={1}>
        <View style={styles.identity}>
          <PressableScale
            onPress={pickAvatar}
            accessibilityRole="button"
            accessibilityLabel="Change profile photo"
          >
            {profile.avatarUri ? (
              <Image source={{ uri: profile.avatarUri }} style={styles.avatar} />
            ) : (
              <LinearGradient colors={gradients.brandStrong} style={[styles.avatar, shadow.brand]}>
                <Text style={font('extrabold', 38, { color: palette.white })}>{initial}</Text>
              </LinearGradient>
            )}
            <View style={styles.avatarEdit}>
              <Text style={{ fontSize: 12 }}>✏️</Text>
            </View>
          </PressableScale>
          <Text style={[font('extrabold', 22, { color: palette.ink }), { marginTop: 12 }]}>
            {profile.displayName}
          </Text>
          <Text style={[text.captionMd, { fontWeight: '700' }]}>
            @{profile.username || 'champion'} · 👑 {level.rankName} · Level {level.level}
          </Text>
          <View style={{ width: 180, marginTop: 10 }}>
            <ProgressBar percent={level.percent} height={8} fillColors={gradients.brandStrong} />
          </View>
        </View>
      </StaggerIn>

      <StaggerIn index={2}>
        <View style={styles.statGrid}>
          <View style={styles.statRow}>
            <StatTile value={totalReps.toLocaleString()} label="Total reps" color={palette.green500} />
            <StatTile value={duelsWon} label="Duels won" color={palette.purple500} />
          </View>
          <View style={styles.statRow}>
            <StatTile value={`${winRate}%`} label="Win rate" color={palette.amber500} />
            <StatTile value={bestStreak} label="Best streak" color={palette.red500} />
          </View>
        </View>
      </StaggerIn>

      <StaggerIn index={3}>
        <View style={styles.sectionHeader}>
          <SectionLabel>Achievements</SectionLabel>
          <PressableScale
            onPress={() => router.push('/modal/achievements')}
            accessibilityRole="button"
            accessibilityLabel="See all achievements"
          >
            <Text style={font('extrabold', 12, { color: palette.green600 })}>See all ›</Text>
          </PressableScale>
        </View>

        <View style={styles.badgeRow}>
          {featured.map((a) => (
            <Card key={a.id} style={[styles.badgeTile, !a.earned && styles.badgeLocked]}>
              <View style={[styles.badgeIconWrap, a.earned && styles.badgeEarnedWrap]}>
                <Text style={{ fontSize: 26 }}>{a.emoji}</Text>
                <View style={[styles.badgeDot, a.earned ? styles.badgeDotUnlocked : styles.badgeDotLocked]}>
                  <Text style={font('extrabold', 7, { color: palette.white })}>
                    {a.earned ? '✓' : '🔒'}
                  </Text>
                </View>
              </View>
              <Text style={styles.badgeLabel}>{a.title}</Text>
            </Card>
          ))}
        </View>
      </StaggerIn>

      <StaggerIn index={4}>
        <LinearGradient
          colors={['#fffbeb', '#fef3c7', '#fffbeb']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.proCard, shadow.card]}
        >
          <Text style={{ fontSize: 22 }}>✨</Text>
          <View style={{ flex: 1 }}>
            <Text style={font('extrabold', 14.5, { color: palette.ink })}>RepChamp Pro</Text>
            <Text style={text.caption}>
              {isPro ? 'Active — thanks for the support' : 'Full library, form history & stats'}
            </Text>
          </View>
          {isPro ? (
            <View style={styles.proBadge}>
              <Text style={font('extrabold', 12, { color: palette.amber900 })}>PRO</Text>
            </View>
          ) : (
            <PressableScale
              onPress={() => router.push({ pathname: '/modal/paywall', params: { source: 'profile' } })}
              accessibilityRole="button"
              accessibilityLabel="Upgrade to RepChamp Pro"
              style={styles.proButton}
            >
              <Text style={font('extrabold', 12, { color: palette.white })}>Upgrade</Text>
            </PressableScale>
          )}
        </LinearGradient>

        <Text style={styles.version}>
          {achievements.filter((a) => a.earned).length} / {ACHIEVEMENTS.length} badges unlocked
        </Text>
      </StaggerIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  settingsRow: { alignItems: 'flex-end', marginTop: 8, marginBottom: -12 },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  identity: { alignItems: 'center', paddingTop: 6, paddingBottom: 10 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEdit: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  statGrid: { gap: 12, marginVertical: 18 },
  statRow: { flexDirection: 'row', gap: 12 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  badgeRow: { flexDirection: 'row', gap: 12 },
  badgeTile: { flex: 1, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8 },
  badgeLocked: { opacity: 0.55 },
  badgeIconWrap: {
    position: 'relative',
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#f4f5f4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeEarnedWrap: {
    backgroundColor: '#dcfce7',
    borderWidth: 1.5,
    borderColor: '#4ade80',
  },
  badgeDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 15,
    height: 15,
    borderRadius: 7.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeDotUnlocked: { backgroundColor: palette.green500 },
  badgeDotLocked: { backgroundColor: palette.grey500 },
  badgeLabel: {
    ...font('extrabold', 10, { color: palette.ink }),
    marginTop: 8,
    textAlign: 'center',
  },
  proCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    marginTop: 22,
    borderRadius: radius['2xl'],
  },
  proBadge: {
    backgroundColor: palette.amber200,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  proButton: {
    backgroundColor: palette.ink,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
  },
  version: {
    ...text.caption,
    color: palette.grey450,
    textAlign: 'center',
    marginTop: 16,
  },
});

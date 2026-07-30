import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { Card, PressableScale, ProgressBar, Screen, SectionLabel } from '@/components/ui';
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

/* ── Line icons (single green accent, no emoji) ── */
function GearIcon({ size = 19, color = palette.slate600 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={2} fill="none" />
      <Path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function CameraIcon({ size = 14, color = palette.green700 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3l2-3h8l2 3h3a2 2 0 0 1 2 2z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Circle cx={12} cy={13} r={3.5} stroke={color} strokeWidth={2} fill="none" />
    </Svg>
  );
}

type StatIconName = 'reps' | 'duels' | 'rate' | 'streak';
function StatIcon({ name }: { name: StatIconName }) {
  const c = palette.green700;
  if (name === 'reps') {
    return (
      <Svg width={19} height={19} viewBox="0 0 24 24">
        <Path d="M3 12h3.4l2.3 6 3.4-12 2.3 9H21" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg>
    );
  }
  if (name === 'duels') {
    return (
      <Svg width={18} height={18} viewBox="0 0 24 24">
        <Path d="M8 21h8M12 17.5V21M6 4h12v4.5a6 6 0 0 1-12 0V4z" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <Path d="M6 6H3.5v1A3.5 3.5 0 0 0 6 10.4M18 6h2.5v1A3.5 3.5 0 0 1 18 10.4" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg>
    );
  }
  if (name === 'rate') {
    return (
      <Svg width={19} height={19} viewBox="0 0 24 24">
        <Circle cx={12} cy={12} r={9} stroke={c} strokeWidth={2} fill="none" />
        <Circle cx={12} cy={12} r={4.5} stroke={c} strokeWidth={2} fill="none" />
        <Circle cx={12} cy={12} r={1.4} fill={c} />
      </Svg>
    );
  }
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path d="M13 2 4 13h6l-1 9 9-12h-6l1-8z" fill={c} />
    </Svg>
  );
}

function BadgeStatus({ earned }: { earned: boolean }) {
  return (
    <View style={[styles.badgeDot, earned ? styles.badgeDotUnlocked : styles.badgeDotLocked]}>
      {earned ? (
        <Svg width={9} height={9} viewBox="0 0 24 24">
          <Path d="M20 6 9 17l-5-5" stroke={palette.white} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
      ) : (
        <Svg width={9} height={9} viewBox="0 0 24 24">
          <Path d="M7 10V7a5 5 0 0 1 10 0v3" stroke={palette.white} strokeWidth={2.4} strokeLinecap="round" fill="none" />
          <Path d="M5 10h14v10H5z" fill={palette.white} />
        </Svg>
      )}
    </View>
  );
}

function ProfileStat({ icon, value, label }: { icon: StatIconName; value: string | number; label: string }) {
  return (
    <Card style={styles.statCard}>
      <View style={styles.statIconChip}>
        <StatIcon name={icon} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Card>
  );
}

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
  const earnedCount = achievements.filter((a) => a.earned).length;
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
            <GearIcon />
          </PressableScale>
        </View>
      </StaggerIn>

      {/* ── Identity hero ── */}
      <StaggerIn index={1}>
        <Card style={styles.identityCard}>
          <PressableScale
            onPress={pickAvatar}
            accessibilityRole="button"
            accessibilityLabel="Change profile photo"
            style={styles.avatarWrap}
          >
            <View style={styles.avatarRing}>
              {profile.avatarUri ? (
                <Image source={{ uri: profile.avatarUri }} style={styles.avatar} />
              ) : (
                <LinearGradient colors={gradients.brandStrong} style={styles.avatar}>
                  <Text style={font('extrabold', 34, { color: palette.white })}>{initial}</Text>
                </LinearGradient>
              )}
            </View>
            <View style={styles.avatarEdit}>
              <CameraIcon />
            </View>
          </PressableScale>

          <Text style={styles.name} numberOfLines={1}>
            {profile.displayName}
          </Text>
          <Text style={styles.handle} numberOfLines={1}>
            @{profile.username || 'champion'}
          </Text>

          <View style={styles.rankPill}>
            <View style={styles.rankDot} />
            <Text style={styles.rankPillText}>
              {level.rankName} · Level {level.level}
            </Text>
          </View>

          <View style={styles.xpBlock}>
            <View style={styles.xpLabelRow}>
              <Text style={styles.xpNow}>{level.xpInLevel.toLocaleString()} XP</Text>
              <Text style={styles.xpNext}>
                {level.xpToNextLevel.toLocaleString()} to Level {level.level + 1}
              </Text>
            </View>
            <ProgressBar percent={level.percent} height={9} fillColors={gradients.brandStrong} />
          </View>
        </Card>
      </StaggerIn>

      {/* ── Stats ── */}
      <StaggerIn index={2}>
        {profile.sessions.length === 0 ? (
          <PressableScale
            onPress={() =>
              router.push({ pathname: '/session', params: { exercise: 'push', mode: 'practice' } })
            }
            accessibilityRole="button"
            accessibilityLabel="Start your first set"
          >
            <Card style={styles.emptyStats}>
              <View style={styles.emptyIconChip}>
                <Svg width={26} height={26} viewBox="0 0 24 24">
                  <Path d="M18 20V10M12 20V4M6 20v-6" stroke={palette.green700} strokeWidth={2.5} strokeLinecap="round" fill="none" />
                </Svg>
              </View>
              <Text style={font('extrabold', 16, { color: palette.ink, marginTop: 10 })}>
                No stats yet
              </Text>
              <Text style={[text.captionMd, { textAlign: 'center', marginTop: 4 }]}>
                Your reps, duels and streak land here after your first set.
              </Text>
              <View style={styles.emptyStatsCta}>
                <Text style={font('extrabold', 13, { color: palette.green700 })}>
                  Start your first set →
                </Text>
              </View>
            </Card>
          </PressableScale>
        ) : (
          <View style={styles.statGrid}>
            <View style={styles.statRow}>
              <ProfileStat icon="reps" value={totalReps.toLocaleString()} label="Total reps" />
              <ProfileStat icon="duels" value={duelsWon} label="Duels won" />
            </View>
            <View style={styles.statRow}>
              <ProfileStat icon="rate" value={`${winRate}%`} label="Win rate" />
              <ProfileStat icon="streak" value={bestStreak} label="Best streak" />
            </View>
          </View>
        )}
      </StaggerIn>

      {/* ── Achievements ── */}
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
                <BadgeStatus earned={a.earned} />
              </View>
              <Text style={styles.badgeLabel} numberOfLines={1}>
                {a.title}
              </Text>
            </Card>
          ))}
        </View>
      </StaggerIn>

      {/* ── Pro ── */}
      <StaggerIn index={4}>
        <View style={[styles.proCard, shadow.card]}>
          <View style={styles.proLogoBadge}>
            <Image source={require('../../assets/logo.png')} style={styles.proLogo} resizeMode="contain" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={font('extrabold', 14.5, { color: palette.ink })}>RepChamp Pro</Text>
            <Text style={text.caption}>
              {isPro ? 'Active — thanks for the support' : 'Full library, form history & stats'}
            </Text>
          </View>
          {isPro ? (
            <View style={styles.proBadge}>
              <Text style={font('extrabold', 12, { color: palette.green700 })}>PRO</Text>
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
        </View>

        <View style={styles.badgeProgressRow}>
          <Text style={styles.version}>
            {earnedCount} / {ACHIEVEMENTS.length} badges unlocked
          </Text>
        </View>
      </StaggerIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  settingsRow: { alignItems: 'flex-end', marginTop: 8, marginBottom: 2 },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },

  /* Identity */
  identityCard: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 20 },
  avatarWrap: { marginBottom: 12 },
  avatarRing: {
    width: 96,
    height: 96,
    borderRadius: 30,
    padding: 3,
    backgroundColor: palette.green50,
    borderWidth: 2,
    borderColor: palette.green200,
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEdit: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  name: { ...font('extrabold', 22, { color: palette.ink }) },
  handle: { ...font('bold', 13, { color: palette.grey550 }), marginTop: 2 },
  rankPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 12,
    backgroundColor: palette.green50,
    borderWidth: 1,
    borderColor: palette.green200,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 13,
  },
  rankDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: palette.green500 },
  rankPillText: font('extrabold', 12.5, { color: palette.green700 }),
  xpBlock: { alignSelf: 'stretch', marginTop: 18 },
  xpLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  xpNow: font('extrabold', 12.5, { color: palette.ink }),
  xpNext: font('bold', 11.5, { color: palette.grey550 }),

  /* Empty stats */
  emptyStats: { alignItems: 'center', padding: 24, marginTop: 16 },
  emptyIconChip: {
    width: 56,
    height: 56,
    borderRadius: radius.xl,
    backgroundColor: palette.green50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStatsCta: {
    marginTop: 14,
    backgroundColor: palette.green50,
    borderWidth: 1,
    borderColor: '#bfeccb',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },

  /* Stat grid */
  statGrid: { gap: 12, marginVertical: 16 },
  statRow: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, padding: 16 },
  statIconChip: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: palette.green50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  statValue: { ...font('extrabold', 24, { color: palette.ink }) },
  statLabel: { ...font('bold', 12, { color: palette.grey550 }), marginTop: 2 },

  /* Achievements */
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  badgeRow: { flexDirection: 'row', gap: 12 },
  badgeTile: { flex: 1, alignItems: 'center', paddingVertical: 16, paddingHorizontal: 8 },
  badgeLocked: { opacity: 0.55 },
  badgeIconWrap: {
    position: 'relative',
    width: 48,
    height: 48,
    borderRadius: 24,
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
    width: 17,
    height: 17,
    borderRadius: 8.5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: palette.white,
  },
  badgeDotUnlocked: { backgroundColor: palette.green500 },
  badgeDotLocked: { backgroundColor: palette.grey500 },
  badgeLabel: {
    ...font('extrabold', 10.5, { color: palette.ink }),
    marginTop: 10,
    textAlign: 'center',
  },

  /* Pro */
  proCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    marginTop: 22,
    borderRadius: radius['2xl'],
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.border,
  },
  proLogoBadge: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: palette.green50,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  proLogo: { width: 27, height: 27 },
  proBadge: {
    backgroundColor: palette.green50,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  proButton: {
    backgroundColor: palette.green500,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
  },
  badgeProgressRow: { marginTop: 16 },
  version: {
    ...text.caption,
    color: palette.grey450,
    textAlign: 'center',
  },
});

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar, Card, PressableScale, Screen, SectionLabel } from '@/components/ui';
import { StaggerIn } from '@/components/motion';
import { WeeklyChallengeCard } from '@/components/WeeklyChallengeCard';
import { buildLeaderboard, type LeaderboardRow } from '@/domain/leaderboard';
import { usePhantomSeed } from '@/domain/seedPhantoms';
import { selectLeague, selectWeeklyXp, useProfileStore } from '@/state/profileStore';
import { font, text } from '@/theme/typography';
import { gradients, palette, radius, shadow } from '@/theme/tokens';

const BADGES = ['🥇', '🥈', '🥉'];

/** A leaderboard row, plus the optional AI-partner fields injected when seeding. */
type BoardRow = LeaderboardRow & { emoji?: string; isAI?: boolean };

export default function ArenaScreen() {
  const router = useRouter();
  const profile = useProfileStore();

  const weeklyXp = selectWeeklyXp(profile);
  const league = selectLeague(profile);
  const seed = usePhantomSeed();

  // Build the leaderboard, then inject phantom users when seeding.
  const baseBoard = buildLeaderboard(weeklyXp, profile.username || 'You');
  const board: BoardRow[] = seed.isSeeding
    ? [
        ...baseBoard,
        ...seed.phantomLeaderboard.map((p): BoardRow => ({
          id: p.id,
          name: p.name,
          initial: p.initial,
          xp: p.xp,
          level: p.level,
          background: p.tintBg,
          color: p.tintColor,
          rank: 0,
          isYou: false,
          emoji: p.emoji,
          isAI: p.isAI,
        })),
      ]
        .sort((a, b) => (b.xp !== a.xp ? b.xp - a.xp : a.isYou ? -1 : b.isYou ? 1 : 0))
        .map((row, idx) => ({ ...row, rank: idx + 1 }))
    : baseBoard;
  const you = board.find((row) => row.isYou);
  const top = board.slice(0, 3);

  return (
    <Screen>
      <StaggerIn index={0}>
        <Text style={[text.h1, { marginTop: 14, marginBottom: 20 }]}>Arena</Text>
      </StaggerIn>

      <StaggerIn index={1}>
        <PressableScale
          onPress={() => router.push('/modal/opponent-picker')}
          accessibilityRole="button"
          accessibilityLabel="Start a 1 versus 1 duel"
        >
          <LinearGradient colors={gradients.brandStrong} style={[styles.heroCard, shadow.brand]}>
            <Text style={styles.heroWatermark}>⚔️</Text>
            <Text style={styles.heroEyebrow}>HEAD TO HEAD</Text>
            <Text style={font('extrabold', 24, { color: palette.white, marginTop: 6 })}>
              1 vs 1 Duel
            </Text>
            <Text style={styles.heroCopy}>
              Challenge a friend to a live rep fight. Winner takes the XP.
            </Text>
            <View style={styles.heroCta}>
              <Text style={font('extrabold', 14, { color: palette.green600 })}>Start a duel →</Text>
            </View>
          </LinearGradient>
        </PressableScale>
      </StaggerIn>

      <StaggerIn index={2} style={{ marginTop: 14 }}>
        <WeeklyChallengeCard />
      </StaggerIn>

      <StaggerIn index={3}>
        <PressableScale
          onPress={() => router.push('/modal/leaderboard')}
          accessibilityRole="button"
          accessibilityLabel="Open the weekly leaderboard"
          style={{ marginTop: 14 }}
        >
          <Card style={styles.boardCard}>
            <View style={styles.boardHeader}>
              <View style={styles.boardTitle}>
                <Text style={{ fontSize: 20 }}>🏆</Text>
                <SectionLabel>Weekly Leaderboard</SectionLabel>
              </View>
              <Text style={font('extrabold', 12, { color: palette.green600 })}>See all ›</Text>
            </View>

            {top.map((row, idx) => (
              <View key={row.id} style={styles.boardRow}>
                <Text style={{ fontSize: 16, width: 26, textAlign: 'center' }}>
                  {BADGES[idx] ?? row.rank}
                </Text>
                <Avatar
                  initial={row.initial}
                  emoji={'emoji' in row ? row.emoji : undefined}
                  size={36}
                  background={row.background}
                  color={row.color}
                />
                <View style={styles.boardNameWrap}>
                  <Text style={styles.boardName} numberOfLines={1}>
                    {row.name}
                  </Text>
                  {'isAI' in row && row.isAI ? (
                    <View style={styles.aiPill}>
                      <Text style={font('extrabold', 8, { color: palette.green700 })}>AI</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={font('extrabold', 13.5, { color: palette.ink })}>
                  {row.xp.toLocaleString()} <Text style={font('bold', 10.5, { color: palette.grey500 })}>XP</Text>
                </Text>
              </View>
            ))}

            {you && you.rank > 3 ? (
              <View style={styles.youRow}>
                <Text style={[styles.rank, { color: palette.green600 }]}>{you.rank}</Text>
                {profile.avatarUri ? (
                  <Image source={{ uri: profile.avatarUri }} style={styles.youAvatar} contentFit="cover" />
                ) : (
                  <LinearGradient colors={gradients.brandStrong} style={styles.youAvatar}>
                    <Text style={font('extrabold', 13, { color: palette.white })}>
                      {you.initial}
                    </Text>
                  </LinearGradient>
                )}
                <Text style={styles.boardName}>You</Text>
                <Text style={font('extrabold', 13.5, { color: palette.green600 })}>
                  {you.xp.toLocaleString()} XP
                </Text>
              </View>
            ) : null}

            <Text style={styles.boardFooter}>
              {league.name} League · {weeklyXp.toLocaleString()} XP this week
            </Text>
          </Card>
        </PressableScale>
      </StaggerIn>

      <StaggerIn index={4}>
        <PressableScale
          onPress={() => router.push('/modal/daily')}
          accessibilityRole="button"
          accessibilityLabel="Daily challenge"
          style={{ marginTop: 14 }}
        >
          <LinearGradient colors={gradients.amber} style={[styles.dailyCard, shadow.amber]}>
            <View style={styles.dailyIcon}>
              <Text style={{ fontSize: 20 }}>🎯</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={font('extrabold', 15, { color: palette.white })}>Daily Challenge</Text>
              <Text style={font('semibold', 11, { color: 'rgba(255,255,255,0.9)' })}>
                Beat 25 push-ups · resets at midnight
              </Text>
            </View>
            <Text style={{ color: palette.white, fontSize: 20 }}>›</Text>
          </LinearGradient>
        </PressableScale>
      </StaggerIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroCard: { borderRadius: radius['6xl'], padding: 22, overflow: 'hidden' },
  heroWatermark: { position: 'absolute', right: -10, top: -6, fontSize: 96, opacity: 0.18 },
  heroEyebrow: {
    ...font('extrabold', 11, { color: 'rgba(255,255,255,0.85)' }),
    letterSpacing: 1.5,
  },
  heroCopy: {
    ...font('semibold', 13, { color: 'rgba(255,255,255,0.9)' }),
    maxWidth: 220,
    marginTop: 4,
  },
  heroCta: {
    marginTop: 16,
    alignSelf: 'flex-start',
    backgroundColor: palette.white,
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: radius.xl,
  },
  boardCard: { padding: 18 },
  boardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  boardTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  boardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 9,
    paddingHorizontal: 8,
  },
  rank: { ...font('extrabold', 14), width: 22 },
  boardName: { ...font('extrabold', 14, { color: palette.ink }) },
  boardNameWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  aiPill: {
    backgroundColor: palette.green50,
    borderWidth: 1,
    borderColor: '#bfeccb',
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  youRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 8,
    borderRadius: radius.lg,
    backgroundColor: palette.green50,
    borderWidth: 1.5,
    borderColor: palette.green200,
    marginTop: 4,
  },
  youAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  boardFooter: {
    ...font('extrabold', 11, { color: palette.green600 }),
    textAlign: 'center',
    marginTop: 12,
  },
  dailyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: radius['3xl'],
  },
  dailyIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

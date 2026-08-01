import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Avatar, Card, PressableScale, Screen, SectionLabel } from '@/components/ui';
import { StaggerIn } from '@/components/motion';
import { WeeklyChallengeCard } from '@/components/WeeklyChallengeCard';
import { captureError } from '@/lib/crash';
import { buildLeaderboard, type LeaderboardRow } from '@/domain/leaderboard';
import { usePhantomSeed } from '@/domain/seedPhantoms';
import { fetchLeaderboard } from '@/services/leaderboardService';
import { useAuthStore } from '@/state/authStore';
import { selectLeague, selectWeeklyXp, useProfileStore } from '@/state/profileStore';
import { font, text } from '@/theme/typography';
import { gradients, palette, radius, shadow } from '@/theme/tokens';

/** A leaderboard row, plus the optional AI-partner fields injected when seeding. */
type BoardRow = LeaderboardRow & { emoji?: string; isAI?: boolean };

/** A soft pulsing ring behind the "LIVE" dot — signals the duel is real-time. */
function LivePulse() {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 1600 }), -1, false);
  }, [t]);
  const ring = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + t.value * 1.8 }],
    opacity: 0.55 * (1 - t.value),
  }));
  return (
    <View style={styles.liveWrap}>
      <View style={styles.liveDotWrap}>
        <Animated.View style={[styles.liveRing, ring]} />
        <View style={styles.liveDot} />
      </View>
      <Text style={styles.liveText}>LIVE</Text>
    </View>
  );
}

/** Numbered rank medallion — green intensity carries the podium hierarchy. */
function RankMedal({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <LinearGradient colors={gradients.brandStrong} style={styles.medal}>
        <Text style={[styles.medalText, { color: palette.white }]}>1</Text>
      </LinearGradient>
    );
  }
  const second = rank === 2;
  return (
    <View
      style={[
        styles.medal,
        {
          backgroundColor: second ? palette.green50 : palette.white,
          borderWidth: 1.5,
          borderColor: second ? palette.green200 : palette.border,
        },
      ]}
    >
      <Text style={[styles.medalText, { color: second ? palette.green700 : palette.slate500 }]}>
        {rank}
      </Text>
    </View>
  );
}

function TrophyIcon({ size = 17, color = palette.green700 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M8 21h8M12 17.5V21M6 4h12v4.5a6 6 0 0 1-12 0V4z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d="M6 6H3.5v1A3.5 3.5 0 0 0 6 10.4M18 6h2.5v1A3.5 3.5 0 0 1 18 10.4"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

export default function ArenaScreen() {
  const router = useRouter();
  const profile = useProfileStore();
  const uid = useAuthStore((s) => s.user?.uid);

  const weeklyXp = selectWeeklyXp(profile);
  const league = selectLeague(profile);
  const seed = usePhantomSeed();
  const username = profile.username || 'You';

  // Local board paints instantly; swap to Firestore once it resolves.
  const [cloudBoard, setCloudBoard] = useState<LeaderboardRow[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchLeaderboard(uid ?? '__you__', weeklyXp, username)
      .then((rows) => {
        if (!cancelled) setCloudBoard(rows);
      })
      .catch(captureError);
    return () => {
      cancelled = true;
    };
  }, [uid, weeklyXp, username]);

  const baseBoard = cloudBoard ?? buildLeaderboard(weeklyXp, username);
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
  const myInitial = (profile.username || 'You').charAt(0).toUpperCase();

  return (
    <Screen>
      <StaggerIn index={0}>
        <View style={styles.header}>
          <Text style={text.h1}>Arena</Text>
          <View style={styles.leaguePill}>
            <View style={styles.leagueDot} />
            <Text style={styles.leaguePillText}>
              {league.name}
              {you ? ` · #${you.rank}` : ''}
            </Text>
          </View>
        </View>
      </StaggerIn>

      {/* ── Hero: live 1v1 duel with a personal face-off ── */}
      <StaggerIn index={1} style={{ marginTop: 16 }}>
        <PressableScale
          onPress={() => router.push('/modal/opponent-picker')}
          accessibilityRole="button"
          accessibilityLabel="Start a 1 versus 1 duel"
        >
          <LinearGradient colors={gradients.brandStrong} style={[styles.heroCard, shadow.brand]}>
            <View style={styles.heroTopRow}>
              <Text style={styles.heroEyebrow}>HEAD TO HEAD</Text>
              <LivePulse />
            </View>

            <Text style={styles.heroTitle}>1 vs 1 Duel</Text>
            <Text style={styles.heroCopy}>
              Challenge a rival to a live rep fight. Winner takes the XP.
            </Text>

            <View style={styles.vsRow}>
              <View style={styles.vsSide}>
                <View style={styles.heroAvatar}>
                  {profile.avatarUri ? (
                    <Image source={{ uri: profile.avatarUri }} style={styles.heroAvatarImg} contentFit="cover" />
                  ) : (
                    <Text style={styles.heroAvatarInitial}>{myInitial}</Text>
                  )}
                </View>
                <Text style={styles.vsName}>You</Text>
              </View>

              <View style={styles.vsChip}>
                <Text style={styles.vsChipText}>VS</Text>
              </View>

              <View style={styles.vsSide}>
                <View style={styles.heroAvatarGhost}>
                  <Text style={styles.heroGhostQ}>?</Text>
                </View>
                <Text style={styles.vsName}>Rival</Text>
              </View>
            </View>

            <View style={styles.heroCta}>
              <Text style={styles.heroCtaText}>Find an opponent</Text>
              <Text style={styles.heroCtaArrow}>→</Text>
            </View>
          </LinearGradient>
        </PressableScale>
      </StaggerIn>

      <StaggerIn index={2} style={{ marginTop: 12 }}>
        <WeeklyChallengeCard />
      </StaggerIn>

      {/* ── Weekly leaderboard ── */}
      <StaggerIn index={3}>
        <PressableScale
          onPress={() => router.push('/modal/leaderboard')}
          accessibilityRole="button"
          accessibilityLabel="Open the weekly leaderboard"
          style={{ marginTop: 12 }}
        >
          <Card style={styles.boardCard}>
            <View style={styles.boardHeader}>
              <View style={styles.boardTitle}>
                <View style={styles.trophyChip}>
                  <TrophyIcon />
                </View>
                <SectionLabel>Weekly Leaderboard</SectionLabel>
              </View>
              <Text style={styles.seeAll}>See all ›</Text>
            </View>

            {top.map((row, idx) => (
              <View
                key={row.id}
                style={[styles.boardRow, idx === 0 && styles.boardRowLead]}
              >
                <RankMedal rank={row.rank} />
                <Avatar
                  initial={row.initial}
                  emoji={'emoji' in row ? row.emoji : undefined}
                  size={38}
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
                <Text style={styles.boardXp}>
                  {row.xp.toLocaleString()}{' '}
                  <Text style={font('bold', 10.5, { color: palette.grey500 })}>XP</Text>
                </Text>
              </View>
            ))}

            {you && you.rank > 3 ? (
              <View style={styles.youRow}>
                <View style={styles.youRankWrap}>
                  <Text style={styles.youRank}>{you.rank}</Text>
                </View>
                {profile.avatarUri ? (
                  <Image source={{ uri: profile.avatarUri }} style={styles.youAvatar} contentFit="cover" />
                ) : (
                  <LinearGradient colors={gradients.brandStrong} style={styles.youAvatar}>
                    <Text style={font('extrabold', 14, { color: palette.white })}>{you.initial}</Text>
                  </LinearGradient>
                )}
                <Text style={[styles.boardName, { flex: 1 }]}>You</Text>
                <Text style={styles.boardXp}>
                  {you.xp.toLocaleString()}{' '}
                  <Text style={font('bold', 10.5, { color: palette.green600 })}>XP</Text>
                </Text>
              </View>
            ) : null}

            <View style={styles.boardFooter}>
              <Text style={styles.boardFooterText}>
                {league.name} League · {weeklyXp.toLocaleString()} XP this week
              </Text>
            </View>
          </Card>
        </PressableScale>
      </StaggerIn>

      {/* ── Daily challenge ── */}
      <StaggerIn index={4}>
        <PressableScale
          onPress={() => router.push('/modal/daily')}
          accessibilityRole="button"
          accessibilityLabel="Daily challenge"
          style={{ marginTop: 12 }}
        >
          <Card style={styles.dailyCard}>
            <View style={styles.dailyIcon}>
              <View style={styles.targetRing} />
              <View style={styles.targetDot} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={font('extrabold', 15, { color: palette.ink })}>Daily Challenge</Text>
              <Text style={text.caption}>Beat 25 push-ups · resets at midnight</Text>
            </View>
            <View style={styles.dailyGo}>
              <Text style={styles.dailyGoArrow}>›</Text>
            </View>
          </Card>
        </PressableScale>
      </StaggerIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leaguePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: palette.green50,
    borderWidth: 1,
    borderColor: palette.green200,
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  leagueDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: palette.green500 },
  leaguePillText: font('extrabold', 12, { color: palette.green700 }),

  /* Hero */
  heroCard: { borderRadius: radius['6xl'], padding: 20, overflow: 'hidden' },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroEyebrow: {
    ...font('extrabold', 11, { color: 'rgba(255,255,255,0.85)' }),
    letterSpacing: 1.5,
  },
  liveWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  liveDotWrap: { width: 8, height: 8, alignItems: 'center', justifyContent: 'center' },
  liveRing: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.white,
  },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: palette.white },
  liveText: { ...font('extrabold', 9.5, { color: palette.white }), letterSpacing: 1 },

  heroTitle: { ...font('extrabold', 25, { color: palette.white }), marginTop: 12 },
  heroCopy: {
    ...font('semibold', 13, { color: 'rgba(255,255,255,0.9)' }),
    maxWidth: 250,
    marginTop: 4,
    lineHeight: 18,
  },

  vsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginTop: 20,
  },
  vsSide: { alignItems: 'center', gap: 8 },
  heroAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: palette.white,
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroAvatarImg: { width: 52, height: 52 },
  heroAvatarInitial: font('extrabold', 20, { color: palette.green700 }),
  heroAvatarGhost: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.55)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroGhostQ: font('extrabold', 22, { color: palette.white }),
  vsName: { ...font('extrabold', 12, { color: 'rgba(255,255,255,0.92)' }) },
  vsChip: {
    backgroundColor: palette.white,
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 12,
    ...shadow.card,
  },
  vsChipText: { ...font('extrabold', 12, { color: palette.green700 }), letterSpacing: 0.5 },

  heroCta: {
    marginTop: 20,
    alignSelf: 'stretch',
    backgroundColor: palette.white,
    height: 50,
    borderRadius: radius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  heroCtaText: font('extrabold', 15, { color: palette.green600 }),
  heroCtaArrow: font('extrabold', 16, { color: palette.green600 }),

  /* Leaderboard */
  boardCard: { padding: 16 },
  boardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  boardTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trophyChip: {
    width: 30,
    height: 30,
    borderRadius: radius.md,
    backgroundColor: palette.green50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seeAll: font('extrabold', 12, { color: palette.green600 }),
  boardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: radius.lg,
  },
  boardRowLead: { backgroundColor: palette.green50 },
  medal: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalText: font('extrabold', 13),
  boardName: { ...font('extrabold', 14, { color: palette.ink }) },
  boardNameWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  boardXp: font('extrabold', 13.5, { color: palette.ink }),
  aiPill: {
    backgroundColor: palette.green50,
    borderWidth: 1,
    borderColor: '#bfeccb',
    borderRadius: radius.xs,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  youRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: radius.lg,
    backgroundColor: palette.green50,
    borderWidth: 1.5,
    borderColor: palette.green200,
    marginTop: 4,
  },
  youRankWrap: { width: 28, alignItems: 'center' },
  youRank: font('extrabold', 14, { color: palette.green600 }),
  youAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  boardFooter: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: palette.divider,
  },
  boardFooterText: {
    ...font('extrabold', 11.5, { color: palette.green600 }),
    textAlign: 'center',
  },

  /* Daily */
  dailyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  dailyIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.lg,
    backgroundColor: palette.green50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetRing: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2.4,
    borderColor: palette.green500,
  },
  targetDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.green500,
  },
  dailyGo: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: palette.green50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dailyGoArrow: { ...font('extrabold', 18, { color: palette.green600 }), marginTop: -2 },
});

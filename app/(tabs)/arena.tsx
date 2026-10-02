import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ArrowIcon } from '@/components/home/Icons';
import { Avatar, Card, PressableScale, Screen, SectionLabel } from '@/components/ui';
import { StaggerIn } from '@/components/motion';
import { WeeklyChallengeCard } from '@/components/WeeklyChallengeCard';
import { track } from '@/lib/analytics';
import { useTabView } from '@/lib/useTabView';
import { captureError } from '@/lib/crash';
import { leagueProgressFromWeeklyXp } from '@/domain/leagueProgress';
import { buildLeaderboard, type LeaderboardRow } from '@/domain/leaderboard';
import { usePhantomSeed } from '@/domain/seedPhantoms';
import { fetchLeaderboard } from '@/services/leaderboardService';
import { useAuthStore } from '@/state/authStore';
import { selectLeague, selectWeeklyXp, useProfileStore } from '@/state/profileStore';
import { font, text } from '@/theme/typography';
import { palette, radius, shadow, surfaceShadow } from '@/theme/tokens';

const IC_TROPHY = require('../../assets/trophy-bronze.png');
const IC_TARGET = require('../../assets/ic-target.png');
const BADGE_VS = require('../../assets/badge-vs.png');
const BADGE_LIVE = require('../../assets/badge-live.png');

/** A leaderboard row, plus the optional AI-partner fields injected when seeding. */
type BoardRow = LeaderboardRow & { emoji?: string; isAI?: boolean };

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
  useTabView('arena');
  const router = useRouter();
  const profile = useProfileStore();
  const uid = useAuthStore((s) => s.user?.uid);

  const weeklyXp = selectWeeklyXp(profile);
  const league = selectLeague(profile);
  const seed = usePhantomSeed();
  const username = profile.username || 'You';

  /* The instant the weekly card renders against. Owned here rather than read
     inside the card so its countdown, challenge and day-set all describe the
     same moment; re-read whenever the screen returns to the foreground, since
     this tab has no other reason to re-render and the card would otherwise sit
     frozen on the week it mounted in. */
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(new Date());
    });
    return () => sub.remove();
  }, []);

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
  const leagueProgress = leagueProgressFromWeeklyXp(weeklyXp);
  const you = board.find((row) => row.isYou);
  const top = board.slice(0, 3);
  const myInitial = (profile.username || 'You').charAt(0).toUpperCase();

  return (
    <Screen>
      <StaggerIn index={0}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow} numberOfLines={1}>
              {you ? `Rank #${you.rank} this week` : 'Compete this week'}
            </Text>
            <Text style={styles.title} accessibilityRole="header">
              Arena
            </Text>
          </View>
          <View style={styles.leaguePill}>
            <Image source={IC_TROPHY} style={styles.leaguePillIcon} contentFit="contain" />
            <Text style={styles.leaguePillText}>{league.name}</Text>
          </View>
        </View>
      </StaggerIn>

      {/* ── League progress: where this week's XP is taking you ── */}
      <StaggerIn index={1} style={{ marginTop: 16 }}>
        <View style={styles.leagueCard}>
          <Image source={IC_TROPHY} style={styles.leagueTrophy} contentFit="contain" />
          <View style={{ flex: 1 }}>
            <Text style={styles.leagueTitle}>{leagueProgress.title}</Text>
            <Text style={styles.leagueSub}>
              {leagueProgress.nextLeague
                ? `${leagueProgress.xpToNext.toLocaleString()} XP to ${leagueProgress.nextLeague.name}`
                : 'Top league — hold your spot'}
            </Text>
            <View style={styles.leagueTrack}>
              <View style={[styles.leagueFill, { width: `${Math.max(4, Math.round(leagueProgress.fill * 100))}%` }]} />
            </View>
          </View>
          <View style={styles.leagueXp}>
            <Text style={styles.leagueXpValue}>{weeklyXp.toLocaleString()}</Text>
            <Text style={styles.leagueXpUnit}>XP</Text>
          </View>
        </View>
      </StaggerIn>

      {/* ── Hero: live 1v1 duel with a personal face-off ── */}
      <StaggerIn index={2} style={{ marginTop: 12 }}>
        <PressableScale
          onPress={() => {
            track('arena_opened', { destination: 'opponent-picker' });
            router.push('/modal/opponent-picker');
          }}
          accessibilityRole="button"
          accessibilityLabel="Start a 1 versus 1 duel"
        >
          {/* Flat, one deep green: the tab's single coloured block. The bright
              gradient, brand glow and a pulsing LIVE badge read as decoration
              rather than a control. */}
          <View style={styles.heroCard}>
            <View style={styles.heroTop}>
              <Text style={styles.heroEyebrow}>Head to head</Text>
              <Image source={BADGE_LIVE} style={styles.liveBadge} contentFit="contain" />
            </View>

            <Text style={styles.heroTitle}>1 vs 1 duel</Text>
            <Text style={styles.heroCopy}>
              Race a rival rep for rep, live. The winner gets the XP.
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

              <Image source={BADGE_VS} style={styles.vsBadge} contentFit="contain" />

              <View style={styles.vsSide}>
                <View style={styles.heroAvatarGhost}>
                  <Text style={styles.heroGhostQ}>?</Text>
                </View>
                <Text style={styles.vsName}>Rival</Text>
              </View>
            </View>

            <View style={styles.heroCta}>
              <Text style={styles.heroCtaText}>Find an opponent</Text>
              <ArrowIcon size={16} color={palette.green700} strokeWidth={2.4} />
            </View>
          </View>
        </PressableScale>
      </StaggerIn>

      <StaggerIn index={3} style={{ marginTop: 12 }}>
        <WeeklyChallengeCard now={now} />
      </StaggerIn>

      {/* ── Weekly leaderboard ── */}
      <StaggerIn index={4}>
        <PressableScale
          onPress={() => {
            track('arena_opened', { destination: 'leaderboard' });
            router.push('/modal/leaderboard');
          }}
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
                <SectionLabel>Weekly leaderboard</SectionLabel>
              </View>
              <Text style={styles.seeAll}>See all ›</Text>
            </View>

            <View style={styles.podium}>
              {[top[1], top[0], top[2]].map((row, slot) => {
                if (!row) return <View key={slot} style={{ flex: 1 }} />;
                const first = row.rank === 1;
                return (
                  <View key={row.id} style={[styles.podiumCol, first && styles.podiumColFirst]}>
                    <Avatar
                      initial={row.initial}
                      emoji={'emoji' in row ? row.emoji : undefined}
                      size={first ? 56 : 46}
                      background={row.background}
                      color={row.color}
                    />
                    <Text style={styles.podiumName} numberOfLines={1}>
                      {row.isYou ? 'You' : row.name}
                    </Text>
                    <Text style={styles.podiumXp}>{row.xp.toLocaleString()} XP</Text>
                    <View style={[styles.podiumStep, first && styles.podiumStepFirst]}>
                      <Text style={[styles.podiumRank, first && { color: palette.white }]}>{row.rank}</Text>
                    </View>
                  </View>
                );
              })}
            </View>

            {you && you.rank > 3 ? (
              <View style={styles.youRow}>
                <View style={styles.youRankWrap}>
                  <Text style={styles.youRank}>{you.rank}</Text>
                </View>
                {profile.avatarUri ? (
                  <Image source={{ uri: profile.avatarUri }} style={styles.youAvatar} contentFit="cover" />
                ) : (
                  <View style={[styles.youAvatar, { backgroundColor: palette.green600 }]}>
                    <Text style={font('extrabold', 14, { color: palette.white })}>{you.initial}</Text>
                  </View>
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
      <StaggerIn index={5}>
        <PressableScale
          onPress={() => {
            track('arena_opened', { destination: 'daily' });
            router.push('/modal/daily');
          }}
          accessibilityRole="button"
          accessibilityLabel="Daily challenge"
          style={{ marginTop: 12 }}
        >
          <Card style={styles.dailyCard}>
            <View style={styles.dailyIcon}>
              <Image source={IC_TARGET} style={{ width: 30, height: 30 }} contentFit="contain" />
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
  header: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
  eyebrow: font('semibold', 13, { color: palette.grey600 }),
  title: { ...font('extrabold', 28, { color: palette.ink }), letterSpacing: -0.8 },
  leaguePillIcon: { width: 18, height: 18 },

  leagueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius['4xl'],
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
    ...surfaceShadow,
  },
  leagueTrophy: { width: 52, height: 52 },
  leagueTitle: { ...font('extrabold', 17, { color: palette.ink }), letterSpacing: -0.4 },
  leagueSub: { ...font('medium', 12.5, { color: palette.grey600 }), marginTop: 1 },
  leagueTrack: { height: 8, borderRadius: 4, backgroundColor: palette.divider, marginTop: 8, overflow: 'hidden' },
  leagueFill: { height: 8, borderRadius: 4, backgroundColor: palette.green500 },
  leagueXp: { alignItems: 'flex-end' },
  leagueXpValue: { ...font('extrabold', 22, { color: palette.ink }), fontVariant: ['tabular-nums'], letterSpacing: -0.6 },
  leagueXpUnit: font('bold', 11, { color: palette.grey500 }),

  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  liveBadge: { width: 52, height: 22 },
  vsBadge: { width: 44, height: 44 },

  podium: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 4 },
  podiumCol: { flex: 1, alignItems: 'center' },
  podiumColFirst: { marginBottom: 0 },
  podiumName: { ...font('extrabold', 13, { color: palette.ink }), marginTop: 6, maxWidth: '100%' },
  podiumXp: { ...font('bold', 11, { color: palette.grey600 }), fontVariant: ['tabular-nums'], marginBottom: 6 },
  podiumStep: {
    width: '100%',
    height: 34,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    backgroundColor: palette.green50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  podiumStepFirst: { height: 56, backgroundColor: palette.green600 },
  podiumRank: font('extrabold', 18, { color: palette.green700 }),
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
  heroCard: { borderRadius: radius['6xl'], padding: 20, overflow: 'hidden', backgroundColor: '#0B5132' },
  heroEyebrow: font('semibold', 13, { color: 'rgba(255,255,255,0.72)' }),

  heroTitle: { ...font('extrabold', 26, { color: palette.white }), marginTop: 6, letterSpacing: -0.5 },
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
  vsChipText: font('bold', 12, { color: palette.green700 }),

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
  heroCtaText: font('bold', 15, { color: palette.green700 }),

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

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { track } from '@/lib/analytics';
import { HomeAmbient } from '@/components/home/HomeAmbient';
import { buildHomeHeroSlides, HeroCarousel } from '@/components/home/HeroCarousel';
import { HeroCard } from '@/components/home/HeroCard';
import { CoupleStrip } from '@/components/home/CoupleStrip';
import { CountUp, PopOnChange, StaggerIn } from '@/components/motion';
import { Avatar, Card, PressableScale, Screen, SectionLabel } from '@/components/ui';
import { exerciseHomeStats } from '@/domain/exerciseHomeStats';
import { firstNameOf, selectHomeGreeting } from '@/domain/homeGreeting';
import { selectHomeFocus, type HomeFocus } from '@/domain/homeFocus';
import { leagueProgressFromWeeklyXp } from '@/domain/leagueProgress';
import { liveActivity } from '@/domain/liveActivity';
import { usePhantomSeed } from '@/domain/seedPhantoms';
import { dayKey } from '@/domain/progression';
import {
  useProfileStore,
  selectDaysTrainedThisWeek,
  selectLevel,
  selectStreak,
  selectWeeklyXp,
} from '@/state/profileStore';
import { useCouple } from '@/state/useCouple';
import { useIncomingDuelCount } from '@/state/useIncomingDuelCount';
import { useLiveActivityCount } from '@/state/useLiveActivityCount';
import { useSelfPlayer } from '@/state/useSelfPlayer';
import type { ExerciseId } from '@/vision/exercises';
import { font } from '@/theme/typography';
import { gradients, palette, shadow, radius } from '@/theme/tokens';
import { showDialog } from '@/state/useDialog';

/** Push-ups is the featured daily challenge; mirrors `app/modal/daily.tsx`. */
const DAILY_EXERCISE: ExerciseId = 'push';
const DAILY_TARGET = 25;

const MEDAL_BRONZE = require('../../assets/medal-bronze.png');
const TROPHY_BRONZE = require('../../assets/trophy-bronze.png');
const BADGE_VS = require('../../assets/badge-vs.png');
const IC_PUSHUP = require('../../assets/ic-pushup.png');
const IC_SQUAT = require('../../assets/ic-squat.png');

export default function HomeScreen() {
  const router = useRouter();
  const profile = useProfileStore();
  const couple = useCouple();
  const self = useSelfPlayer();

  const level = selectLevel(profile);
  const weeklyXp = selectWeeklyXp(profile);
  const leagueProgress = useMemo(() => leagueProgressFromWeeklyXp(weeklyXp), [weeklyXp]);
  const streak = selectStreak(profile);
  const daysTrained = selectDaysTrainedThisWeek(profile);
  const goal = profile.weeklyGoal;
  const initial = (profile.username || 'C').charAt(0).toUpperCase();
  const pendingDuels = useIncomingDuelCount();
  const firstName = firstNameOf(profile.displayName || profile.username);

  const seed = usePhantomSeed();
  const realActive = useLiveActivityCount();
  const activity = liveActivity(realActive, seed.phantomOnline.length, seed.isSeeding);

  const today = dayKey();
  const trainedToday = profile.sessions.some((s) => s.day === today);
  const dailyBest = profile.sessions
    .filter((s) => s.day === today && s.exercise === DAILY_EXERCISE)
    .reduce((best, s) => Math.max(best, s.reps), 0);

  const greetingCopy = useMemo(
    () => selectHomeGreeting({ streak, trainedToday, firstName }),
    [streak, trainedToday, firstName],
  );

  const pushStats = useMemo(
    () => exerciseHomeStats(profile.sessions, 'push', today),
    [profile.sessions, today],
  );
  const squatStats = useMemo(
    () => exerciseHomeStats(profile.sessions, 'squat', today),
    [profile.sessions, today],
  );

  const focus = useMemo<HomeFocus>(
    () =>
      selectHomeFocus({
        hasTrained: profile.sessions.length > 0,
        trainedToday,
        daysThisWeek: daysTrained,
        weeklyGoal: goal,
        couple: {
          paired: couple.paired,
          awaitingPartner: couple.awaitingPartner,
          partnerName: couple.partner?.displayName ?? null,
          streak: couple.streak,
          atRisk: couple.atRisk,
          partnerTrainedToday: couple.partner?.trainedDays.includes(today) ?? false,
        },
        dailyChallenge: {
          exercise: DAILY_EXERCISE,
          target: DAILY_TARGET,
          done: dailyBest >= DAILY_TARGET,
        },
      }),
    [profile.sessions.length, trainedToday, daysTrained, goal, couple, today, dailyBest],
  );

  useEffect(() => {
    track('home_hero_shown', { kind: focus.kind });
  }, [focus.kind]);

  /** Route the adaptive hero's single CTA when an urgent focus wins over the carousel. */
  const startCoupleTrain = () => {
    if (!couple.paired || !couple.partner || !self) {
      router.push('/modal/couple-invite');
      return;
    }
    router.push({
      pathname: '/duel/new',
      params: {
        role: 'host',
        kind: 'train',
        target: couple.partner.uid,
        name: couple.partner.displayName,
      },
    });
  };

  const onHeroPress = () => {
    track('home_hero_tapped', { kind: focus.kind });
    switch (focus.kind) {
      case 'first-session':
        return router.push({ pathname: '/session', params: { exercise: 'push', mode: 'practice' } });
      case 'streak-at-risk':
      case 'partner-trained':
        // Same path as CoupleStrip "Train together" — invite modal has no train CTA.
        return startCoupleTrain();
      case 'invite-partner':
        return router.push('/modal/couple-invite');
      case 'daily-challenge':
        return router.push('/modal/daily');
      case 'goal-met':
        return router.push({ pathname: '/session', params: { exercise: 'push', mode: 'practice' } });
      case 'recovery':
        return router.push('/modal/rest');
    }
  };

  // Retention nudges beat the rotating game carousel.
  const urgentHero =
    focus.kind === 'first-session' ||
    focus.kind === 'streak-at-risk' ||
    focus.kind === 'partner-trained';

  const onCoupleAction = async (action: 'train' | 'nudge' | 'open') => {
    track('home_couple_strip', { action });
    if (action === 'nudge' || action === 'open') {
      router.push('/modal/couple-invite');
      return;
    }
    startCoupleTrain();
  };

  const heroSlides = useMemo(
    () =>
      buildHomeHeroSlides({
        paired: couple.paired,
        partnerName: couple.partner?.displayName ?? null,
        dailyDone: dailyBest >= DAILY_TARGET,
        dailyTarget: DAILY_TARGET,
        onlineLabel: `${activity.count} ${activity.label}`,
        isWeekend: [0, 6].includes(new Date().getDay()),
        onTrainTogether: () => {
          track('home_hero_tapped', { kind: couple.paired ? 'train-together' : 'invite-partner' });
          startCoupleTrain();
        },
        onDaily: () => {
          track('home_hero_tapped', { kind: 'daily-challenge' });
          router.push('/modal/daily');
        },
        onFriends: () => {
          track('home_hero_tapped', { kind: 'friend-online' });
          router.push('/(tabs)/friends');
        },
        onTournament: () => {
          track('home_hero_tapped', { kind: 'tournament' });
          router.push('/(tabs)/arena');
        },
        onQuickMatch: () => {
          track('home_hero_tapped', { kind: 'quick-match' });
          router.push({ pathname: '/duel/new', params: { queue: '1' } });
        },
      }),
    // startCoupleTrain closes over couple/self/router — rebuild when pairing changes.
    [couple.paired, couple.partner, self, dailyBest, activity.count, activity.label, router],
  );

  const daysToReward = Math.max(0, goal - daysTrained);

  return (
    <View style={{ flex: 1 }}>
      <HomeAmbient />
      <Screen style={{ backgroundColor: 'transparent' }}>
      <View style={styles.header}>
        <PressableScale
          onPress={() => router.push('/(tabs)/profile')}
          accessibilityRole="button"
          accessibilityLabel="Your profile"
          style={styles.identity}
        >
          <LinearGradient colors={gradients.brand} style={styles.avatarRing}>
            <View style={styles.avatar}>
              {profile.avatarUri ? (
                <Image
                  source={{ uri: profile.avatarUri }}
                  style={styles.avatarImage}
                  contentFit="cover"
                  accessibilityLabel={profile.displayName}
                />
              ) : (
                <Text style={font('bold', 18, { color: palette.green600 })}>{initial}</Text>
              )}
            </View>
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={styles.greetingHook}>{greetingCopy.hook}</Text>
            <View style={styles.nameRow}>
              <Text style={font('semibold', 18, { color: palette.ink })} numberOfLines={1}>
                {greetingCopy.timeOfDay}, {firstName}
              </Text>
              <View style={styles.lvlChip}>
                <Text style={font('bold', 11, { color: palette.green600 })}>Lv.{level.level}</Text>
              </View>
              {streak > 0 ? (
                <PopOnChange trigger={streak} style={styles.streakChip}>
                  <StreakFlame />
                  <Text style={font('bold', 11, { color: palette.amber800 })}>{streak}</Text>
                </PopOnChange>
              ) : null}
            </View>
            {greetingCopy.bonus ? (
              <Text style={styles.greetingBonus}>{greetingCopy.bonus}</Text>
            ) : (
              <View style={styles.liveCountInline}>
                <View style={styles.liveDotSmall} />
                <Text style={font('regular', 10.5, { color: palette.grey600 })} numberOfLines={1}>
                  {activity.count} {activity.label}
                </Text>
              </View>
            )}
          </View>
        </PressableScale>

        <View style={styles.headerActions}>
          <BellButton
            pendingDuels={pendingDuels}
            onPress={() => router.push('/modal/notifications')}
          />
        </View>
      </View>

      <StaggerIn index={0}>
        {urgentHero ? <HeroCard focus={focus} onPress={onHeroPress} /> : <HeroCarousel slides={heroSlides} />}
      </StaggerIn>

      {couple.paired ? (
        <StaggerIn index={1} style={{ marginTop: 12 }}>
          <CoupleStrip
            me={couple.me}
            partner={couple.partner}
            streak={couple.streak}
            combined={couple.combined}
            atRisk={couple.atRisk}
            levelName={couple.level.name}
            today={today}
            onAction={(action) => void onCoupleAction(action)}
          />
        </StaggerIn>
      ) : null}

      <StaggerIn index={2} style={styles.row}>
        <PressableScale
          onPress={() => router.push('/modal/recap')}
          accessibilityRole="button"
          accessibilityLabel="Weekly streak progress"
          style={{ flex: 1 }}
        >
          <Card style={[styles.statCard, styles.weekCard, { padding: 0 }]}>
            <View style={styles.statCardInner}>
              <View style={styles.miniHeader}>
                <Text style={font('bold', 12, { color: palette.grey600 })}>This Week</Text>
                <StreakFlame />
              </View>
              <Text style={font('bold', 20, { color: palette.ink, marginTop: 8 })}>
                {streak > 0 ? `${streak} day streak` : 'Start a streak'}
              </Text>
              <View style={styles.weekBars}>
                {Array.from({ length: goal }, (_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.weekBarTall,
                      { backgroundColor: i < daysTrained ? palette.green500 : palette.green50 },
                    ]}
                  />
                ))}
              </View>
              <Text style={font('regular', 11, { color: palette.green700, marginTop: 8 })}>
                {daysToReward === 0
                  ? 'Weekly reward unlocked'
                  : `${daysToReward} day${daysToReward === 1 ? '' : 's'} until reward`}
              </Text>
            </View>
          </Card>
        </PressableScale>

        <PressableScale
          onPress={() => router.push('/modal/leaderboard')}
          accessibilityRole="button"
          accessibilityLabel="League standings"
          style={{ flex: 1 }}
        >
          <LinearGradient
            colors={['#fff7ed', '#ffedd5', '#fde68a']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.statCard, styles.leagueCard]}
          >
            <View style={styles.statCardInner}>
              <View style={styles.miniHeader}>
                <Text style={font('bold', 12, { color: '#92400e' })}>League</Text>
                <Text style={{ fontSize: 16 }}>{leagueProgress.league.emoji}</Text>
              </View>
              <View style={styles.leagueRow}>
                <Image source={MEDAL_BRONZE} style={styles.medalIconSmall} contentFit="contain" />
                <Text style={font('bold', 16, { color: palette.ink })}>{leagueProgress.title}</Text>
              </View>
              <Text style={font('bold', 14, { color: '#b45309', marginTop: 4 })}>
                <CountUp value={weeklyXp} style={font('bold', 14, { color: '#b45309' })} /> XP
              </Text>
              <LeagueXpBar fill={leagueProgress.fill} />
              <Text style={font('regular', 10.5, { color: palette.amber100Text, marginTop: 4 })} numberOfLines={1}>
                {leagueProgress.nextLeague
                  ? `${leagueProgress.xpToNext.toLocaleString()} XP until ${leagueProgress.nextLeague.name}`
                  : 'Top league — hold the crown'}
              </Text>
              <View style={styles.trophyWrapper} pointerEvents="none">
                <Image source={TROPHY_BRONZE} style={styles.trophyCorner} contentFit="contain" />
                <TrophyShine />
              </View>
            </View>
          </LinearGradient>
        </PressableScale>
      </StaggerIn>

      <View style={styles.sectionHeader}>
        <SectionLabel style={styles.sectionSpacing}>Quick Start</SectionLabel>
        <PressableScale
          onPress={() => router.push('/(tabs)/train')}
          accessibilityRole="button"
          accessibilityLabel="View all exercises"
        >
          <Text style={font('bold', 12.5, { color: palette.green600 })}>View all ›</Text>
        </PressableScale>
      </View>
      <StaggerIn index={3} style={styles.quickGrid}>
        <QuickTile
          label="Push-Ups"
          image={IC_PUSHUP}
          accent="#16a34a"
          tint={[palette.tintGreenTop, palette.tintGreenBottom]}
          stats={pushStats}
          onPress={() => router.push({ pathname: '/session', params: { exercise: 'push', mode: 'practice' } })}
        />
        <QuickTile
          label="Squats"
          image={IC_SQUAT}
          accent="#7c3aed"
          tint={[palette.tintPurpleTop, palette.tintPurpleBottom]}
          stats={squatStats}
          onPress={() => router.push({ pathname: '/session', params: { exercise: 'squat', mode: 'practice' } })}
        />
      </StaggerIn>

      <View style={styles.sectionHeader}>
        <SectionLabel style={styles.sectionSpacing}>Live Challenges</SectionLabel>
        <PressableScale onPress={() => router.push('/(tabs)/arena')}>
          <Text style={font('bold', 12.5, { color: palette.green600 })}>See all ›</Text>
        </PressableScale>
      </View>
      <StaggerIn index={4}>
        <PressableScale
          onPress={() =>
            router.push(pendingDuels > 0 ? '/modal/notifications' : '/modal/opponent-picker')
          }
          accessibilityRole="button"
          accessibilityLabel={
            pendingDuels > 0
              ? `${pendingDuels} challenges waiting`
              : seed.isSeeding
                ? 'AI exhibition match — start your own challenge'
                : 'Start a head-to-head challenge'
          }
        >
          <LinearGradient
            colors={[palette.tintGreenTop, palette.tintGreenBottom]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.challengeCard}
          >
            {(() => {
              // Real inbox wins over exhibition DEMO — a11y already says N waiting.
              const ch =
                pendingDuels === 0 &&
                seed.isSeeding &&
                seed.phantomChallenges.length > 0
                  ? seed.phantomChallenges[0]!
                  : null;

              if (ch) {
                return (
                  <DualChallengeBars
                    name1={ch.player1.name.split(' ')[0] ?? 'Nova'}
                    name2={ch.player2.name.split(' ')[0] ?? 'Titan'}
                    score1={ch.score1}
                    score2={ch.score2}
                    progress={ch.progress}
                    emoji1={ch.player1.emoji}
                    emoji2={ch.player2.emoji}
                    tint1={ch.player1.tintBg}
                    tint2={ch.player2.tintBg}
                    color1={ch.player1.tintColor}
                    color2={ch.player2.tintColor}
                    initial1={ch.player1.initial}
                    initial2={ch.player2.initial}
                    timeLeft={ch.timeLeft}
                    title={ch.title}
                  />
                );
              }

              const hasPending = pendingDuels > 0;
              return (
                <View style={styles.challengeRow}>
                  <View style={styles.vsAvatars}>
                    <View style={[styles.vsAvatar, styles.vsAvatarMe]}>
                      <Text style={{ fontSize: 24 }}>👨</Text>
                    </View>
                    <Image source={BADGE_VS} style={styles.vsBadge} contentFit="contain" />
                    <View style={[styles.vsAvatar, styles.vsAvatarThem]}>
                      {/* A person, not a waving hand: the row reads as "you vs
                          them", so the second seat should be another athlete.
                          The flame stays for a pending challenge — that seat is
                          a state, not a person. */}
                      <Text style={{ fontSize: 24 }}>{hasPending ? '🔥' : '👩'}</Text>
                    </View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={font('semibold', 14.5, { color: palette.ink })}>
                      {hasPending ? 'Challenge waiting' : 'Start a challenge'}
                    </Text>
                    <Text style={font('regular', 12, { color: '#15803d' })}>
                      {hasPending
                        ? `${pendingDuels} rival${pendingDuels > 1 ? 's' : ''} waiting on you`
                        : 'Duel a rival and climb the ranks'}
                    </Text>
                  </View>
                  <Text style={styles.moreChevron}>›</Text>
                </View>
              );
            })()}
          </LinearGradient>
        </PressableScale>
      </StaggerIn>

      <SectionLabel style={styles.sectionSpacing}>More</SectionLabel>
      <StaggerIn index={5}>
        <MoreRow
          emoji="⚡"
          title="Quick Match"
          subtitle="Real athletes or AI — always a duel"
          onPress={() => router.push({ pathname: '/duel/new', params: { queue: '1' } })}
        />
        <View style={{ height: 10 }} />
        <MoreRow
          emoji="🎯"
          title="Daily Challenge"
          subtitle="Clear the target before midnight"
          pill="+300 XP"
          onPress={() => router.push('/modal/daily')}
        />
        <View style={{ height: 10 }} />
        <MoreRow
          emoji="👥"
          title="Invite Friend"
          subtitle="Challenge someone you know"
          onPress={() => router.push('/modal/add-friend')}
        />
        <View style={{ height: 10 }} />
        <MoreRow
          emoji="🏆"
          title="Tournaments"
          subtitle="Coming soon — open Arena duels for now"
          onPress={() => {
            showDialog({
              title: 'Tournaments coming soon',
              message: 'Bracket play isn’t live yet. Jump into Arena for live duels in the meantime.',
              actions: [
                { label: 'Not now', variant: 'cancel' },
                {
                  label: 'Open Arena',
                  variant: 'primary',
                  onPress: () => router.push('/(tabs)/arena'),
                },
              ],
            });
          }}
        />
      </StaggerIn>
      </Screen>
    </View>
  );
}

/** Notification bell — wiggles when rivals are waiting. */
function BellButton({ pendingDuels, onPress }: { pendingDuels: number; onPress: () => void }) {
  const rotate = useSharedValue(0);

  useEffect(() => {
    if (pendingDuels <= 0) {
      rotate.value = 0;
      return;
    }
    rotate.value = withRepeat(
      withSequence(
        withTiming(-12, { duration: 90 }),
        withTiming(12, { duration: 90 }),
        withTiming(-8, { duration: 80 }),
        withTiming(8, { duration: 80 }),
        withTiming(0, { duration: 70 }),
        withDelay(2200, withTiming(0, { duration: 0 })),
      ),
      -1,
      false,
    );
  }, [pendingDuels, rotate]);

  const wiggleStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotate.value}deg` }],
  }));

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        pendingDuels > 0
          ? `${pendingDuels} ${pendingDuels === 1 ? 'rival' : 'rivals'} waiting on you`
          : 'Notifications'
      }
      style={[styles.iconButton, pendingDuels > 0 && styles.iconButtonAlert]}
    >
      <Animated.Text style={[{ fontSize: pendingDuels > 0 ? 16 : 17 }, wiggleStyle]}>
        {pendingDuels > 0 ? '⚔️' : '🔔'}
      </Animated.Text>
      {pendingDuels > 0 ? (
        <PopOnChange trigger={pendingDuels} style={styles.bellDot}>
          <Text style={font('bold', 9.5, { color: palette.white })}>
            {pendingDuels > 9 ? '9+' : pendingDuels}
          </Text>
        </PopOnChange>
      ) : null}
    </PressableScale>
  );
}

/** Soft gold shimmer that sweeps across the league trophy every few seconds. */
function TrophyShine() {
  const x = useSharedValue(-40);

  useEffect(() => {
    x.value = withRepeat(
      withSequence(
        withDelay(2800, withTiming(110, { duration: 900, easing: Easing.inOut(Easing.quad) })),
        withTiming(-40, { duration: 0 }),
      ),
      -1,
      false,
    );
  }, [x]);

  const shineStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { rotate: '22deg' }],
  }));

  return <Animated.View pointerEvents="none" style={[styles.trophyShine, shineStyle]} />;
}

function StreakFlame() {
  const flicker = useSharedValue(1);
  useEffect(() => {
    flicker.value = withRepeat(
      withSequence(
        withTiming(1.12, { duration: 280 }),
        withTiming(0.92, { duration: 220 }),
        withTiming(1.05, { duration: 260 }),
        withTiming(1, { duration: 300 }),
      ),
      -1,
      false,
    );
  }, [flicker]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: flicker.value }] }));
  return <Animated.Text style={[{ fontSize: 13 }, style]}>🔥</Animated.Text>;
}

function LeagueXpBar({ fill }: { fill: number }) {
  const width = useSharedValue(0);
  useEffect(() => {
    width.value = withDelay(
      300,
      withTiming(Math.max(0.04, Math.min(1, fill)), { duration: 900, easing: Easing.out(Easing.cubic) }),
    );
  }, [fill, width]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${Math.round(width.value * 100)}%` }));
  return (
    <View style={styles.leagueXpTrack}>
      <Animated.View style={[styles.leagueXpFill, fillStyle]} />
    </View>
  );
}

/** Dual race bars — Nova vs Titan style with drifting avatars. */
function DualChallengeBars({
  name1,
  name2,
  score1,
  score2,
  progress,
  emoji1,
  emoji2,
  tint1,
  tint2,
  color1,
  color2,
  initial1,
  initial2,
  timeLeft,
  title,
}: {
  name1: string;
  name2: string;
  score1: number;
  score2: number;
  progress: number;
  emoji1?: string;
  emoji2?: string;
  tint1: string;
  tint2: string;
  color1: string;
  color2: string;
  initial1: string;
  initial2: string;
  timeLeft: string;
  title: string;
}) {
  const p1 = useSharedValue(0);
  const p2 = useSharedValue(0);
  const bob = useSharedValue(0);
  const leftShare = Math.max(0.12, Math.min(0.88, progress));

  useEffect(() => {
    p1.value = withDelay(200, withTiming(leftShare, { duration: 950, easing: Easing.out(Easing.cubic) }));
    p2.value = withDelay(280, withTiming(1 - leftShare, { duration: 950, easing: Easing.out(Easing.cubic) }));
    bob.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [bob, leftShare, p1, p2]);

  const bar1 = useAnimatedStyle(() => ({ width: `${Math.round(p1.value * 100)}%` }));
  const bar2 = useAnimatedStyle(() => ({ width: `${Math.round(p2.value * 100)}%` }));
  const avatar1 = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value * -3 }] }));
  const avatar2 = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - bob.value) * -3 }] }));

  return (
    <View>
      <View style={styles.challengeRow}>
        <View style={{ flex: 1 }}>
          <Text style={font('semibold', 14.5, { color: palette.ink })}>{title}</Text>
          <View style={styles.challengeSubRow}>
            <Text style={font('regular', 12, { color: '#15803d' })}>
              {name1} vs {name2}
            </Text>
            <View style={styles.aiPill}>
              <Text style={font('bold', 9.5, { color: palette.green700 })}>AI</Text>
            </View>
          </View>
          <Text style={font('regular', 11, { color: palette.grey500, marginTop: 4 })}>
            Exhibition · tap to start yours
          </Text>
        </View>
        <View style={styles.challengeTrailing}>
          <View style={styles.demoBadge}>
            <Text style={font('bold', 10, { color: palette.slate500, letterSpacing: 0.6 })}>DEMO</Text>
          </View>
          <Text style={font('regular', 11, { color: palette.slate500, marginTop: 4 })}>{timeLeft} left</Text>
        </View>
      </View>

      <View style={styles.dualRace}>
        <View style={styles.dualRaceRow}>
          <Animated.View style={avatar1}>
            <Avatar initial={initial1} emoji={emoji1} size={34} background={tint1} color={color1} />
          </Animated.View>
          <Text style={font('semibold', 13, { color: palette.ink, width: 52 })} numberOfLines={1}>
            {name1}
          </Text>
          <View style={styles.dualTrack}>
            <Animated.View style={[styles.dualFillGreen, bar1]} />
          </View>
          <Text style={font('bold', 14, { color: '#16a34a', width: 28, textAlign: 'right' })}>{score1}</Text>
        </View>
        <View style={styles.dualRaceRow}>
          <Animated.View style={avatar2}>
            <Avatar initial={initial2} emoji={emoji2} size={34} background={tint2} color={color2} />
          </Animated.View>
          <Text style={font('semibold', 13, { color: palette.ink, width: 52 })} numberOfLines={1}>
            {name2}
          </Text>
          <View style={styles.dualTrack}>
            <Animated.View style={[styles.dualFillSlate, bar2]} />
          </View>
          <Text style={font('bold', 14, { color: palette.slate700, width: 28, textAlign: 'right' })}>{score2}</Text>
        </View>
      </View>
    </View>
  );
}

function QuickTile({
  label,
  image,
  emoji,
  accent,
  tint,
  stats,
  onPress,
}: {
  label: string;
  image?: number;
  emoji?: string;
  accent: string;
  tint: readonly [string, string];
  stats: { todayBest: number; lastBest: number; delta: number };
  onPress: () => void;
}) {
  /*
   * A day that has not been trained yet is not a regression.
   *
   * The delta is today's best minus the last training day's, so opening the
   * app before training shows the whole of yesterday as a loss — a red "-32"
   * for having not started. Worse, it kept counting *up* toward zero as reps
   * came in, so the number shrank while the athlete improved.
   *
   * Only compare once today has reps to compare with. Until then the tile
   * invites a set, which is the action the card exists to prompt.
   */
  const notStartedToday = stats.todayBest === 0;
  /*
   * A day still in progress is not a worse day.
   *
   * Today's best only becomes a fair comparison once the athlete has had a
   * real go at it. One rep in against a finished six-rep day is not a 5-rep
   * regression, but that is what a bare subtraction says — and it says it in
   * red, on the tile whose job is to get them to start. Worse, the number
   * climbs toward zero as they train, so it shrinks while they improve.
   *
   * Below half of the last day's best, the tile shows how far there is left
   * to go instead. That is the same information stated as a target rather
   * than a deficit, and it turns back into a real +/- delta as soon as the
   * comparison is worth making.
   */
  const chasing = !notStartedToday && stats.lastBest > 0 && stats.todayBest * 2 < stats.lastBest;
  const deltaLabel = notStartedToday
    ? 'Start set'
    : chasing
      ? `${stats.lastBest - stats.todayBest} to go`
      : stats.delta > 0
        ? `+${stats.delta}`
        : stats.delta < 0
          ? `${stats.delta}`
          : 'Even';
  // Red is earned only by a genuine shortfall on a day with a real attempt in
  // it — not by having barely started.
  const deltaPositive = notStartedToday || chasing || stats.delta >= 0;

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Practice ${label}`}
      style={styles.quickTileWrap}
    >
      <LinearGradient colors={tint} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={styles.quickTileNew}>
        <View style={styles.quickTileTop}>
          <View style={[styles.quickIconBubble, { borderColor: `${accent}33` }]}>
            {image ? (
              <Image source={image} style={styles.quickIconImg} contentFit="contain" />
            ) : (
              <Text style={{ fontSize: 22 }}>{emoji}</Text>
            )}
          </View>
          <View style={[styles.deltaPill, { backgroundColor: deltaPositive ? palette.tintGreenBottom : palette.tintDangerBg }]}>
            <Text style={font('bold', 11, { color: deltaPositive ? '#15803d' : '#b91c1c' })}>{deltaLabel}</Text>
          </View>
        </View>
        <Text style={font('semibold', 15, { color: palette.ink, marginTop: 8 })} numberOfLines={1}>
          {label}
        </Text>
        <Text style={font('regular', 11, { color: palette.grey600, marginTop: 4 })}>Today's Best</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
          <CountUp value={stats.todayBest} duration={800} style={font('bold', 22, { color: accent })} />
          <Text style={font('regular', 12, { color: palette.grey500 })}>reps</Text>
        </View>
        <Text style={font('regular', 11, { color: palette.grey500, marginTop: 4 })}>
          Last {stats.lastBest} reps
        </Text>
      </LinearGradient>
    </PressableScale>
  );
}

function MoreRow({
  emoji,
  title,
  subtitle,
  pill,
  onPress,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  pill?: string;
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={title}>
      <View style={styles.moreCard}>
        <View style={styles.moreIcon}>
          <Text style={{ fontSize: 20 }}>{emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.moreTitle}>{title}</Text>
          <Text style={styles.moreSub}>{subtitle}</Text>
        </View>
        {pill ? (
          <View style={styles.morePill}>
            <Text style={styles.morePillText}>{pill}</Text>
          </View>
        ) : null}
        <Text style={styles.moreChevron}>›</Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    // Top-aligned: the identity block runs to three lines, so centring pushed
    // the control down beside the name instead of sitting square in the corner.
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 20,
  },
  identity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    padding: 4,
    ...shadow.brand,
  },
  avatar: {
    flex: 1,
    borderRadius: radius['2xl'],
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  greeting: { ...font('semibold', 12, { color: palette.grey600 }) },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lvlChip: {
    backgroundColor: palette.green50,
    borderWidth: 1,
    borderColor: '#bfeccb',
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  streakChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: palette.amber50,
    borderWidth: 1,
    borderColor: '#fcd34d',
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    // Nudged down so the icon optically centres against the name row rather
    // than the smaller greeting above it.
    marginTop: 4,
  },
  /** Single-purpose circular control — one icon, one action. */
  /**
   * Single-purpose circular control — one icon, one action.
   *
   * The border is deliberately stronger than `palette.border`: at #e6eae4 on
   * the #F6F7F5 canvas the edge was invisible and the control read as a bare
   * floating emoji rather than a button.
   */
  iconButton: {
    position: 'relative',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: '#d8e3d8',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1e3c28',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 3,
  },
  /** Raised state — rivals are waiting, so the control itself signals it. */
  iconButtonAlert: {
    backgroundColor: palette.green50,
    borderColor: palette.green500,
    shadowColor: '#16a34a',
    shadowOpacity: 0.28,
    shadowRadius: 10,
  },
  bellDot: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: palette.red500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakInline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  liveCountInline: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  liveDotSmall: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: palette.green500 },

  // Stat cards
  row: { flexDirection: 'row', gap: 12, marginTop: 16, alignItems: 'stretch' },
  rowTight: { flexDirection: 'row', gap: 12 },
  weekCard: {
    backgroundColor: palette.white,
    borderColor: palette.green700,
    borderWidth: 1.5,
  },
  leagueCard: {
    borderWidth: 1.5,
    borderColor: '#f59e0b',
    overflow: 'hidden',
  },
  tierChipBronze: {
    backgroundColor: 'rgba(146,64,14,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(180,83,9,0.35)',
  },
  trophyShine: {
    position: 'absolute',
    top: 8,
    bottom: 8,
    width: 28,
    backgroundColor: 'rgba(255,255,255,0.45)',
    opacity: 0.55,
  },
  statCard: {
    flex: 1,
    height: 168,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: '#eef2ee',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#1e3c28',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
  },
  statCardInner: { flex: 1, padding: 16, borderRadius: radius.lg },
  miniHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  tierChip: { backgroundColor: palette.green50, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm },
  statAccentDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.green500, marginTop: 4 },
  weekValue: { flexDirection: 'row', alignItems: 'baseline', marginTop: 8 },
  weekBars: { flexDirection: 'row', gap: 4, marginTop: 8 },
  weekBar: { flex: 1, height: 6, borderRadius: radius.xs },
  leagueRow: { flexDirection: 'row', alignItems: 'center', gap: 0, marginTop: 4, marginBottom: 0 },
  medalIcon: { width: 66, height: 44, marginRight: -8, marginLeft: -6, marginTop: -4 },
  trophyWrapper: {
    position: 'absolute',
    right: -14,
    bottom: -22,
    width: 118,
    height: 118,
    shadowColor: '#78350f',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
    overflow: 'hidden',
  },
  trophyCorner: {
    width: '100%',
    height: '100%',
  },

  // Quick tiles
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  // Consistent section rhythm — iOS groups content with generous, even gaps
  // rather than varying margins per section.
  sectionSpacing: { marginTop: 28, marginBottom: 12 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  quickTileWrap: { width: '47%', flexGrow: 1 },
  quickTile: {
    height: 130,
    borderRadius: radius['2xl'],
    padding: 16,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  quickTileNew: {
    minHeight: 168,
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  quickEmojiBubble: {
    width: 54,
    height: 54,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickImgContainer: { height: 92, justifyContent: 'center', alignItems: 'center' },
  quickImgBig: { width: 98, height: 92 },
  quickIconBubble: {
    width: 58,
    height: 58,
    borderRadius: radius.lg,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  quickIconImg: { width: 52, height: 52 },
  quickChevron: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // More rows
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.lg,
  },
  rowIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconImg: { width: 26, height: 26 },
  scoreIcon: { width: 30, height: 30 },

  // Live Challenges
  challengeCard: {
    borderWidth: 1,
    borderColor: palette.green700,
    padding: 16,
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  challengeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  challengeSubRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  /** Matches the Arena leaderboard's AI badge so labelling is consistent. */
  aiPill: {
    backgroundColor: palette.green50,
    borderWidth: 1,
    borderColor: '#bfeccb',
    borderRadius: radius.xs,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  vsAvatars: { flexDirection: 'row', alignItems: 'center' },
  vsAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f0f4f0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  vsAvatarMe: { borderColor: palette.green500 },
  vsAvatarThem: { borderColor: palette.border },
  vsBadge: { width: 46, height: 31, marginHorizontal: -10, zIndex: 2 },
  challengeTrailing: { alignItems: 'center', justifyContent: 'center' },
  liveBadge: { width: 60, height: 40 },
  demoBadge: {
    backgroundColor: '#f4f4f5',
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  fireIcon: { width: 34, height: 34 },
  matchProgressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  matchProgressBar: { flex: 1, height: 12, borderRadius: 6, backgroundColor: palette.green50, overflow: 'hidden' },

  // More — clean action rows
  moreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.lg,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.border,
    ...shadow.card,
  },
  moreIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: palette.green50,
    borderWidth: 1,
    borderColor: palette.green700,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreIconImg: { width: 24, height: 24 },
  moreTitle: font('extrabold', 15, { color: palette.ink }),
  moreSub: { ...font('semibold', 12, { color: palette.slate500 }), marginTop: 4 },
  morePill: {
    backgroundColor: palette.green50,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  morePillText: font('extrabold', 11, { color: palette.green700 }),
  moreChevron: { ...font('extrabold', 22, { color: palette.slate400 }), marginLeft: 4 },

  greetingHook: { ...font('regular', 12, { color: palette.grey600 }) },
  greetingBonus: { ...font('regular', 11, { color: palette.green700, marginTop: 4 }) },
  weekBarTall: { flex: 1, height: 10, borderRadius: 5 },
  medalIconSmall: { width: 42, height: 32, marginRight: -4, marginLeft: -4 },
  leagueXpTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(146,64,14,0.12)',
    overflow: 'hidden',
    marginTop: 8,
  },
  leagueXpFill: {
    height: '100%',
    borderRadius: radius.xs,
    backgroundColor: '#d97706',
  },
  dualRace: { marginTop: 12, gap: 8 },
  dualRaceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dualTrack: {
    flex: 1,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(15,23,42,0.06)',
    overflow: 'hidden',
  },
  dualFillGreen: { height: '100%', backgroundColor: '#22c55e', borderRadius: radius.xs },
  dualFillSlate: { height: '100%', backgroundColor: '#94a3b8', borderRadius: radius.xs },
  quickTileTop: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  deltaPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
});


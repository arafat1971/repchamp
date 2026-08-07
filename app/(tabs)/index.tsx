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
import { HeroCard } from '@/components/home/HeroCard';
import { CoupleStrip } from '@/components/home/CoupleStrip';
import { CountUp, PopOnChange, StaggerIn } from '@/components/motion';
import { Card, PressableScale, Screen, SectionLabel } from '@/components/ui';
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

/** Push-ups is the featured daily challenge; mirrors `app/modal/daily.tsx`. */
const DAILY_EXERCISE: ExerciseId = 'push';
const DAILY_TARGET = 25;

const MEDAL_BRONZE = require('../../assets/medal-bronze.png');
const TROPHY_BRONZE = require('../../assets/trophy-bronze.png');
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

  const onCoupleAction = async (action: 'train' | 'nudge' | 'open') => {
    track('home_couple_strip', { action });
    if (action === 'nudge' || action === 'open') {
      router.push('/modal/couple-invite');
      return;
    }
    startCoupleTrain();
  };

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
        {/* One card, always, chosen by `selectHomeFocus`. It used to appear
            only for a dying streak or a partner who had already trained, with a
            five-slide carousel filling the slot the rest of the time — so five
            of HeroCard's seven states were written, styled and unreachable, and
            Home showed the same rotating menu to everyone. */}
        <HeroCard focus={focus} onPress={onHeroPress} />
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
            /* Softened from a full amber ramp. At #fde68a the card was the
               most saturated thing on the screen after the hero, which put a
               secondary stat above the primary action in the visual order. */
            colors={['#fffbf5', '#fff7ed', '#fdefd3']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.statCard, styles.leagueCard]}
          >
            <View style={styles.statCardInner}>
              {/* One league mark, not three. This card carried the tier emoji,
                  a medal image and a trophy at once — plus a gradient and a
                  shine — which read as clutter beside the plain white card
                  next to it. The medal is the clearest of the three and the
                  only one that sits with the tier name it labels. */}
              <View style={styles.miniHeader}>
                <Text style={font('bold', 12, { color: '#92400e' })}>League</Text>
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
              {/* The trophy stays as a quiet corner mark; the sweeping shine
                  that ran across it did not. An animated highlight on a card
                  whose job is "here is your rank" competes with the number
                  it is meant to decorate. */}
              <View style={styles.trophyWrapper} pointerEvents="none">
                <Image source={TROPHY_BRONZE} style={styles.trophyCorner} contentFit="contain" />
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
        <Text style={font('regular', 11, { color: palette.grey600, marginTop: 4 })}>Today&apos;s Best</Text>
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
  /* Wraps rather than truncating. Name, level and streak is three items in a
     row that often fits two, and every fixed answer traded one problem for
     another: shrinking clipped "Champion" while space remained, and not
     shrinking pushed the chips under the bell. Wrapping lets a short name keep
     everything on one line and a long one drop the chips below, which is the
     outcome both fixed rules were trying to approximate. */
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, rowGap: 6 },
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
    /* Reserve the corner. Without a width the identity block's `flex: 1` took
       the whole row and the bell was drawn over the level chip — the chips
       looked tucked under it rather than beside the name. */
    width: 52,
    flexShrink: 0,
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
  liveCountInline: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  liveDotSmall: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: palette.green500 },

  // Stat cards
  row: { flexDirection: 'row', gap: 12, marginTop: 16, alignItems: 'stretch' },
  /* The pair reads as a pair now. Both carried a 1.5pt border in their own
     accent — hard green against hard amber — which made two cards of the same
     size and role look like they belonged to different screens. A hairline in
     a tint of each accent keeps them distinguishable without shouting. */
  weekCard: {
    backgroundColor: palette.white,
    borderColor: 'rgba(21,128,61,0.28)',
    borderWidth: 1,
  },
  leagueCard: {
    borderWidth: 1,
    borderColor: 'rgba(180,83,9,0.28)',
    overflow: 'hidden',
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


  /** Matches the Arena leaderboard's AI badge so labelling is consistent. */


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
  quickTileTop: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  deltaPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
});


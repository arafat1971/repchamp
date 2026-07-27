import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { track } from '@/lib/analytics';
import { HeroCard } from '@/components/home/HeroCard';
import { CoupleStrip } from '@/components/home/CoupleStrip';
import { PopOnChange, StaggerIn } from '@/components/motion';
import { Avatar, Card, Chevron, PressableScale, Screen, SectionLabel } from '@/components/ui';
import { selectHomeFocus, type HomeFocus } from '@/domain/homeFocus';
import { liveActivity } from '@/domain/liveActivity';
import { usePhantomSeed } from '@/domain/seedPhantoms';
import { dayKey } from '@/domain/progression';
import {
  useProfileStore,
  selectDaysTrainedThisWeek,
  selectLeague,
  selectLevel,
} from '@/state/profileStore';
import { useCouple } from '@/state/useCouple';
import { useIncomingDuelCount } from '@/state/useIncomingDuelCount';
import type { ExerciseId } from '@/vision/exercises';
import { font, text } from '@/theme/typography';
import { gradients, palette, shadow } from '@/theme/tokens';

/** Push-ups is the featured daily challenge; mirrors `app/modal/daily.tsx`. */
const DAILY_EXERCISE: ExerciseId = 'push';
const DAILY_TARGET = 25;

// Image assets that give the home its illustrated, design-matched look.
const IC_PUSHUP = require('../../assets/ic-pushup.png');
const MEDAL_BRONZE = require('../../assets/medal-bronze.png');
const HERO_COUPLE = require('../../assets/couple-hero.png');
const TROPHY_BRONZE = require('../../assets/trophy-bronze.png');
const IC_LIGHTNING = require('../../assets/ic-lightning.png');
const IC_TARGET = require('../../assets/ic-target.png');
const IC_SCORE = require('../../assets/ic-score32.png');
const BADGE_VS = require('../../assets/badge-vs.png');
const BADGE_LIVE = require('../../assets/badge-live.png');

function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning \u2600\uFE0F';
  if (hour < 18) return 'Good afternoon \uD83C\uDF24\uFE0F';
  return 'Good evening \uD83C\uDF19';
}

export default function HomeScreen() {
  const router = useRouter();
  const profile = useProfileStore();
  const couple = useCouple();

  const level = selectLevel(profile);
  const league = selectLeague(profile);
  const daysTrained = selectDaysTrainedThisWeek(profile);
  const goal = profile.weeklyGoal;
  const initial = (profile.username || 'C').charAt(0).toUpperCase();
  const pendingDuels = useIncomingDuelCount();

  // Honest "who's here now" label: AI training partners while the community is
  // fresh, real athletes once it grows. Never a hardcoded vanity number.
  const seed = usePhantomSeed();
  const activity = liveActivity(0, seed.phantomOnline.length, seed.isSeeding);

  const today = dayKey();
  const trainedToday = profile.sessions.some((s) => s.day === today);
  const dailyBest = profile.sessions
    .filter((s) => s.day === today && s.exercise === DAILY_EXERCISE)
    .reduce((best, s) => Math.max(best, s.reps), 0);

  /**
   * The one adaptive decision that drives the top of the screen. All the rules
   * live in the pure `selectHomeFocus`; here we just feed it primitives.
   */
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

  // Which hero the athlete actually saw — the numerator for hero CTR per state.
  useEffect(() => {
    track('home_hero_shown', { kind: focus.kind });
  }, [focus.kind]);

  /** Route the hero's single CTA to the right place for its kind. */
  const onHeroPress = () => {
    track('home_hero_tapped', { kind: focus.kind });
    switch (focus.kind) {
      case 'first-session':
        return router.push({ pathname: '/session', params: { exercise: 'push', mode: 'practice' } });
      case 'streak-at-risk':
      case 'partner-trained':
        return router.push('/modal/couple-invite');
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

  // The couple hero is the design's centrepiece — it leads in every steady
  // state (unpaired, paired, partner-trained). But two states are urgent enough
  // to earn their own hero: a brand-new athlete needs the "first set" nudge, and
  // a streak about to break needs its warning. Those still win; otherwise the
  // couple hero shows. This keeps the design's look without losing the retention
  // nudges that live in `selectHomeFocus`.
  const showCoupleHero = focus.kind !== 'first-session' && focus.kind !== 'streak-at-risk';

  return (
    <Screen>
      {/* Header — identity + a live-tracking pill, matching the design. */}
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
                <Text style={font('extrabold', 18, { color: palette.green600 })}>{initial}</Text>
              )}
            </View>
          </LinearGradient>
          <View>
            <Text style={styles.greeting}>{greeting()}</Text>
            <View style={styles.nameRow}>
              <Text style={font('extrabold', 19, { color: palette.ink })}>{profile.displayName}</Text>
              <View style={styles.lvlChip}>
                <Text style={font('extrabold', 11, { color: palette.green600 })}>Lv.{level.level}</Text>
              </View>
            </View>
          </View>
        </PressableScale>

        <PressableScale
          onPress={() => router.push('/modal/notifications')}
          accessibilityRole="button"
          accessibilityLabel={
            pendingDuels > 0 ? `Notifications, ${pendingDuels} pending` : 'Notifications'
          }
          style={styles.livePill}
        >
          <View style={styles.bellWrap}>
            <Text style={{ fontSize: 16 }}>🔔</Text>
            {pendingDuels > 0 ? (
              <PopOnChange trigger={pendingDuels} style={styles.bellDot}>
                <Text style={font('extrabold', 9, { color: palette.white })}>
                  {pendingDuels > 9 ? '9+' : pendingDuels}
                </Text>
              </PopOnChange>
            ) : (
              <View style={styles.liveDotPulse} />
            )}
          </View>
          <View style={{ gap: 2 }}>
            <Text style={font('extrabold', 12, { color: palette.green700 })}>Live Tracking</Text>
            <View style={styles.liveCountInline}>
              <View style={styles.liveDotSmall} />
              <Text style={font('semibold', 10.5, { color: palette.grey600 })}>
                {activity.count} {activity.label}
              </Text>
            </View>
          </View>
        </PressableScale>
      </View>

      {/* Couple hero (design centrepiece) OR the adaptive hero for urgent states. */}
      <StaggerIn index={0}>
        {showCoupleHero ? (
          <CoupleHero
            paired={couple.paired}
            partnerName={couple.partner?.displayName ?? null}
            partnerTrainedToday={focus.kind === 'partner-trained'}
            onPress={() => {
              track('home_hero_tapped', { kind: focus.kind });
              router.push('/modal/couple-invite');
            }}
          />
        ) : (
          <HeroCard focus={focus} onPress={onHeroPress} />
        )}
      </StaggerIn>

      {/* Couple strip — only when bonded; keeps the differentiator glanceable. */}
      {couple.paired ? (
        <StaggerIn index={1} style={{ marginTop: 14 }}>
          <CoupleStrip
            me={couple.me}
            partner={couple.partner}
            streak={couple.streak}
            combined={couple.combined}
            onPress={() => router.push('/modal/couple-invite')}
          />
        </StaggerIn>
      ) : null}

      {/* This week + league — illustrated stat cards. */}
      <StaggerIn index={2} style={styles.row}>
        <PressableScale
          onPress={() => router.push('/modal/recap')}
          accessibilityRole="button"
          accessibilityLabel="Weekly recap"
          style={{ flex: 1 }}
        >
          <Card style={[styles.statCard, { padding: 0 }]}>
            <LinearGradient
              colors={['#f0fdf4', '#dcfce7', '#f0fdf4']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.statCardInner}
            >
              <View style={styles.miniHeader}>
                <Text style={font('bold', 12, { color: palette.grey600 })}>This Week</Text>
                <View style={[styles.statIconChip, { backgroundColor: '#dcfce7' }]}>
                  <Text style={{ fontSize: 14 }}>📅</Text>
                </View>
              </View>
              <View style={styles.weekValue}>
                <Text style={font('extrabold', 30, { color: palette.green600 })}>{daysTrained}</Text>
                <Text style={font('bold', 15, { color: palette.grey500 })}> / {goal} days</Text>
              </View>
              <Text style={font('bold', 11, { color: '#15803d', marginTop: 2 })}>Keep going! 💪🔥</Text>
              <View style={styles.weekBars}>
                {Array.from({ length: goal }, (_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.weekBar,
                      { backgroundColor: i < daysTrained ? palette.green500 : '#dcfce7' },
                    ]}
                  />
                ))}
              </View>
            </LinearGradient>
          </Card>
        </PressableScale>

        <PressableScale
          onPress={() => router.push('/modal/leaderboard')}
          accessibilityRole="button"
          accessibilityLabel="League standings"
          style={{ flex: 1 }}
        >
          <Card style={[styles.statCard, { padding: 0, borderColor: '#fef08a' }]}>
            <LinearGradient
              colors={['#ffffff', '#fefce8']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.statCardInner}
            >
              <View style={styles.miniHeader}>
                <Text style={font('bold', 12, { color: palette.grey600 })}>League</Text>
                <View style={[styles.tierChip, { backgroundColor: '#fef08a' }]}>
                  <Text style={font('extrabold', 9.5, { color: '#854d0e', letterSpacing: 0.5 })}>TIER 1</Text>
                </View>
              </View>
              <View style={styles.leagueRow}>
                <Image source={MEDAL_BRONZE} style={styles.medalIcon} contentFit="contain" />
                <Text style={font('extrabold', 18, { color: palette.ink })}>{league.name}</Text>
              </View>
              <Text style={font('extrabold', 15, { color: '#ca8a04', marginTop: 4 })}>
                230 <Text style={font('bold', 11, { color: palette.grey500 })}>XP</Text>
              </Text>
              <View style={styles.trophyWrapper} pointerEvents="none">
                <Image source={TROPHY_BRONZE} style={styles.trophyCorner} contentFit="contain" />
              </View>
            </LinearGradient>
          </Card>
        </PressableScale>
      </StaggerIn>

      {/* Quick start — the two staples. */}
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
      <StaggerIn index={3} style={styles.rowTight}>
        <QuickTile
          label="Push-Ups"
          subtitle="Track your reps"
          image={IC_PUSHUP}
          colors={['#f0fdf4', '#dcfce7']}
          borderColor="#bbf7d0"
          shadowColor="rgba(34,197,94,.25)"
          subtitleColor="#16a34a"
          imgStyle={{ width: 180, height: 185, marginBottom: -32 }}
          onPress={() => router.push({ pathname: '/session', params: { exercise: 'push', mode: 'practice' } })}
        />
        <QuickTile
          label="Squats"
          subtitle="Track your reps"
          image={require('../../assets/ic-squat.png')}
          colors={['#faf5ff', '#f3e8ff']}
          borderColor="#e9d5ff"
          shadowColor="rgba(168,85,247,.25)"
          subtitleColor="#9333ea"
          imgStyle={{ width: 165, height: 176, marginBottom: -30 }}
          onPress={() => router.push({ pathname: '/session', params: { exercise: 'squat', mode: 'practice' } })}
        />
      </StaggerIn>

      {/* Live Challenges — head-to-head duels. Shows the count of real pending
          challenges when any exist; otherwise invites the athlete to start one. */}
      <View style={styles.sectionHeader}>
        <SectionLabel style={styles.sectionSpacing}>Live Challenges</SectionLabel>
        <PressableScale onPress={() => router.push('/(tabs)/arena')}>
          <Text style={font('bold', 12.5, { color: palette.green600 })}>See all ›</Text>
        </PressableScale>
      </View>
      <StaggerIn index={4}>
        <PressableScale
          onPress={() =>
            router.push(
              pendingDuels > 0 ? '/modal/notifications' : '/modal/opponent-picker',
            )
          }
          accessibilityRole="button"
          accessibilityLabel={
            pendingDuels > 0
              ? `${pendingDuels} challenges waiting`
              : 'Start a head-to-head challenge'
          }
        >
          <LinearGradient
            colors={['#ffffff', '#f0fdf4', '#fefce8']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.challengeCard}
          >
            {(() => {
              const ch = seed.isSeeding && seed.phantomChallenges.length > 0
                ? seed.phantomChallenges[0]!
                : null;
              const p1Name = ch ? ch.player1.name.split(' ')[0] : 'Arafat';
              const p2Name = ch ? ch.player2.name.split(' ')[0] : 'Rimon';
              const s1 = ch ? ch.score1 : 32;
              const s2 = ch ? ch.score2 : 28;
              const prog = ch ? `${Math.round(ch.progress * 100)}%` : '53%';
              const time = ch ? ch.timeLeft : '12:45';
              const title = ch
                ? ch.title
                : pendingDuels > 0
                  ? '⚡ Challenge waiting'
                  : '💪 Push-Up Challenge';
              const sub = pendingDuels > 0
                ? `${pendingDuels} rival${pendingDuels > 1 ? 's' : ''} waiting on you`
                : `${p1Name} vs. ${p2Name}`;

              return (
                <>
                  <View style={styles.challengeRow}>
                    <View style={styles.vsAvatars}>
                      {ch ? (
                        <Avatar
                          initial={ch.player1.initial}
                          emoji={ch.player1.emoji}
                          size={38}
                          background={ch.player1.tintBg}
                          color={ch.player1.tintColor}
                        />
                      ) : (
                        <View style={[styles.vsAvatar, styles.vsAvatarMe]}>
                          <Text style={{ fontSize: 18 }}>🧑🏻</Text>
                        </View>
                      )}
                      <Image source={BADGE_VS} style={styles.vsBadge} contentFit="contain" />
                      {ch ? (
                        <Avatar
                          initial={ch.player2.initial}
                          emoji={ch.player2.emoji}
                          size={38}
                          background={ch.player2.tintBg}
                          color={ch.player2.tintColor}
                        />
                      ) : (
                        <View style={[styles.vsAvatar, styles.vsAvatarThem]}>
                          <Text style={{ fontSize: 18 }}>🧔🏽</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={font('extrabold', 14.5, { color: palette.ink })}>
                        {title}
                      </Text>
                      <Text style={font('semibold', 12, { color: '#4a7c5a' })}>
                        {sub}
                      </Text>
                    </View>
                    <View style={styles.challengeTrailing}>
                      <Image source={BADGE_LIVE} style={styles.liveBadge} contentFit="contain" />
                      <Text style={font('bold', 11, { color: '#b45309', marginTop: 3 })}>⏱ {time} left</Text>
                    </View>
                  </View>
                  <View style={styles.matchProgressRow}>
                    <Text style={font('extrabold', 18, { color: '#16a34a', width: 28 })}>{s1}</Text>
                    <View style={styles.matchProgressBar}>
                      <LinearGradient
                        colors={['#22c55e', '#34d26a', '#4ade80']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={{ width: prog as `${number}%`, height: '100%' }}
                      />
                    </View>
                    <Text style={font('extrabold', 18, { color: '#7c3aed', width: 28, textAlign: 'right' })}>{s2}</Text>
                  </View>
                </>
              );
            })()}
          </LinearGradient>
        </PressableScale>
      </StaggerIn>

      {/* Below the fold — low-frequency actions, framed-icon rows. */}
      <SectionLabel style={styles.sectionSpacing}>More</SectionLabel>
      <StaggerIn index={5}>
        <RowCard
          image={IC_LIGHTNING}
          iconBg="#fff7e0"
          iconBorder="#fcd34d"
          cardBg="#fffbeb"
          cardBorder="#fef08a"
          title="⚡ Find an opponent"
          subtitle="Quick match with anyone"
          onPress={() => router.push({ pathname: '/duel/new', params: { queue: '1' } })}
        />
        <View style={{ height: 10 }} />
        <RowCard
          image={IC_TARGET}
          iconBg="#ffeaea"
          iconBorder="#fca5a5"
          cardBg="#fff1f2"
          cardBorder="#fecdd3"
          title="🎯 Daily challenge"
          subtitle="Earn 2× XP before midnight"
          trailing={<Image source={IC_SCORE} style={styles.scoreIcon} contentFit="contain" />}
          onPress={() => router.push('/modal/daily')}
        />
      </StaggerIn>
    </Screen>
  );
}

/**
 * The illustrated couple hero — the design's centrepiece. Character art sits
 * bottom-right over a soft green gradient; the CTA leads to pairing.
 */
function CoupleHero({
  paired,
  partnerName,
  partnerTrainedToday,
  onPress,
}: {
  paired: boolean;
  partnerName: string | null;
  partnerTrainedToday: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        !paired
          ? 'Invite your partner'
          : partnerTrainedToday
            ? `${partnerName ?? 'Your partner'} trained today`
            : 'Open couple mode'
      }
    >
      {/* Full-bleed couple photo on a rich green gradient card: the transparent
          cutout sits large bottom-right on brand colour (never black), a soft
          highlight lifts it, and a left green scrim keeps the white copy crisp. */}
      <LinearGradient
        colors={['#1f9d4d', '#12923f', '#0c7d34']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.coupleHero}
      >
        <LinearGradient
          colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0.10)', 'transparent']}
          start={{ x: 0.35, y: 0.2 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.coupleHeroCircle}
        />
        {/* Soft glow halo hugging the figures so the photo appears to float. */}
        <LinearGradient
          colors={['rgba(255,255,255,0.45)', 'rgba(220,255,232,0.18)', 'transparent']}
          start={{ x: 0.5, y: 0.35 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.coupleHeroGlowHalo}
        />
        <Image
          source={HERO_COUPLE}
          style={styles.coupleHeroPhoto}
          contentFit="contain"
          contentPosition="bottom"
        />
        <LinearGradient
          colors={['rgba(10,90,40,0.92)', 'rgba(10,90,40,0.35)', 'transparent']}
          locations={[0, 0.55, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.coupleHeroText}>
          <Text style={styles.coupleEyebrow}>COUPLE MODE</Text>
          <Text style={font('extrabold', 25, { color: palette.white, lineHeight: 28 })}>
            Train Together,
          </Text>
          <Text style={font('extrabold', 25, { color: '#b6ffcf', lineHeight: 28, marginBottom: 14 })}>
            Grow Together
          </Text>
          <View style={styles.coupleCtaLight}>
            <Text style={font('extrabold', 13.5, { color: palette.green700 })}>
              {paired ? 'Open couple mode' : 'Invite Partner'}
            </Text>
            <View style={styles.coupleCtaArrowLight}>
              <Text style={font('extrabold', 13, { color: palette.green700 })}>→</Text>
            </View>
          </View>
        </View>
      </LinearGradient>
    </PressableScale>
  );
}

/** A square quick-start tile — one exercise, one tap. Image icon or emoji. */
function QuickTile({
  label,
  subtitle,
  image,
  colors,
  borderColor,
  shadowColor,
  subtitleColor,
  imgStyle,
  onPress,
}: {
  label: string;
  subtitle: string;
  image: number;
  colors: readonly [string, string];
  borderColor: string;
  shadowColor: string;
  subtitleColor: string;
  imgStyle?: any;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Practice ${label}`}
      style={{ flex: 1 }}
    >
      <LinearGradient
        colors={colors}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={[
          styles.quickTileNew,
          { borderColor, shadowColor },
        ]}
      >
        <View style={styles.quickImgContainer}>
          <Image source={image} style={[styles.quickImgBig, imgStyle]} contentFit="contain" />
        </View>
        <Text style={font('extrabold', 15, { color: palette.ink, marginTop: 2 })}>{label}</Text>
        <Text style={font('bold', 11, { color: subtitleColor, marginTop: 1, marginBottom: 5 })}>{subtitle}</Text>
      </LinearGradient>
    </PressableScale>
  );
}

/** A quiet full-width row for secondary actions, with a framed image icon. */
function RowCard({
  image,
  iconBg,
  iconBorder,
  cardBg,
  cardBorder,
  title,
  subtitle,
  trailing,
  onPress,
}: {
  image: number;
  iconBg: string;
  iconBorder: string;
  /** Soft card-wide tint so each row carries its own colour. */
  cardBg?: string;
  cardBorder?: string;
  title: string;
  subtitle: string;
  trailing?: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={title}>
      <Card
        style={[
          styles.rowCard,
          cardBg ? { backgroundColor: cardBg } : null,
          cardBorder ? { borderColor: cardBorder } : null,
        ]}
      >
        <View style={[styles.rowIcon, { backgroundColor: iconBg, borderColor: iconBorder }]}>
          <Image source={image} style={styles.rowIconImg} contentFit="contain" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={text.cardTitle}>{title}</Text>
          <Text style={text.caption}>{subtitle}</Text>
        </View>
        {trailing ?? <Chevron />}
      </Card>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 18,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    padding: 2,
    ...shadow.brand,
  },
  avatar: {
    flex: 1,
    borderRadius: 22,
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
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 16,
    paddingHorizontal: 11,
    paddingVertical: 8,
    width: 161,
    height: 45,
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
  },
  bellWrap: { position: 'relative', width: 18, alignItems: 'center', justifyContent: 'center' },
  liveDotPulse: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.green500,
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
  streakInline: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  liveCountInline: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  liveDotSmall: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: palette.green500 },

  // Couple hero — full-bleed couple cutout on a green gradient card.
  coupleHero: {
    position: 'relative',
    borderRadius: 26,
    overflow: 'hidden',
    height: 268,
    justifyContent: 'flex-end',
    ...shadow.brand,
  },
  coupleHeroCircle: {
    position: 'absolute',
    right: -46,
    top: -30,
    width: 268,
    height: 268,
    borderRadius: 134,
    zIndex: 1,
  },
  // Soft glow ring hugging the figures — makes the photo float off the card.
  coupleHeroGlowHalo: {
    position: 'absolute',
    right: 6,
    bottom: -16,
    width: 240,
    height: 240,
    borderRadius: 120,
    zIndex: 1,
  },
  coupleHeroPhoto: {
    position: 'absolute',
    right: -18,
    bottom: 0,
    width: 320,
    height: 290,
    zIndex: 2,
  },
  coupleHeroText: { position: 'relative', zIndex: 3, padding: 22, maxWidth: 200 },
  coupleEyebrow: {
    ...font('extrabold', 11, { color: 'rgba(255,255,255,0.85)' }),
    letterSpacing: 3,
    marginBottom: 8,
  },
  coupleCtaLight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'flex-start',
    backgroundColor: palette.white,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    ...shadow.card,
  },
  coupleCtaArrowLight: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(18,146,63,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coupleCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 14,
    ...shadow.brand,
  },
  coupleCtaArrow: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Stat cards
  row: { flexDirection: 'row', gap: 12, marginTop: 16, alignItems: 'stretch' },
  rowTight: { flexDirection: 'row', gap: 12 },
  statCard: {
    flex: 1,
    height: 146,
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
  statCardInner: { flex: 1, padding: 15, borderRadius: 18 },
  miniHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  statIconChip: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: '#eafaef',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierChip: { backgroundColor: '#fbeed8', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
  weekValue: { flexDirection: 'row', alignItems: 'baseline', marginTop: 8 },
  weekBars: { flexDirection: 'row', gap: 5, marginTop: 10 },
  weekBar: { flex: 1, height: 6, borderRadius: 4 },
  leagueRow: { flexDirection: 'row', alignItems: 'center', gap: 0, marginTop: 2, marginBottom: 0 },
  medalIcon: { width: 60, height: 60, marginRight: -8, marginLeft: -6, marginTop: -4 },
  trophyWrapper: {
    position: 'absolute',
    right: -10,
    bottom: -18,
    width: 100,
    height: 100,
    shadowColor: '#78350f',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  trophyCorner: {
    width: '100%',
    height: '100%',
  },

  // Quick tiles
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  sectionSpacing: { marginTop: 24, marginBottom: 12 },
  quickTile: {
    height: 130,
    borderRadius: 20,
    padding: 16,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  quickTileNew: {
    height: 144,
    borderRadius: 20,
    padding: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  quickImgContainer: { height: 92, justifyContent: 'center', alignItems: 'center' },
  quickImgBig: { width: 98, height: 92 },
  quickIconBubble: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickIconImg: { width: 40, height: 40 },
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
    gap: 14,
    padding: 14,
    borderRadius: 18,
  },
  rowIcon: {
    width: 46,
    height: 46,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconImg: { width: 26, height: 26 },
  scoreIcon: { width: 30, height: 30 },

  // Live Challenges
  challengeCard: {
    borderWidth: 1,
    borderColor: '#bbf7d0',
    padding: 16,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  challengeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  vsAvatars: { flexDirection: 'row', alignItems: 'center' },
  vsAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#f0f4f0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  vsAvatarMe: { borderColor: palette.green500 },
  vsAvatarThem: { borderColor: palette.border },
  vsBadge: { width: 41, height: 41, marginHorizontal: -10, zIndex: 2 },
  challengeTrailing: { alignItems: 'center', justifyContent: 'center' },
  liveBadge: { width: 63, height: 35 },
  fireIcon: { width: 34, height: 34 },
  matchProgressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  matchProgressBar: { flex: 1, height: 9, borderRadius: 6, backgroundColor: '#f0e9fb', overflow: 'hidden' },
});


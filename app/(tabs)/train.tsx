import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { track } from '@/lib/analytics';
import { useTabView } from '@/lib/useTabView';
import { pluralise } from '@/domain/plural';
import { ExerciseGlyph } from '@/components/ExerciseGlyph';
import { ExerciseLibrary } from '@/components/ExerciseLibrary';
import { YogaGlyph } from '@/components/YogaGlyph';
import { ProgrammeCard } from '@/components/ProgrammeCard';
import { CameraCoachSection } from '@/components/train/CameraCoach';
import { WeekRepsCard } from '@/components/train/WeekRepsCard';
import { weekReps } from '@/domain/weekReps';
import { HomeSectionHeader } from '@/components/home/HomeSectionHeader';
import { ArrowIcon, CheckIcon, FlameIcon, LockIcon } from '@/components/home/Icons';
import { PressableScale, Screen } from '@/components/ui';
import { CountUp, StaggerIn } from '@/components/motion';
import { createDuel } from '@/services/duelService';
import { useMindfulStore } from '@/state/mindfulStore';
import { useCouple } from '@/state/useCouple';
import { showDialog } from '@/state/useDialog';
import { selectDaysTrainedThisWeek, selectStreak, selectTotalReps, useProfileStore } from '@/state/profileStore';
import { useEffectivePro } from '@/state/proStore';
import { isWalled } from '@/domain/hardPaywall';
import { exerciseHomeStats } from '@/domain/exerciseHomeStats';
import { dayKey, lastNDayKeys } from '@/domain/progression';
import {
  MEDITATIONS,
  YOGA_FLOWS,
  doneOn,
  flowMinutes,
  minutesOn,
  patternLabel,
  poseCount,
  type Meditation,
  type YogaFlow,
} from '@/domain/mindful';
import { isPurchasesConfigured } from '@/services/purchases';
import { useSelfPlayer } from '@/state/useSelfPlayer';
import { defaultDuration } from '@/state/sessionStore';
import type { ExerciseId } from '@/vision/exercises';
import { reservedControlHeight } from '@/theme/fontScale';
import { font, scaleForRole } from '@/theme/typography';
import { SCREEN_GUTTER, palette, radius, surfaceShadow } from '@/theme/tokens';

/** Rep milestones on the roadmap, in order. */
const MILESTONES = [5, 10, 15, 25, 40] as const;

/* The two free staples keep the accents Home's Quick Start gives them, so a
   push-up is the same green on both tabs. */
const PUSH = palette.green600;
const IC_PUSHUP = require('../../assets/ic-pushup.png');
const IC_SQUAT = require('../../assets/ic-squat.png');
const SQUAT = palette.purple600;

export default function TrainScreen() {
  useTabView('train');
  const { fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isPro = useEffectivePro();
  const profile = useProfileStore();
  const personalBests = profile.personalBests;
  const self = useSelfPlayer();
  const { paired, partner, streak, combined } = useCouple();
  const [starting, setStarting] = useState(false);
  const mindfulLog = useMindfulStore((s) => s.log);
  const week = lastNDayKeys(7);
  const yogaWeek = minutesOn(mindfulLog, 'yoga', week);
  const meditateWeek = minutesOn(mindfulLog, 'meditation', week);
  const best = personalBests.push ?? 0;
  const squatBest = personalBests.squat ?? 0;

  const totalReps = selectTotalReps(profile);
  const daysTrained = selectDaysTrainedThisWeek(profile);
  const streakDays = selectStreak(profile);
  const thisWeek = useMemo(() => weekReps(profile.sessions), [profile.sessions]);
  const today = dayKey();
  const pushStats = useMemo(
    () => exerciseHomeStats(profile.sessions, 'push', today),
    [profile.sessions, today],
  );
  const squatStats = useMemo(
    () => exerciseHomeStats(profile.sessions, 'squat', today),
    [profile.sessions, today],
  );

  /* Asked the same way Home asks it, so the solo tiles here say "free reps
     used" rather than looking startable and bouncing off the session. */
  const soloWalled = isWalled({
    isPro,
    repsSoFar: totalReps,
    billingReady: isPurchasesConfigured(),
  });

  const nextMilestone = MILESTONES.find((m) => m > best) ?? MILESTONES[MILESTONES.length - 1]!;

  /* Same guard as Home's `startSolo`: the session enforces the wall anyway,
     so this only exists to stop the tab opening a set that bounces straight
     back out. */
  const practice = (exercise: ExerciseId) => {
    /* Recorded before the wall check, not after: a tap that bounces to the
       paywall is still an athlete reaching to train, and it is the more
       interesting half of the number. */
    track('train_intent', { exercise, mode: 'practice' });
    if (soloWalled) {
      router.push({
        pathname: '/modal/paywall',
        params: { source: 'rep-limit', hard: '1' },
      });
      return;
    }
    router.push({
      pathname: '/session',
      params: { exercise, mode: 'practice' },
    });
  };

  /**
   * Couple entry. Unpaired athletes go to the invite screen — that gate is the
   * point, since couple mode cannot work without bringing a partner in. Paired
   * ones open a cooperative duel addressed to their partner and wait in the
   * existing lobby, which routes both devices into the together set.
   */
  const trainTogether = async (exercise: ExerciseId) => {
    track('train_intent', { exercise, mode: 'together' });
    if (!paired || !partner || !self) {
      router.push('/modal/couple-invite');
      return;
    }
    setStarting(true);
    try {
      const duelId = await createDuel({
        ...self,
        exercise,
        duration: defaultDuration('together'),
        targetUid: partner.uid,
        cooperative: true,
        kind: 'train',
      });
      if (!duelId) {
        showDialog({
          title: 'Not available yet',
          message: 'Connect Firebase to train together.',
          tone: 'info',
          actions: [{ label: 'Got it', variant: 'primary' }],
        });
        return;
      }
      router.push({
        pathname: '/duel/[id]',
        params: {
          id: duelId,
          role: 'host',
          kind: 'train',
          name: partner.displayName,
          target: partner.uid,
        },
      });
    } finally {
      setStarting(false);
    }
  };

  const partnerName = partner?.displayName ?? 'your partner';

  return (
    <View style={{ flex: 1, backgroundColor: palette.canvas }}>
      <Screen style={{ backgroundColor: 'transparent' }}>
        {/* Masthead, in Home's shape: an eyebrow over a big title, with the
            lifetime count on the right as the one number this tab grows. */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow} numberOfLines={1} {...scaleForRole('control')}>
              {daysTrained > 0
                ? `${daysTrained}/${profile.weeklyGoal} days this week`
                : 'Your gym, anywhere'}
            </Text>
            <Text style={styles.title} accessibilityRole="header" {...scaleForRole('heading')}>
              Train
            </Text>
          </View>
          <View style={styles.repsPill} accessibilityLabel={`${totalReps} reps in total`}>
            <CountUp value={totalReps} style={[styles.repsValue, styles.tabular]} />
            <Text style={styles.repsUnit}>reps</Text>
          </View>
        </View>

        <StaggerIn index={0} style={{ marginTop: 16 }}>
          <WeekRepsCard
            week={thisWeek}
            daysTrained={daysTrained}
            goal={profile.weeklyGoal}
            streak={streakDays}
          />
        </StaggerIn>

        {/* The training programme leads: it's the guided path, above free practice. */}
        <StaggerIn index={1} style={{ marginTop: 16 }}>
          <ProgrammeCard />
        </StaggerIn>

        <HomeSectionHeader
          title="Practice"
          right={
            <View style={styles.aiChip}>
              <AiGlyph />
              <Text style={styles.aiChipText}>AI form coach</Text>
            </View>
          }
        />
        <StaggerIn index={2} style={styles.tileRow}>
          <PracticeTile
            title="Push-Ups"
            exercise="push"
            area="Upper body"
            accent={PUSH}
            todayBest={pushStats.todayBest}
            pb={best}
            locked={soloWalled}
            onPress={() => practice('push')}
          />
          <PracticeTile
            title="Squats"
            exercise="squat"
            area="Lower body"
            accent={SQUAT}
            todayBest={squatStats.todayBest}
            pb={squatBest}
            locked={soloWalled}
            onPress={() => practice('squat')}
          />
        </StaggerIn>

        {/* Yoga and meditation: timed and guided rather than camera-counted,
            and finishing one ticks the matching ritual habit. */}
        <HomeSectionHeader
          title="Yoga"
          right={
            <Text style={styles.sectionMeta}>
              {yogaWeek > 0 ? `${yogaWeek} min this week` : `${YOGA_FLOWS.length} guided flows`}
            </Text>
          }
        />
        <StaggerIn index={2}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.bleed}
            contentContainerStyle={styles.flowRow}
          >
            {YOGA_FLOWS.map((flow) => (
              <FlowCard
                key={flow.id}
                flow={flow}
                doneToday={doneOn(mindfulLog, 'yoga', flow.id, today)}
                onPress={() => router.push({ pathname: '/modal/yoga', params: { flow: flow.id } })}
              />
            ))}
          </ScrollView>
        </StaggerIn>

        <HomeSectionHeader
          title="Meditate"
          right={
            <Text style={styles.sectionMeta}>
              {meditateWeek > 0 ? `${meditateWeek} min this week` : 'Breathe along'}
            </Text>
          }
        />
        <StaggerIn index={2} style={styles.meditateGrid}>
          {MEDITATIONS.map((m) => (
            <MeditationTile
              key={m.id}
              session={m}
              doneToday={doneOn(mindfulLog, 'meditation', m.id, today)}
              onPress={() => router.push({ pathname: '/modal/breathe', params: { session: m.id } })}
            />
          ))}
        </StaggerIn>

        {/* The camera-coached half (Pro): pose-scored flows, single poses and
            voice-guided sits — next to the free timed flows above. */}
        <CameraCoachSection />

        <HomeSectionHeader title="Together" />
        {/* The one dark surface on the tab, like the streak tile on Home: the
            couple set is the thing only this app does. */}
        <StaggerIn index={2}>
          <View style={styles.togetherCard}>
            <View style={styles.togetherGlow} pointerEvents="none" />
            <View style={styles.togetherHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.togetherTitle} numberOfLines={1}>
                  {paired ? `Train with ${partnerName}` : 'Train together'}
                </Text>
                <Text style={styles.togetherBody}>
                  {starting
                    ? 'Setting up…'
                    : paired
                      ? streak > 0
                        ? `${combined.toLocaleString()} reps together so far`
                        : 'Start a set — your streak begins when you both train'
                      : 'Pair with your partner and train at the same time'}
                </Text>
              </View>
              {paired && streak > 0 ? (
                <View style={styles.streakChip} accessibilityLabel={`${streak} day streak`}>
                  <FlameIcon size={14} color={palette.amber300} />
                  <Text style={[styles.streakChipText, styles.tabular]}>{streak}</Text>
                </View>
              ) : null}
            </View>

            {paired ? (
              <View style={styles.togetherPicks}>
                <TogetherPick
                  label="Push-Ups"
                  exercise="push"
                  accent={palette.green400}
                  minHeight={reservedControlHeight(48, fontScale)}
                  disabled={starting}
                  onPress={() => void trainTogether('push')}
                />
                <TogetherPick
                  label="Squats"
                  exercise="squat"
                  accent={palette.purple400}
                  minHeight={reservedControlHeight(48, fontScale)}
                  disabled={starting}
                  onPress={() => void trainTogether('squat')}
                />
              </View>
            ) : (
              <PressableScale
                onPress={() => void trainTogether('push')}
                accessibilityRole="button"
                accessibilityLabel="Invite your partner"
                style={[styles.inviteButton, { minHeight: reservedControlHeight(44, fontScale) }]}
              >
                <Text style={styles.inviteText} {...scaleForRole('control')}>
                  Invite partner
                </Text>
                <ArrowIcon size={15} color={palette.ink} strokeWidth={2.4} />
              </PressableScale>
            )}
          </View>
        </StaggerIn>

        <HomeSectionHeader title="Personal bests" />
        <StaggerIn index={3}>
          <View style={styles.card}>
            <View style={styles.bestHead}>
              <View style={[styles.bestGlyph, { backgroundColor: `${PUSH}14` }]}>
                <ExerciseGlyph exercise="push" size={28} color={PUSH} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.bestLabel}>Push-ups in a row</Text>
                <Text style={styles.bestCaption} numberOfLines={2}>
                  {best === 0
                    ? 'Finish a set to log your first max'
                    : best >= nextMilestone
                      ? 'Top milestone cleared — keep pushing'
                      : `${pluralise(nextMilestone - best, 'rep')} to ${nextMilestone}`}
                </Text>
              </View>
              <CountUp value={best} style={[styles.bestNumber, { color: PUSH }]} />
            </View>

            <Roadmap best={best} next={nextMilestone} />

            <View style={styles.divider} />

            <View style={styles.bestHead}>
              <View style={[styles.bestGlyph, { backgroundColor: `${SQUAT}14` }]}>
                <ExerciseGlyph exercise="squat" size={28} color={SQUAT} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.bestLabel}>Squats in a row</Text>
                <Text style={styles.bestCaption} numberOfLines={2}>
                  {squatBest === 0
                    ? 'Finish a squat set to log your max'
                    : 'Keep chasing a deeper, cleaner rep'}
                </Text>
              </View>
              <CountUp value={squatBest} style={[styles.bestNumber, { color: SQUAT }]} />
            </View>
          </View>
        </StaggerIn>

        <HomeSectionHeader
          title="Library"
          right={<Text style={styles.sectionMeta}>{isPro ? 'All unlocked' : 'Pro'}</Text>}
        />
        <StaggerIn index={4}>
          <ExerciseLibrary />
        </StaggerIn>
      </Screen>
      {/* Same status-bar fade as Home, so cards slip under the clock. */}
      <LinearGradient
        pointerEvents="none"
        colors={[palette.canvas, 'rgba(246,247,245,0.85)', 'rgba(246,247,245,0)']}
        locations={[0, 0.6, 1]}
        style={[styles.statusFade, { height: insets.top + 18 }]}
      />
    </View>
  );
}

/**
 * A free staple as a tile: the movement's glyph on a wash of its colour,
 * today's best, the all-time best, and a go button — the same anatomy as
 * Home's Quick Start so the two tabs read as one app.
 */
function PracticeTile({
  title,
  exercise,
  area,
  accent,
  todayBest,
  pb,
  locked,
  onPress,
}: {
  title: string;
  exercise: ExerciseId;
  area: string;
  accent: string;
  todayBest: number;
  pb: number;
  /** Free reps are spent. The tile still taps — straight to the paywall. */
  locked: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={locked ? `${title} — free reps used, see Pro` : `Practice ${title}`}
      style={{ flex: 1 }}
    >
      <LinearGradient
        colors={[`${accent}24`, `${accent}0A`, palette.white]}
        locations={[0, 0.55, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.4, y: 1 }}
        style={styles.practiceTile}
      >
        <View style={styles.practiceTop}>
          <View style={styles.practiceGlyph}>
            <Image
              source={exercise === 'squat' ? IC_SQUAT : IC_PUSHUP}
              style={{ width: 38, height: 38 }}
              contentFit="contain"
            />
          </View>
          <View style={[styles.pbPill, locked && { backgroundColor: palette.divider }]}>
            <Text
              style={font('bold', 10.5, {
                color: locked ? palette.grey600 : accent,
              })}
            >
              {locked ? 'Free reps used' : pb > 0 ? `PB ${pb}` : 'No PB yet'}
            </Text>
          </View>
        </View>

        <Text style={styles.practiceTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.practiceArea, { color: accent }]} numberOfLines={1}>
          {area}
        </Text>

        <View style={styles.practiceFoot}>
          <View style={{ flex: 1 }}>
            <View style={styles.todayRow}>
              <CountUp
                value={todayBest}
                duration={800}
                style={[font('extrabold', 22, { color: palette.ink }), styles.tabular]}
              />
              <Text style={font('semibold', 11.5, { color: palette.grey500 })}>today</Text>
            </View>
          </View>
          <View
            style={[
              styles.goButton,
              {
                backgroundColor: locked ? palette.grey500 : accent,
                shadowColor: accent,
              },
            ]}
          >
            {locked ? (
              <LockIcon size={15} color={palette.white} />
            ) : (
              <ArrowIcon size={15} color={palette.white} strokeWidth={2.4} />
            )}
          </View>
        </View>
      </LinearGradient>
    </PressableScale>
  );
}

/** A yoga flow: its signature pose on a wash of its colour, and how long. */
function FlowCard({ flow, doneToday, onPress }: { flow: YogaFlow; doneToday: boolean; onPress: () => void }) {
  const minutes = flowMinutes(flow);
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${flow.title}, ${minutes} minutes of yoga${doneToday ? ', done today' : ''}`}
    >
      <View style={styles.flowCard}>
        <LinearGradient
          colors={[`${flow.accent}26`, `${flow.accent}0D`]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.flowCover}
        >
          <YogaGlyph pose={flow.cover} size={84} color={flow.accent} />
          <View style={styles.flowTime}>
            <Text style={font('extrabold', 11, { color: flow.accent })}>{minutes} min</Text>
          </View>
          {doneToday ? (
            <View style={[styles.doneDot, { backgroundColor: flow.accent }]}>
              <CheckIcon size={12} color={palette.white} strokeWidth={3} />
            </View>
          ) : null}
        </LinearGradient>
        <View style={styles.flowBody}>
          <Text style={styles.flowTitle} numberOfLines={1}>
            {flow.title}
          </Text>
          <Text style={styles.flowLine} numberOfLines={1}>
            {flow.line}
          </Text>
          <View style={styles.flowFoot}>
            <Text style={styles.flowMeta}>{poseCount(flow)} poses</Text>
            <View style={[styles.flowGo, { backgroundColor: flow.accent, shadowColor: flow.accent }]}>
              <PlayGlyph />
            </View>
          </View>
        </View>
      </View>
    </PressableScale>
  );
}

/**
 * A breathing session, on the same night palette the breathe screen opens
 * into, so tapping one feels like stepping into it rather than changing app.
 */
function MeditationTile({
  session,
  doneToday,
  onPress,
}: {
  session: Meditation;
  doneToday: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${session.title}, ${session.minutes} minute${session.minutes === 1 ? '' : 's'}${doneToday ? ', done today' : ''}`}
      style={styles.meditateWrap}
    >
      <LinearGradient
        colors={['#1E1B4B', '#3B2A6B']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.meditateTile}
      >
        <View style={styles.meditateHead}>
          <BreathGlyph />
          {doneToday ? (
            <View style={styles.meditateDone}>
              <CheckIcon size={11} color="#1E1B4B" strokeWidth={3} />
              <Text style={styles.meditateDoneText}>Today</Text>
            </View>
          ) : (
            <Text style={styles.meditateMin}>{session.minutes} min</Text>
          )}
        </View>
        <Text style={styles.meditateTitle} numberOfLines={1}>
          {session.title}
        </Text>
        <Text style={styles.meditatePattern}>{patternLabel(session.pattern)}</Text>
      </LinearGradient>
    </PressableScale>
  );
}

/** Concentric rings — the breathe screen's circle, at rest. */
function BreathGlyph() {
  return (
    <Svg width={30} height={30} viewBox="0 0 30 30">
      <Circle cx={15} cy={15} r={13} stroke="rgba(255,255,255,0.25)" strokeWidth={1.5} fill="none" />
      <Circle cx={15} cy={15} r={8.5} fill="rgba(167,139,250,0.45)" />
      <Circle cx={15} cy={15} r={3.5} fill="#FFFFFF" />
    </Svg>
  );
}

function PlayGlyph() {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24">
      <Path d="M7 4.5v15l13-7.5z" fill={palette.white} />
    </Svg>
  );
}

function TogetherPick({
  label,
  exercise,
  accent,
  minHeight,
  disabled,
  onPress,
}: {
  label: string;
  exercise: ExerciseId;
  accent: string;
  minHeight: number;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Together ${label.toLowerCase()} set`}
      style={[styles.togetherPick, { minHeight }]}
    >
      <ExerciseGlyph exercise={exercise} size={24} color={accent} />
      <Text style={styles.togetherPickText} {...scaleForRole('control')}>
        {label}
      </Text>
    </PressableScale>
  );
}

/** The push-up milestones as a chain of stops: cleared, next, and ahead. */
function Roadmap({ best, next }: { best: number; next: number }) {
  return (
    <View style={styles.roadmap} accessibilityLabel={`Milestones: next is ${next} push-ups`}>
      {MILESTONES.map((milestone, index) => {
        const reached = best >= milestone;
        const isNext = milestone === next && !reached;
        return (
          <View key={milestone} style={[styles.roadmapSegment, index === 0 && { flex: 0 }]}>
            {index > 0 ? (
              <View
                style={[styles.roadmapLine, { backgroundColor: reached ? PUSH : palette.divider }]}
              />
            ) : null}
            <View style={styles.stop}>
              <View
                style={[styles.stopDot, reached && styles.stopReached, isNext && styles.stopNext]}
              >
                {reached ? (
                  <CheckIcon size={13} color={palette.white} />
                ) : (
                  <Text
                    style={[
                      font('extrabold', 11, {
                        color: isNext ? PUSH : palette.grey500,
                      }),
                      styles.tabular,
                    ]}
                  >
                    {milestone}
                  </Text>
                )}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Clean sparkle mark for AI coaching — replaces the casual robot emoji. */
function AiGlyph() {
  const s = {
    stroke: palette.green600,
    strokeWidth: 2.2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  };
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <Path d="M12 3l1.9 4.6 4.6 1.9-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" {...s} />
      <Path d="M18.5 15l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" {...s} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  tabular: { fontVariant: ['tabular-nums'] },
  statusFade: { position: 'absolute', top: 0, left: 0, right: 0 },

  // Masthead
  header: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 12 },
  eyebrow: font('semibold', 13, { color: palette.grey600 }),
  title: {
    ...font('extrabold', 28, { color: palette.ink }),
    letterSpacing: -0.8,
  },
  repsPill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    height: 40,
    paddingHorizontal: 14,
    paddingTop: 9,
    borderRadius: radius.pill,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.08)',
    ...surfaceShadow,
  },
  repsValue: font('extrabold', 16, { color: palette.ink }),
  repsUnit: font('semibold', 12, { color: palette.grey600 }),

  sectionMeta: font('bold', 12, { color: palette.grey600 }),

  // Yoga
  bleed: { marginHorizontal: -SCREEN_GUTTER },
  /* Vertical padding keeps the cards' shadows from being clipped by the row. */
  flowRow: { paddingHorizontal: SCREEN_GUTTER, paddingVertical: 6, gap: 12 },
  flowCard: {
    width: 176,
    borderRadius: radius['4xl'],
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
    overflow: 'hidden',
    ...surfaceShadow,
  },
  flowCover: { height: 108, alignItems: 'center', justifyContent: 'center' },
  flowTime: {
    position: 'absolute',
    top: 10,
    left: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: palette.white,
  },
  doneDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowBody: { padding: 12, paddingTop: 10 },
  flowTitle: { ...font('extrabold', 15, { color: palette.ink }), letterSpacing: -0.3 },
  flowLine: { ...font('medium', 12, { color: palette.grey600 }), marginTop: 2 },
  flowFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  flowMeta: font('bold', 12, { color: palette.grey500 }),
  flowGo: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 2,
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },

  // Meditate
  meditateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  meditateWrap: { width: '48%', flexGrow: 1 },
  meditateTile: { borderRadius: radius['3xl'], padding: 14, overflow: 'hidden' },
  meditateHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  meditateMin: font('bold', 11.5, { color: 'rgba(255,255,255,0.7)' }),
  meditateDone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(196,181,253,0.95)',
  },
  meditateDoneText: font('extrabold', 10.5, { color: '#1E1B4B' }),
  meditateTitle: { ...font('extrabold', 15, { color: palette.white }), letterSpacing: -0.3, marginTop: 14 },
  meditatePattern: {
    ...font('semibold', 12, { color: 'rgba(196,181,253,0.9)' }),
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  aiChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: palette.green50,
  },
  aiChipText: font('bold', 11.5, { color: palette.green700 }),

  // Practice tiles
  tileRow: { flexDirection: 'row', gap: 12 },
  practiceTile: {
    borderRadius: radius['4xl'],
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
    overflow: 'hidden',
    backgroundColor: palette.white,
    ...surfaceShadow,
  },
  practiceTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  practiceGlyph: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pbPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: palette.white,
  },
  practiceTitle: {
    ...font('extrabold', 16, { color: palette.ink }),
    marginTop: 12,
    letterSpacing: -0.3,
  },
  practiceArea: font('semibold', 11.5),
  practiceFoot: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginTop: 10,
  },
  todayRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  goButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },

  // Together
  togetherCard: {
    borderRadius: radius['4xl'],
    padding: 16,
    backgroundColor: palette.ink,
    overflow: 'hidden',
    ...surfaceShadow,
  },
  togetherGlow: {
    position: 'absolute',
    top: -60,
    right: -50,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(34,197,94,0.09)',
  },
  togetherHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  togetherTitle: {
    ...font('extrabold', 18, { color: palette.white }),
    letterSpacing: -0.4,
  },
  togetherBody: {
    ...font('medium', 12.5, { color: 'rgba(255,255,255,0.65)' }),
    marginTop: 4,
    lineHeight: 17,
  },
  streakChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(251,191,36,0.16)',
  },
  streakChipText: font('extrabold', 13, { color: palette.amber300 }),
  togetherPicks: { flexDirection: 'row', gap: 10, marginTop: 14 },
  togetherPick: {
    // `minHeight` at render time — see `@/theme/fontScale`.
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius['2xl'],
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  togetherPickText: font('bold', 14, { color: palette.white }),
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
    borderRadius: radius.pill,
    backgroundColor: palette.white,
  },
  inviteText: font('extrabold', 14, { color: palette.ink }),

  // Personal bests
  card: {
    borderRadius: radius['4xl'],
    padding: 14,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
    ...surfaceShadow,
  },
  bestHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bestGlyph: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bestLabel: {
    ...font('bold', 14, { color: palette.ink }),
    letterSpacing: -0.2,
  },
  bestCaption: {
    ...font('medium', 12, { color: palette.grey600 }),
    marginTop: 1,
  },
  bestNumber: {
    ...font('extrabold', 30),
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  divider: { height: 1, backgroundColor: palette.divider, marginVertical: 14 },
  roadmap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingHorizontal: 2,
  },
  roadmapSegment: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  roadmapLine: { flex: 1, height: 4, borderRadius: 2, marginHorizontal: 3 },
  stop: { width: 32, alignItems: 'center' },
  stopDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: palette.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopReached: { backgroundColor: PUSH },
  stopNext: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.white,
    borderWidth: 3,
    borderColor: PUSH,
  },
});

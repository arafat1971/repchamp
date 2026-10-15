import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';

import { ModalHeader } from '@/components/ModalHeader';
import { IOS } from '@/components/home/HealthCard';
import { StepsTogether } from '@/components/home/StepsTogether';
import { PressableScale, Screen } from '@/components/ui';
import { partnerStepsToday } from '@/domain/couple';
import { reminderSentLine } from '@/domain/partnerReminder';
import { dayKey } from '@/domain/progression';
import {
  DEFAULT_STEP_GOAL,
  formatSteps,
  isFixableByAthlete,
  stepStepGoal,
  stepsProgress,
  stepsUnavailableCopy,
} from '@/domain/steps';
import { stepsDuo } from '@/domain/stepsDuo';
import {
  cadence,
  cadenceLabel,
  goalStreak,
  journeyAt,
  lastSevenDays,
  stepBadges,
  stepStats,
} from '@/domain/stepsHistory';
import { stepsExtras, stepsPace, WALK_STEPS_PER_MIN } from '@/domain/stepsPace';
import { track } from '@/lib/analytics';
import { captureError } from '@/lib/crash';
import { lightImpactHaptic, playPopSound, playSparkleSound, selectionHaptic, successHaptic } from '@/lib/feedback';
import { nudgePartner } from '@/services/coupleService';
import { sendPoke } from '@/services/ritualSync';
import { useAuthStore } from '@/state/authStore';
import { useProfileStore } from '@/state/profileStore';
import { useStepsStore } from '@/state/stepsStore';
import { useCouple } from '@/state/useCouple';
import { showDialog } from '@/state/useDialog';
import { usePublicAvatar } from '@/state/usePublicAvatar';
import { useStepsToday } from '@/state/useStepsToday';
import { font } from '@/theme/typography';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const ORANGE = { from: '#FFB547', to: '#FF6B2C', soft: 'rgba(255,107,44,0.12)', ink: '#C2410C' };
const HERO = 210;
const HERO_STROKE = 18;
/** How often a live walk re-reads the pedometer. */
const WALK_POLL_MS = 3000;

/**
 * Steps — the whole picture behind the Home card.
 *
 * Today's ring with a goal you can change, a pace coach that talks in
 * minutes of walking, a live "Walk now" mode with cadence, your partner's day
 * beside yours, the last seven days, a streak, badges, and the distance
 * you've covered turned into a trip.
 */
export default function StepsScreen() {
  const router = useRouter();
  const { steps, refresh, openSettings } = useStepsToday();
  const goal = useStepsStore((s) => s.goal);
  const setGoal = useStepsStore((s) => s.setGoal);
  const history = useStepsStore((s) => s.history);
  const partnerHistory = useStepsStore((s) => s.partnerHistory);
  const partnerHistoryUid = useStepsStore((s) => s.partnerUid);
  const displayName = useProfileStore((s) => s.displayName);
  const avatarUri = useProfileStore((s) => s.avatarUri);
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const couple = useCouple();
  const today = dayKey();

  const read = steps.status === 'ready' ? stepsProgress(steps.steps, steps.goal) : null;
  const myName = displayName?.trim().split(/\s+/)[0] || 'You';

  /* A minute clock for the pace coach. */
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const pace = read ? stepsPace(read.steps, read.goal, clock) : null;
  const extras = stepsExtras(read?.steps ?? 0);
  const activeMin = Math.round((read?.steps ?? 0) / WALK_STEPS_PER_MIN);

  const week = useMemo(() => lastSevenDays(history, today, goal), [history, today, goal]);
  const stats = useMemo(() => stepStats(history, today), [history, today]);
  const streak = useMemo(() => goalStreak(history, today), [history, today]);
  const badges = useMemo(() => stepBadges(history, today), [history, today]);
  const journey = useMemo(() => journeyAt(stats.lifetimeKm), [stats.lifetimeKm]);

  /* Partner. */
  const partner = couple.paired ? couple.partner : null;
  const partnerName = partner?.displayName?.trim() || 'Partner';
  const partnerAvatar = usePublicAvatar(partner?.uid, partner?.avatarUrl);
  const theirSteps = partner ? partnerStepsToday(partner, today) : null;
  const coupleId = couple.couple?.id ?? null;
  useEffect(() => {
    if (!partner?.uid || theirSteps == null) return;
    useStepsStore.getState().recordPartner(partner.uid, theirSteps, DEFAULT_STEP_GOAL, today);
  }, [partner?.uid, theirSteps, today]);
  const theirWeek = useMemo(
    () => (partner && partnerHistoryUid === partner.uid ? lastSevenDays(partnerHistory, today, DEFAULT_STEP_GOAL) : null),
    [partner, partnerHistoryUid, partnerHistory, today],
  );
  const weekScore = useMemo(() => {
    if (!theirWeek) return null;
    let me = 0;
    let them = 0;
    week.forEach((b, i) => {
      const t = theirWeek[i];
      if (!t || (b.steps === 0 && t.steps === 0)) return;
      if (b.steps > t.steps) me += 1;
      else if (t.steps > b.steps) them += 1;
    });
    return { me, them };
  }, [week, theirWeek]);
  const [nudging, setNudging] = useState(false);

  const nudgeWalk = async () => {
    if (!coupleId || !uid || nudging) return;
    setNudging(true);
    try {
      await nudgePartner(coupleId, uid, myName, 'walk');
      track('couple_nudge_sent');
      successHaptic();
      showDialog({
        title: 'Reminder sent',
        message: reminderSentLine('walk', partnerName),
        tone: 'success',
        actions: [{ label: 'Got it', variant: 'primary' }],
      });
    } catch (error) {
      captureError(error);
      showDialog({
        title: 'Reminder not sent',
        message: 'Check your connection and try again.',
        tone: 'danger',
        actions: [{ label: 'OK', variant: 'primary' }],
      });
    } finally {
      setNudging(false);
    }
  };

  const cheer = () => {
    const ok = sendPoke(coupleId, uid, '🔥');
    if (ok) {
      playPopSound();
      lightImpactHaptic();
      track('couple_poke', { emoji: '🔥', source: 'cheer' });
    }
    return ok;
  };

  /* ---- Walk now: a live session measured off the day's count ---- */
  const [walk, setWalk] = useState<{ startAt: number; startSteps: number } | null>(null);
  const samples = useRef<{ at: number; steps: number }[]>([]);
  /* The walk's clock: ticks with each poll, so the timer reads state. */
  const [walkNow, setWalkNow] = useState(0);
  const [spm, setSpm] = useState(0);

  useEffect(() => {
    if (!walk) return;
    const id = setInterval(() => {
      refresh();
      setWalkNow(Date.now());
    }, WALK_POLL_MS);
    return () => clearInterval(id);
  }, [walk, refresh]);

  useEffect(() => {
    if (!walk || steps.status !== 'ready' || walkNow === 0) return;
    const list = samples.current;
    list.push({ at: walkNow, steps: steps.steps });
    if (list.length > 60) list.splice(0, list.length - 60);
    setSpm(cadence(list));
  }, [walk, steps, walkNow]);

  const startWalk = () => {
    if (steps.status !== 'ready') return;
    successHaptic();
    const at = Date.now();
    samples.current = [{ at, steps: steps.steps }];
    setSpm(0);
    setWalkNow(at);
    setWalk({ startAt: at, startSteps: steps.steps });
    track('steps_walk_started');
  };

  const stopWalk = () => {
    if (!walk) return;
    const gained = Math.max(0, (read?.steps ?? walk.startSteps) - walk.startSteps);
    const mins = Math.max(1, Math.round((Date.now() - walk.startAt) / 60_000));
    setWalk(null);
    samples.current = [];
    track('steps_walk_finished', { steps: gained, minutes: mins });
    if (gained > 0) {
      playSparkleSound();
      successHaptic();
    }
    showDialog({
      title: gained > 0 ? 'Nice walk!' : 'Walk ended',
      message:
        gained > 0
          ? `${formatSteps(gained)} steps in ${mins} min · ≈ ${stepsExtras(gained).km} km`
          : 'No steps counted this time — keep your phone on you while you walk.',
      tone: gained > 0 ? 'success' : 'info',
      actions: [{ label: 'Done', variant: 'primary' }],
    });
  };

  const walkSteps = walk && read ? Math.max(0, read.steps - walk.startSteps) : 0;
  const walkSecs = walk ? Math.max(0, Math.floor((walkNow - walk.startAt) / 1000)) : 0;
  const cad = cadenceLabel(spm);

  const changeGoal = (dir: 1 | -1) => {
    selectionHaptic();
    const next = stepStepGoal(goal, dir);
    setGoal(next);
    track('steps_goal_changed', { goal: next, source: 'screen' });
  };

  const canFix = steps.status === 'unavailable' && isFixableByAthlete(steps.reason);

  return (
    <Screen onRefresh={refresh}>
      <ModalHeader title="Steps" subtitle={partner ? `You and ${partnerName}` : 'Today'} />

      {/* ---- Hero ---- */}
      <Animated.View entering={FadeInUp.duration(380)} style={styles.card}>
        <View style={styles.heroWrap}>
          <HeroRing pct={read ? read.steps / read.goal : null} met={!!read?.met} />
          <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
            <Text style={styles.heroCount} numberOfLines={1}>
              {read ? formatSteps(read.steps) : '—'}
            </Text>
            <Text style={styles.heroUnit}>{read?.met ? 'goal reached 🏆' : 'steps today'}</Text>
            {read && !read.met ? <Text style={styles.heroLeft}>{formatSteps(read.remaining)} to go</Text> : null}
          </View>
        </View>

        {!read ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {steps.status === 'unavailable' ? stepsUnavailableCopy(steps.reason) : 'Counting…'}
            </Text>
            {canFix ? (
              <PressableScale onPress={openSettings} accessibilityRole="button" style={styles.fix}>
                <Text style={styles.fixText}>Turn on step counting</Text>
              </PressableScale>
            ) : null}
          </View>
        ) : null}

        <View style={styles.goalRow}>
          <PressableScale
            onPress={() => changeGoal(-1)}
            accessibilityRole="button"
            accessibilityLabel="Lower step goal"
            style={styles.goalBtn}
          >
            <Text style={styles.goalBtnText}>−</Text>
          </PressableScale>
          <View style={styles.center}>
            <Text style={styles.goalLabel}>DAILY GOAL</Text>
            <Text style={styles.goalValue}>{formatSteps(goal)}</Text>
          </View>
          <PressableScale
            onPress={() => changeGoal(1)}
            accessibilityRole="button"
            accessibilityLabel="Raise step goal"
            style={styles.goalBtn}
          >
            <Text style={styles.goalBtnText}>+</Text>
          </PressableScale>
        </View>

        <View style={styles.statRow}>
          <MiniStat emoji="📍" value={`${extras.km}`} unit="km" />
          <MiniStat emoji="🔥" value={`${extras.kcal}`} unit="kcal" />
          <MiniStat emoji="⏱️" value={`${activeMin}`} unit="active min" />
          <MiniStat emoji="⚡" value={`${streak}`} unit={streak === 1 ? 'day streak' : 'day streak'} />
        </View>

        {pace ? (
          <View style={[styles.coach, pace.status === 'behind' && styles.coachPush, pace.status === 'done' && styles.coachWin]}>
            <Text style={styles.coachEmoji}>{pace.status === 'done' ? '🏆' : pace.status === 'behind' ? '🚶' : '✨'}</Text>
            <Text style={styles.coachText}>{pace.line}</Text>
          </View>
        ) : null}
      </Animated.View>

      {/* ---- Walk now ---- */}
      <Animated.View entering={FadeInUp.delay(80).duration(380)} style={[styles.card, styles.walkCard]}>
        <LinearGradient
          colors={walk ? ['#FF6B2C', '#F43F5E'] : ['#1F2937', '#111827']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.walkHead}>
          <WalkingShoe active={!!walk} />
          <View style={{ flex: 1 }}>
            <Text style={styles.walkTitle}>{walk ? 'Walking now' : 'Walk now'}</Text>
            <Text style={styles.walkSub}>
              {walk
                ? `${cad.label}${spm > 0 ? ` · ${spm} steps/min` : ''}`
                : pace?.status === 'behind'
                  ? `A ${pace.walkMin}-min walk puts you back on pace`
                  : 'Track a walk live — steps, time and pace'}
            </Text>
          </View>
        </View>
        {walk ? (
          <Animated.View entering={FadeIn.duration(240)} style={styles.walkStats}>
            <View style={styles.walkStat}>
              <Text style={styles.walkBig}>{formatSteps(walkSteps)}</Text>
              <Text style={styles.walkSmall}>steps</Text>
            </View>
            <View style={styles.walkStat}>
              <Text style={styles.walkBig}>
                {Math.floor(walkSecs / 60)}:{String(walkSecs % 60).padStart(2, '0')}
              </Text>
              <Text style={styles.walkSmall}>time</Text>
            </View>
            <View style={styles.walkStat}>
              <Text style={styles.walkBig}>{stepsExtras(walkSteps).km}</Text>
              <Text style={styles.walkSmall}>km</Text>
            </View>
          </Animated.View>
        ) : null}
        <PressableScale
          onPress={walk ? stopWalk : startWalk}
          disabled={!walk && steps.status !== 'ready'}
          accessibilityRole="button"
          accessibilityLabel={walk ? 'Finish walk' : 'Start a walk'}
          style={[styles.walkBtn, !walk && steps.status !== 'ready' && { opacity: 0.5 }]}
        >
          <Text style={[styles.walkBtnText, walk && { color: '#E11D48' }]}>{walk ? 'Finish walk' : 'Start walk'}</Text>
        </PressableScale>
      </Animated.View>

      {/* ---- Together ---- */}
      {partner ? (
        <Animated.View entering={FadeInUp.delay(140).duration(380)} style={styles.card}>
          <SectionHead emoji="👫" title="Steps together" trailing={theirSteps == null ? 'Waiting…' : 'Live'} />
          <StepsTogether
            mine={read ? read.steps : null}
            myGoal={read?.goal ?? goal}
            me={{ name: myName, avatar: avatarUri }}
            partner={{ name: partnerName, avatar: partnerAvatar, steps: theirSteps }}
            theirGoal={DEFAULT_STEP_GOAL}
            onCheer={cheer}
          />
          <TogetherFinish mine={read?.steps ?? 0} theirs={theirSteps} myGoal={goal} name={partnerName} />
          <View style={styles.togetherActions}>
            <PressableScale
              onPress={() => void nudgeWalk()}
              disabled={nudging}
              accessibilityRole="button"
              style={[styles.pill, { backgroundColor: ORANGE.soft }]}
            >
              <Text style={[styles.pillText, { color: ORANGE.ink }]} numberOfLines={1}>
                {nudging ? 'Sending…' : '🚶 Nudge to walk'}
              </Text>
            </PressableScale>
            <PressableScale
              onPress={() => router.push('/couple/partner')}
              accessibilityRole="button"
              style={[styles.pill, { backgroundColor: IOS.fill }]}
            >
              <Text style={[styles.pillText, { color: IOS.label }]}>Their day ›</Text>
            </PressableScale>
          </View>
        </Animated.View>
      ) : (
        <Animated.View entering={FadeInUp.delay(140).duration(380)} style={[styles.card, styles.invite]}>
          <Text style={styles.inviteEmoji}>👫</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.inviteTitle}>Walk together</Text>
            <Text style={styles.inviteBody}>Pair with your partner to race steps live, share one team goal and nudge each other out the door.</Text>
          </View>
          <PressableScale
            onPress={() => {
              track('invite_card_tapped', { source: 'steps' });
              router.push('/modal/couple-invite');
            }}
            accessibilityRole="button"
            style={styles.inviteBtn}
          >
            <Text style={styles.inviteBtnText}>Invite</Text>
          </PressableScale>
        </Animated.View>
      )}

      {/* ---- This week ---- */}
      <Animated.View entering={FadeInUp.delay(200).duration(380)} style={styles.card}>
        <SectionHead
          emoji="📊"
          title="This week"
          trailing={
            stats.weekTrend == null
              ? `avg ${formatSteps(stats.weekAvg)}`
              : `${stats.weekTrend >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(stats.weekTrend * 100))}% vs last week`
          }
        />
        {week.every((b) => b.steps === 0) && !(theirWeek ?? []).some((b) => b.steps > 0) ? (
          <View style={styles.chartEmpty}>
            <Text style={styles.chartEmptyEmoji}>📈</Text>
            <Text style={styles.chartEmptyText}>Your week fills in as you walk — every day you open RepChamp adds a bar.</Text>
          </View>
        ) : (
          <WeekChart bars={week} them={theirWeek} />
        )}
        {theirWeek && weekScore ? (
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: ORANGE.to }]} />
            <Text style={styles.legendText}>You · {weekScore.me} {weekScore.me === 1 ? 'day' : 'days'} won</Text>
            <View style={[styles.legendDot, { backgroundColor: '#7C5CFA', marginLeft: 14 }]} />
            <Text style={styles.legendText}>
              {partnerName} · {weekScore.them} {weekScore.them === 1 ? 'day' : 'days'} won
            </Text>
          </View>
        ) : null}
        <View style={styles.weekFoot}>
          <FootStat label="Total" value={formatSteps(stats.weekTotal)} />
          <FootStat label="Daily avg" value={formatSteps(stats.weekAvg)} />
          <FootStat label="Best day" value={stats.best ? formatSteps(stats.best.steps) : '—'} />
        </View>
      </Animated.View>

      {/* ---- Journey ---- */}
      <Animated.View entering={FadeInUp.delay(260).duration(380)} style={[styles.card, styles.journey]}>
        <LinearGradient colors={['#0EA5E9', '#6366F1']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <Text style={styles.journeyEyebrow}>YOUR JOURNEY</Text>
        <Text style={styles.journeyKm}>
          {journey.km} <Text style={styles.journeyUnit}>km walked</Text>
        </Text>
        <View style={styles.journeyTrack}>
          <View style={[styles.journeyFill, { width: `${Math.max(3, journey.progress * 100)}%` }]} />
        </View>
        <View style={styles.journeyEnds}>
          <Text style={styles.journeyEnd} numberOfLines={1}>
            {journey.from.emoji} {journey.from.name}
          </Text>
          {journey.to ? (
            <Text style={[styles.journeyEnd, { textAlign: 'right' }]} numberOfLines={1}>
              {journey.to.name} {journey.to.emoji}
            </Text>
          ) : null}
        </View>
        {journey.to ? (
          <Text style={styles.journeyNext}>
            {journey.kmToNext} km to go · about {formatSteps(Math.round((journey.kmToNext * 1000) / 0.75))} steps
          </Text>
        ) : (
          <Text style={styles.journeyNext}>You walked around the world. Legend.</Text>
        )}
      </Animated.View>

      {/* ---- Badges ---- */}
      <Animated.View entering={FadeInUp.delay(320).duration(380)} style={styles.card}>
        <SectionHead emoji="🏅" title="Badges" trailing={`${badges.filter((b) => b.earned).length} / ${badges.length}`} />
        <View style={styles.badgeGrid}>
          {badges.map((b, i) => (
            <Animated.View key={b.id} entering={FadeInDown.delay(360 + i * 30).duration(300)} style={styles.badge}>
              <View style={[styles.badgeDisc, !b.earned && styles.badgeLocked]}>
                <Text style={[styles.badgeEmoji, !b.earned && { opacity: 0.35 }]}>{b.emoji}</Text>
                {!b.earned ? (
                  <View style={styles.badgeBar}>
                    <View style={[styles.badgeBarFill, { width: `${b.progress * 100}%` }]} />
                  </View>
                ) : null}
              </View>
              <Text style={[styles.badgeTitle, !b.earned && { color: IOS.secondary }]} numberOfLines={1}>
                {b.title}
              </Text>
              <Text style={styles.badgeDetail} numberOfLines={2}>
                {b.detail}
              </Text>
            </Animated.View>
          ))}
        </View>
      </Animated.View>

      <Text style={styles.footnote}>
        Distance and energy are estimates from your step count. History builds from the days you open RepChamp.
      </Text>
    </Screen>
  );
}

/* ------------------------------------------------------------------ */

function HeroRing({ pct, met }: { pct: number | null; met: boolean }) {
  const reduced = useReducedMotion();
  const r = (HERO - HERO_STROKE) / 2;
  const c = 2 * Math.PI * r;
  const progress = useSharedValue(0);
  useEffect(() => {
    const to = Math.max(0, Math.min(1, pct ?? 0));
    progress.value = reduced ? to : withTiming(to, { duration: 1200, easing: Easing.out(Easing.cubic) });
  }, [pct, reduced, progress]);
  const arc = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - progress.value) }));

  /* A slow glow once the goal is met. */
  const glow = useSharedValue(1);
  useEffect(() => {
    if (!met || reduced) return;
    glow.set(withRepeat(withSequence(withTiming(1.04, { duration: 900 }), withTiming(1, { duration: 900 })), -1));
    return () => cancelAnimation(glow);
  }, [met, reduced, glow]);
  const breathe = useAnimatedStyle(() => ({ transform: [{ scale: glow.value }] }));

  return (
    <Animated.View style={breathe}>
      <Svg width={HERO} height={HERO} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Defs>
          <SvgGradient id="hero-g" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={met ? '#4ADE80' : ORANGE.from} />
            <Stop offset="1" stopColor={met ? '#16A34A' : ORANGE.to} />
          </SvgGradient>
        </Defs>
        <Circle cx={HERO / 2} cy={HERO / 2} r={r} stroke={ORANGE.soft} strokeWidth={HERO_STROKE} fill="none" />
        {pct != null ? (
          <AnimatedCircle
            cx={HERO / 2}
            cy={HERO / 2}
            r={r}
            stroke="url(#hero-g)"
            strokeWidth={HERO_STROKE}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={c}
            animatedProps={arc}
          />
        ) : null}
      </Svg>
    </Animated.View>
  );
}

/** A shoe that steps in place while a walk is live. */
function WalkingShoe({ active }: { active: boolean }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (!active || reduced) {
      cancelAnimation(t);
      t.set(0);
      return;
    }
    t.set(withRepeat(withTiming(1, { duration: 520, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => cancelAnimation(t);
  }, [active, reduced, t]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -4 * t.value }, { rotate: `${-10 + 20 * t.value}deg` }],
  }));
  return (
    <View style={styles.shoeDisc}>
      <Animated.Text style={[styles.shoe, style]}>👟</Animated.Text>
    </View>
  );
}

function WeekChart({ bars, them }: { bars: ReturnType<typeof lastSevenDays>; them?: ReturnType<typeof lastSevenDays> | null }) {
  const max = Math.max(...bars.map((b) => Math.max(b.steps, b.goal)), ...(them ?? []).map((b) => b.steps), 1);
  const goalY = (bars[bars.length - 1]?.goal ?? DEFAULT_STEP_GOAL) / max;
  const H = 120;
  return (
    <View style={[styles.chart, { height: H + 22 }]}>
      <View style={[styles.goalLine, { bottom: 22 + goalY * H }]} pointerEvents="none" />
      {bars.map((b, i) => {
        const h = Math.max(b.steps > 0 ? 4 : 2, (b.steps / max) * H);
        const t = them?.[i];
        const th = t ? Math.max(t.steps > 0 ? 4 : 2, (t.steps / max) * H) : 0;
        return (
          <View key={b.day} style={styles.barCol}>
            <View style={{ height: H, flexDirection: 'row', alignItems: 'flex-end', gap: 3 }}>
              <Animated.View entering={FadeInUp.delay(i * 50).duration(400)} style={{ height: h }}>
                <LinearGradient
                  colors={b.met ? ['#4ADE80', '#16A34A'] : b.isToday ? [ORANGE.from, ORANGE.to] : ['#FDBA74', '#FB923C']}
                  style={[styles.bar, them && styles.barThin, !b.isToday && !b.met && { opacity: 0.55 }]}
                />
              </Animated.View>
              {t ? (
                <Animated.View entering={FadeInUp.delay(i * 50 + 25).duration(400)} style={{ height: th }}>
                  <LinearGradient
                    colors={['#B69CFF', '#7C5CFA']}
                    style={[styles.bar, styles.barThin, !t.isToday && { opacity: 0.6 }]}
                  />
                </Animated.View>
              ) : null}
            </View>
            <Text style={[styles.barLabel, b.isToday && { color: ORANGE.ink, fontWeight: '800' }]}>{b.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** Who finishes first, and what's left for the two of you as a team. */
function TogetherFinish({ mine, theirs, myGoal, name }: { mine: number; theirs: number | null; myGoal: number; name: string }) {
  if (theirs == null) return null;
  const duo = stepsDuo({ mine, theirs, myGoal, theirGoal: DEFAULT_STEP_GOAL, name });
  const teamLeft = Math.max(0, duo.togetherGoal - duo.together);
  return (
    <View style={styles.teamRow}>
      <Text style={styles.teamText}>
        {teamLeft === 0
          ? '🎉 Team goal smashed — you two walked it together'
          : `🤝 ${formatSteps(teamLeft)} steps left as a team · ≈ ${stepsExtras(teamLeft).km} km`}
      </Text>
    </View>
  );
}

function SectionHead({ emoji, title, trailing }: { emoji: string; title: string; trailing?: string }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>
        {emoji} {title}
      </Text>
      {trailing ? <Text style={styles.sectionTrailing}>{trailing}</Text> : null}
    </View>
  );
}

function MiniStat({ emoji, value, unit }: { emoji: string; value: string; unit: string }) {
  return (
    <View style={styles.mini}>
      <Text style={styles.miniEmoji}>{emoji}</Text>
      <Text style={styles.miniValue}>{value}</Text>
      <Text style={styles.miniUnit} numberOfLines={1}>
        {unit}
      </Text>
    </View>
  );
}

function FootStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={styles.footValue}>{value}</Text>
      <Text style={styles.footLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  heroWrap: { alignSelf: 'center', width: HERO, height: HERO, marginTop: 4 },
  heroCount: { ...font('extrabold', 40, { color: IOS.label }), letterSpacing: -1.2, fontVariant: ['tabular-nums'] },
  heroUnit: font('semibold', 13, { color: IOS.secondary }),
  heroLeft: { ...font('bold', 12, { color: ORANGE.ink, marginTop: 4 }), fontVariant: ['tabular-nums'] },
  empty: { alignItems: 'center', gap: 10, marginTop: 10 },
  emptyText: { ...font('medium', 14, { color: IOS.secondary }), textAlign: 'center' },
  fix: { backgroundColor: ORANGE.soft, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  fixText: font('bold', 14, { color: ORANGE.ink }),
  goalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22, marginTop: 14 },
  goalBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: IOS.fill, alignItems: 'center', justifyContent: 'center' },
  goalBtnText: font('bold', 22, { color: IOS.label, marginTop: -2 }),
  goalLabel: { ...font('bold', 10.5, { color: IOS.secondary }), letterSpacing: 1.4 },
  goalValue: { ...font('extrabold', 20, { color: IOS.label }), fontVariant: ['tabular-nums'] },
  statRow: { flexDirection: 'row', marginTop: 16, gap: 8 },
  mini: { flex: 1, alignItems: 'center', backgroundColor: IOS.fill, borderRadius: 14, paddingVertical: 10 },
  miniEmoji: { fontSize: 16 },
  miniValue: { ...font('extrabold', 16, { color: IOS.label, marginTop: 2 }), fontVariant: ['tabular-nums'] },
  miniUnit: font('medium', 10.5, { color: IOS.secondary }),
  coach: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: IOS.fill },
  coachPush: { backgroundColor: ORANGE.soft },
  coachWin: { backgroundColor: 'rgba(52,199,89,0.12)' },
  coachEmoji: { fontSize: 18 },
  coachText: { ...font('semibold', 13.5, { color: IOS.label }), flex: 1 },
  walkCard: { padding: 18 },
  walkHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  shoeDisc: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  shoe: { fontSize: 26 },
  walkTitle: font('extrabold', 18, { color: '#FFFFFF' }),
  walkSub: font('medium', 13, { color: 'rgba(255,255,255,0.8)', marginTop: 2 }),
  walkStats: { flexDirection: 'row', marginTop: 16 },
  walkStat: { flex: 1, alignItems: 'center' },
  walkBig: { ...font('extrabold', 26, { color: '#FFFFFF' }), fontVariant: ['tabular-nums'] },
  walkSmall: font('semibold', 11.5, { color: 'rgba(255,255,255,0.75)' }),
  walkBtn: { marginTop: 16, height: 48, borderRadius: 24, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  walkBtnText: font('extrabold', 15.5, { color: '#111827' }),
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  sectionTitle: font('extrabold', 16, { color: IOS.label }),
  sectionTrailing: { ...font('semibold', 12, { color: IOS.secondary }), fontVariant: ['tabular-nums'] },
  togetherActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  pill: { flex: 1, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  pillText: font('bold', 13),
  teamRow: { marginTop: 10, padding: 10, borderRadius: 12, backgroundColor: 'rgba(124,92,250,0.08)' },
  teamText: { ...font('semibold', 12.5, { color: '#5B21B6' }), textAlign: 'center' },
  invite: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  inviteEmoji: { fontSize: 30 },
  inviteTitle: font('extrabold', 15.5, { color: IOS.label }),
  inviteBody: font('medium', 12.5, { color: IOS.secondary, marginTop: 2 }),
  inviteBtn: { backgroundColor: ORANGE.to, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 },
  inviteBtnText: font('extrabold', 13.5, { color: '#FFFFFF' }),
  chart: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 12 },
  goalLine: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(22,163,74,0.5)' },
  barCol: { flex: 1, alignItems: 'center' },
  bar: { width: 22, height: '100%', borderRadius: 7 },
  chartEmpty: { alignItems: 'center', paddingVertical: 28, gap: 8 },
  chartEmptyEmoji: { fontSize: 30 },
  chartEmptyText: { ...font('medium', 13, { color: IOS.secondary }), textAlign: 'center', maxWidth: 260 },
  barThin: { width: 12, borderRadius: 5 },
  legendRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  legendText: font('semibold', 12, { color: IOS.secondary }),
  barLabel: font('semibold', 11.5, { color: IOS.secondary, marginTop: 6 }),
  weekFoot: { flexDirection: 'row', marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: IOS.separator },
  footValue: { ...font('extrabold', 15, { color: IOS.label }), fontVariant: ['tabular-nums'] },
  footLabel: font('medium', 11, { color: IOS.secondary }),
  journey: { padding: 18 },
  journeyEyebrow: { ...font('extrabold', 10.5, { color: 'rgba(255,255,255,0.8)' }), letterSpacing: 2 },
  journeyKm: { ...font('extrabold', 34, { color: '#FFFFFF', marginTop: 4 }), fontVariant: ['tabular-nums'] },
  journeyUnit: font('semibold', 14, { color: 'rgba(255,255,255,0.85)' }),
  journeyTrack: { height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.25)', marginTop: 12, overflow: 'hidden' },
  journeyFill: { height: '100%', borderRadius: 5, backgroundColor: '#FFFFFF' },
  journeyEnds: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 8 },
  journeyEnd: { ...font('semibold', 12, { color: '#FFFFFF' }), flexShrink: 1 },
  journeyNext: font('medium', 12, { color: 'rgba(255,255,255,0.85)', marginTop: 6 }),
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, rowGap: 14 },
  badge: { width: '33.33%', alignItems: 'center', paddingHorizontal: 4 },
  badgeDisc: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(255,181,71,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  badgeLocked: { backgroundColor: IOS.fill },
  badgeEmoji: { fontSize: 28 },
  badgeBar: { position: 'absolute', bottom: 8, left: 12, right: 12, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.08)' },
  badgeBarFill: { height: '100%', borderRadius: 2, backgroundColor: ORANGE.to },
  badgeTitle: { ...font('bold', 12, { color: IOS.label, marginTop: 6 }), textAlign: 'center' },
  badgeDetail: { ...font('medium', 10.5, { color: IOS.secondary }), textAlign: 'center' },
  footnote: { ...font('medium', 11.5, { color: IOS.secondary }), textAlign: 'center', marginBottom: 30, paddingHorizontal: 20 },
});

import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeInDown, FadeOutUp, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { HealthCard, IOS, Metric } from '@/components/home/HealthCard';
import { StepsIcon } from '@/components/home/Icons';
import { PressableScale } from '@/components/ui';
import {
  type StepsState,
  formatSteps,
  isFixableByAthlete,
  stepsProgress,
  stepsUnavailableCopy,
} from '@/domain/steps';
import { font } from '@/theme/typography';
import { playSparkleSound, successHaptic } from '@/lib/feedback';
import { stepsExtras, stepsPace } from '@/domain/stepsPace';

/* The partner wears the same hue, lighter — one metric, two people. */
const PARTNER = 'rgba(255,107,44,0.45)';

/**
 * Today's steps, in the Health app's grammar: the count large, a capsule to
 * the goal under it, and — when paired — the partner's line beneath.
 *
 * Each missing count says why in its own words, and the permission case
 * offers the fix.
 */
export function StepsCard({
  steps,
  onFixSteps,
  me,
  partner,
  onCheer,
}: {
  steps: StepsState;
  onFixSteps?: () => void;
  me?: { name: string; avatar?: string | null };
  /** Throw a live 🔥 at the partner; false when throttled. */
  onCheer?: () => boolean;
  /** Present when paired; `steps` null until they share a count today. */
  partner?: { name: string; avatar?: string | null; steps: number | null } | null;
}) {
  const [cheers, setCheers] = useState(0);
  const read = steps.status === 'ready' ? stepsProgress(steps.steps, steps.goal) : null;

  /* The pace coach, on a minute clock. */
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const pace = useMemo(() => (read ? stepsPace(read.steps, read.goal, clock) : null), [read, clock]);
  const extras = read ? stepsExtras(read.steps) : null;

  /* Milestones, live: halfway and the goal, each once as it is crossed. */
  const pct = read?.percent ?? 0;
  const lastPct = useRef<number | null>(null);
  const [milestone, setMilestone] = useState<string | null>(null);
  useEffect(() => {
    const before = lastPct.current;
    lastPct.current = pct;
    if (before == null) return;
    const hit = before < 100 && pct >= 100 ? '🏆 Step goal reached!' : before < 50 && pct >= 50 ? '🎯 Halfway there!' : null;
    if (!hit) return;
    successHaptic();
    playSparkleSound();
    setMilestone(hit);
    const t = setTimeout(() => setMilestone(null), 2800);
    return () => clearTimeout(t);
  }, [pct]);
  const canFix = steps.status === 'unavailable' && isFixableByAthlete(steps.reason) && !!onFixSteps;
  const note =
    steps.status === 'unavailable'
      ? stepsUnavailableCopy(steps.reason)
      : steps.status === 'loading'
        ? 'Counting…'
        : '';

  const gap = read && partner?.steps != null ? read.steps - partner.steps : null;
  const status = !read
    ? null
    : gap != null && partner
      ? gap === 0
        ? `Level with ${partner.name}`
        : gap > 0
          ? `${formatSteps(gap)} ahead of ${partner.name}`
          : `${formatSteps(-gap)} behind ${partner.name}`
      : read.met
        ? 'Goal reached'
        : `${formatSteps(read.goal - read.steps)} to go`;

  return (
    <HealthCard icon={<StepsIcon size={16} color={IOS.steps} />} title="Steps" tint={IOS.steps} trailing={read ? `Goal ${formatSteps(read.goal)}` : undefined}>
      {read ? (
        <>
          <View style={styles.metricRow}>
            <Metric value={formatSteps(read.steps)} unit="steps" />
            {status ? (
              <Text style={[styles.status, read.met && !partner && { color: IOS.green }]} numberOfLines={1}>
                {status}
              </Text>
            ) : null}
          </View>
          {extras ? (
            <Text style={styles.extras} numberOfLines={1}>
              ≈ {extras.km} km · {extras.kcal} kcal · {read.percent}%
            </Text>
          ) : null}
          {/* The race: you (and them) on one track to the flag, with where
              the pace line says you should be by now. */}
          <RaceTrack
            goal={read.goal}
            marker={pace && pace.status !== 'done' ? pace.expectedFraction : null}
            me={{ name: me?.name ?? 'You', avatar: me?.avatar ?? null, steps: read.steps }}
            them={partner ? { name: partner.name, avatar: partner.avatar ?? null, steps: partner.steps } : null}
          />
          {pace ? (
            <Text style={[styles.coach, pace.status === 'done' && { color: '#15803D' }]} numberOfLines={1}>
              {pace.line}
            </Text>
          ) : null}
          {milestone ? (
            <Animated.View entering={FadeInDown.springify().damping(12)} exiting={FadeOutUp.duration(250)} style={styles.milestone}>
              <Text style={styles.milestoneText}>{milestone}</Text>
            </Animated.View>
          ) : null}
          {partner ? (
            <>
              {onCheer ? (
                <View style={styles.cheerRow}>
                  <Text style={styles.cheerHint} numberOfLines={1}>
                    {partner.steps == null ? `${partner.name} hasn't shared steps yet` : 'Keep each other moving'}
                  </Text>
                  <PressableScale
                    onPress={() => {
                      if (onCheer()) setCheers((n) => n + 1);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Cheer ${partner.name} on — they see it live`}
                    style={styles.cheer}
                  >
                    <Text style={styles.cheerText}>🔥 Cheer {cheers > 0 ? `×${cheers}` : ''}</Text>
                  </PressableScale>
                </View>
              ) : null}
            </>
          ) : null}
        </>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.note}>{note}</Text>
          {canFix ? (
            <PressableScale
              onPress={onFixSteps}
              accessibilityRole="button"
              accessibilityLabel="Turn on step counting"
              style={styles.fix}
            >
              <Text style={styles.fixText}>Turn On</Text>
            </PressableScale>
          ) : null}
        </View>
      )}
    </HealthCard>
  );
}

/**
 * Two runners on one track, placed by share of the goal, with a flag at the
 * end. Me above the line, them below, so neither hides the other when level.
 */
function RaceTrack({
  goal,
  me,
  them,
  marker,
}: {
  goal: number;
  me: { name: string; avatar: string | null; steps: number };
  them: { name: string; avatar: string | null; steps: number | null } | null;
  /** 0–1: where the pace line says you should be now. */
  marker: number | null;
}) {
  const [width, setWidth] = useState(0);
  const myFrac = Math.min(1, me.steps / Math.max(1, goal));
  const theirFrac = them?.steps == null ? 0 : Math.min(1, them.steps / Math.max(1, goal));
  const travel = width;
  /* Plain bars, one per person, with a legend — avatars riding the track
     and a flag emoji made the card read as a toy. */
  return (
    <View style={styles.race} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.track}>
        <Fill width={width} frac={myFrac} color={IOS.steps} />
        {marker != null && width > 0 && marker > 0.02 && marker < 0.98 ? (
          <View style={[styles.nowTick, { left: marker * travel - 1 }]} pointerEvents="none" />
        ) : null}
      </View>
      {them ? (
        <>
          <View style={[styles.track, styles.trackThem]}>
            <Fill width={width} frac={theirFrac} color={PARTNER} />
          </View>
          <View style={styles.legend}>
            <View style={[styles.legendDot, { backgroundColor: IOS.steps }]} />
            <Text style={styles.legendText} numberOfLines={1}>
              You {formatSteps(me.steps)}
            </Text>
            <View style={[styles.legendDot, { backgroundColor: PARTNER, marginLeft: 12 }]} />
            <Text style={styles.legendText} numberOfLines={1}>
              {them.name} {them.steps == null ? '—' : formatSteps(them.steps)}
            </Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

function Fill({ width, frac, color }: { width: number; frac: number; color: string }) {
  const w = useSharedValue(0);
  const travel = width;
  useEffect(() => {
    w.value = withTiming(Math.max(frac > 0 ? 6 : 0, frac * travel), { duration: 1100, easing: Easing.out(Easing.cubic) });
  }, [frac, travel, w]);
  const style = useAnimatedStyle(() => ({ width: w.value }));
  return <Animated.View style={[styles.fill, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  race: { marginTop: 10, gap: 6 },
  trackThem: { height: 6, borderRadius: 3 },
  legend: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  legendDot: { width: 7, height: 7, borderRadius: 4, marginRight: 5 },
  legendText: { ...font('medium', 11.5, { color: IOS.secondary }), flexShrink: 1, fontVariant: ['tabular-nums'] },
  nowTick: { position: 'absolute', top: 0, width: 2, height: 8, backgroundColor: 'rgba(0,0,0,0.35)' },
  extras: { ...font('semibold', 12, { color: IOS.secondary }), marginTop: -6 },
  coach: { ...font('medium', 12.5, { color: IOS.secondary }), marginTop: 8 },
  milestone: {
    marginTop: 8,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,107,44,0.12)',
    alignItems: 'center',
  },
  milestoneText: font('bold', 13, { color: '#C2410C' }),
  track: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: IOS.fill,
    justifyContent: 'center',
    marginRight: 0,
  },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4 },
  cheerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  cheerHint: { ...font('medium', 12, { color: IOS.secondary }), flex: 1 },
  cheer: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    backgroundColor: IOS.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cheerText: font('semibold', 13, { color: IOS.label }),
  metricRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
    marginBottom: 10,
  },
  status: { ...font('medium', 13, { color: IOS.secondary }), flexShrink: 1 },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  note: { ...font('medium', 14, { color: IOS.secondary }), flex: 1 },
  fix: {
    backgroundColor: 'rgba(255,107,44,0.12)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  fixText: font('bold', 13.5, { color: IOS.steps }),
});

import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  FadeOutUp,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { Face, IOS } from '@/components/home/HealthCard';
import { PressableScale } from '@/components/ui';
import { formatSteps } from '@/domain/steps';
import { stepsDuo } from '@/domain/stepsDuo';
import { lightImpactHaptic, playReceiveSound } from '@/lib/feedback';
import { font } from '@/theme/typography';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const MINE = { from: '#FFB547', to: '#FF6B2C', soft: 'rgba(255,107,44,0.12)', ink: '#C2410C' };
const THEIRS = { from: '#B69CFF', to: '#7C5CFA', soft: 'rgba(124,92,250,0.12)', ink: '#6D28D9' };

const RING = 92;
const STROKE = 9;

/** One person's ring: a gradient arc to their goal, their face in the middle. */
function Ring({
  id,
  pct,
  colors,
  uri,
  name,
  pulse,
}: {
  id: string;
  pct: number | null;
  colors: typeof MINE;
  uri: string | null;
  name: string;
  /** Bumps when this person just moved: the ring breathes out once. */
  pulse: number;
}) {
  const reduced = useReducedMotion();
  const r = (RING - STROKE) / 2;
  const c = 2 * Math.PI * r;
  const progress = useSharedValue(0);
  useEffect(() => {
    const to = Math.max(0, Math.min(1, pct ?? 0));
    progress.value = reduced ? to : withTiming(to, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [pct, reduced, progress]);
  const arc = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - progress.value) }));

  const scale = useSharedValue(1);
  useEffect(() => {
    if (!pulse || reduced) return;
    scale.set(withSequence(withTiming(1.08, { duration: 160 }), withSpring(1, { damping: 7, stiffness: 180 })));
  }, [pulse, reduced, scale]);
  const breathe = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[{ width: RING, height: RING }, breathe]}>
      <Svg width={RING} height={RING} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Defs>
          <LinearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.from} />
            <Stop offset="1" stopColor={colors.to} />
          </LinearGradient>
        </Defs>
        <Circle cx={RING / 2} cy={RING / 2} r={r} stroke={colors.soft} strokeWidth={STROKE} fill="none" />
        {pct != null ? (
          <AnimatedCircle
            cx={RING / 2}
            cy={RING / 2}
            r={r}
            stroke={`url(#${id}-g)`}
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={c}
            animatedProps={arc}
          />
        ) : null}
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Face uri={uri} name={name} color={colors.to} size={RING - STROKE * 2 - 14} />
      </View>
    </Animated.View>
  );
}

/**
 * Steps, together: both people's rings face to face, a team bar the two of
 * you fill as one, a live "+N steps" the moment they move, and a line that
 * says what to do next in minutes of walking.
 */
export function StepsTogether({
  mine,
  myGoal,
  me,
  partner,
  theirGoal,
  onCheer,
}: {
  /** null when this phone has no count. */
  mine: number | null;
  myGoal: number;
  me: { name: string; avatar?: string | null };
  partner: { name: string; avatar?: string | null; steps: number | null };
  theirGoal: number;
  onCheer?: () => boolean;
}) {
  const duo = stepsDuo({ mine: mine ?? 0, theirs: partner.steps, myGoal, theirGoal, name: partner.name });

  /* Their steps, live: a moving count shows "+N" and makes their ring breathe. */
  const lastTheirs = useRef<number | null>(partner.steps);
  const [live, setLive] = useState<{ delta: number; key: number } | null>(null);
  const [theirPulse, setTheirPulse] = useState(0);
  useEffect(() => {
    const before = lastTheirs.current;
    lastTheirs.current = partner.steps;
    if (before == null || partner.steps == null || partner.steps <= before) return;
    const delta = partner.steps - before;
    const t0 = setTimeout(() => {
      setLive({ delta, key: Date.now() });
      setTheirPulse((n) => n + 1);
      lightImpactHaptic();
      playReceiveSound();
    }, 0);
    const t1 = setTimeout(() => setLive(null), 3400);
    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
    };
  }, [partner.steps]);

  const lastMine = useRef<number | null>(mine);
  const [myPulse, setMyPulse] = useState(0);
  useEffect(() => {
    const before = lastMine.current;
    lastMine.current = mine;
    if (before == null || mine == null || mine <= before) return;
    const t = setTimeout(() => setMyPulse((n) => n + 1), 0);
    return () => clearTimeout(t);
  }, [mine]);

  const [cheers, setCheers] = useState(0);
  const myShare = duo.togetherGoal > 0 ? Math.min(1, (mine ?? 0) / duo.togetherGoal) : 0;
  const theirShare = duo.togetherGoal > 0 ? Math.min(1 - myShare, (partner.steps ?? 0) / duo.togetherGoal) : 0;
  const toneColor = duo.tone === 'win' ? '#15803D' : duo.tone === 'push' ? MINE.ink : IOS.secondary;

  return (
    <View>
      <View style={styles.faceOff}>
        <View style={styles.person}>
          <Ring id="steps-me" pct={mine == null ? null : mine / myGoal} colors={MINE} uri={me.avatar ?? null} name={me.name} pulse={myPulse} />
          <Text style={styles.count} numberOfLines={1}>
            {mine == null ? '—' : formatSteps(mine)}
          </Text>
          <Text style={[styles.who, { color: MINE.ink }]} numberOfLines={1}>
            You{mine == null ? '' : ` · ${Math.round((mine / myGoal) * 100)}%`}
          </Text>
        </View>

        <View style={styles.middle}>
          {live ? (
            <Animated.View key={live.key} entering={FadeInDown.springify().damping(12)} exiting={FadeOutUp.duration(250)} style={styles.livePill}>
              <Text style={styles.liveText}>👟 +{formatSteps(live.delta)}</Text>
            </Animated.View>
          ) : (
            <View
              style={[
                styles.badge,
                duo.leader === 'me' && { backgroundColor: MINE.soft },
                duo.leader === 'them' && { backgroundColor: THEIRS.soft },
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  duo.leader === 'me' && { color: MINE.ink },
                  duo.leader === 'them' && { color: THEIRS.ink },
                ]}
              >
                {duo.leader === 'me' ? 'You lead' : duo.leader === 'them' ? `${partner.name} leads` : duo.leader === 'tie' ? 'Tied' : 'VS'}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.person}>
          <Ring
            id="steps-them"
            pct={partner.steps == null ? null : partner.steps / theirGoal}
            colors={THEIRS}
            uri={partner.avatar ?? null}
            name={partner.name}
            pulse={theirPulse}
          />
          <Text style={[styles.count, partner.steps == null && { color: IOS.tertiary }]} numberOfLines={1}>
            {partner.steps == null ? '—' : formatSteps(partner.steps)}
          </Text>
          <Text style={[styles.who, { color: THEIRS.ink }]} numberOfLines={1}>
            {partner.name}
            {partner.steps == null ? '' : ` · ${Math.round((partner.steps / theirGoal) * 100)}%`}
          </Text>
        </View>
      </View>

      {/* The team bar: both of you, one goal. */}
      <View style={styles.teamHead}>
        <Text style={styles.teamLabel}>Together</Text>
        <Text style={styles.teamValue}>
          {formatSteps(duo.together)}
          <Text style={styles.teamGoal}> / {formatSteps(duo.togetherGoal)}</Text>
        </Text>
      </View>
      <View style={styles.teamTrack}>
        <View style={[styles.teamFill, { width: `${myShare * 100}%`, backgroundColor: MINE.to }]} />
        <View style={[styles.teamFill, { width: `${theirShare * 100}%`, backgroundColor: THEIRS.to }]} />
      </View>

      <View style={styles.footer}>
        <Text style={[styles.line, { color: toneColor }]} numberOfLines={2}>
          {live ? `${partner.name} is on the move` : duo.line}
        </Text>
        {onCheer ? (
          <PressableScale
            onPress={() => {
              if (onCheer()) setCheers((n) => n + 1);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Cheer ${partner.name} on — they see it live`}
            style={styles.cheer}
          >
            <Text style={styles.cheerText}>🔥 Cheer{cheers > 0 ? ` ×${cheers}` : ''}</Text>
          </PressableScale>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  faceOff: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 10 },
  person: { width: 112, alignItems: 'center' },
  count: { ...font('extrabold', 20, { color: IOS.label, marginTop: 8 }), letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  who: font('semibold', 11.5, { marginTop: 1 }),
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', height: RING },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: IOS.fill },
  badgeText: font('bold', 11.5, { color: IOS.secondary }),
  livePill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: THEIRS.soft },
  liveText: font('extrabold', 13, { color: THEIRS.ink }),
  teamHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14 },
  teamLabel: font('semibold', 12, { color: IOS.secondary }),
  teamValue: { ...font('bold', 13, { color: IOS.label }), fontVariant: ['tabular-nums'] },
  teamGoal: font('medium', 12, { color: IOS.secondary }),
  teamTrack: { flexDirection: 'row', height: 8, borderRadius: 4, backgroundColor: IOS.fill, overflow: 'hidden', marginTop: 6 },
  teamFill: { height: '100%' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  line: { ...font('medium', 12.5), flex: 1 },
  cheer: { height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: IOS.fill, alignItems: 'center', justifyContent: 'center' },
  cheerText: font('semibold', 13, { color: IOS.label }),
});

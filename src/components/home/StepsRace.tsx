import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { LemonAvatar } from '@/components/home/LemonAvatar';
import { formatSteps } from '@/domain/steps';
import { font } from '@/theme/typography';

const RUNNER = 30;

/**
 * Today's steps as a two-lane race: me against my partner.
 *
 * Each lane is a track toward the goal flag; each runner is its owner's face
 * (the same lemon-slice avatar as the hydration glasses) and springs forward
 * when the count rises — for my own reads and, live over the couple document,
 * for my partner's. A runner that is moving bobs, so the track looks walked.
 *
 * The partner's lane only appears once they have shared a count today; an
 * unknown is never drawn as a runner stood at the start line.
 */
export function StepsRace({
  goal,
  me,
  partner,
}: {
  goal: number;
  me: { name: string; avatar?: string | null; steps: number };
  partner: { name: string; avatar?: string | null; steps: number | null } | null;
}) {
  const leader =
    partner?.steps == null
      ? null
      : me.steps === partner.steps
        ? null
        : me.steps > partner.steps
          ? 'me'
          : 'partner';

  return (
    <View style={{ gap: 12 }}>
      <Lane
        label="You"
        avatar={me.avatar}
        initial={me.name}
        steps={me.steps}
        goal={goal}
        color="#fbbf24"
        leading={leader === 'me'}
      />
      {partner ? (
        partner.steps == null ? (
          /* An empty lane, not a sentence: the race is set, their runner
             just hasn't shown up yet. */
          <View style={styles.ghostLane}>
            <View style={styles.laneHead}>
              <Text style={[styles.laneLabel, styles.ghostText]} numberOfLines={1}>
                {partner.name}
              </Text>
              <Text style={[styles.laneSteps, styles.ghostText]}>waiting…</Text>
            </View>
            <View style={styles.track}>
              <View style={styles.dashes} />
              <Text style={[styles.flag, { opacity: 0.4 }]}>🏁</Text>
            </View>
          </View>
        ) : (
          <Lane
            label={partner.name}
            avatar={partner.avatar}
            initial={partner.name}
            steps={partner.steps}
            goal={goal}
            color="#60a5fa"
            leading={leader === 'partner'}
          />
        )
      ) : null}
    </View>
  );
}

function Lane({
  label,
  avatar,
  initial,
  steps,
  goal,
  color,
  leading,
}: {
  label: string;
  avatar?: string | null;
  initial: string;
  steps: number;
  goal: number;
  color: string;
  leading: boolean;
}) {
  const reduced = useReducedMotion();
  const pct = Math.max(0, Math.min(1, steps / Math.max(1, goal)));
  const width = useSharedValue(0);
  const progress = useSharedValue(0);
  const bob = useSharedValue(0);

  useEffect(() => {
    progress.value = reduced ? pct : withSpring(pct, { damping: 14, stiffness: 60 });
    if (reduced) return;
    // A little hop each time the count moves.
    bob.value = withSequence(
      withRepeat(withTiming(1, { duration: 180, easing: Easing.inOut(Easing.quad) }), 4, true),
      withTiming(0, { duration: 150 }),
    );
  }, [pct, reduced, progress, bob]);

  const fill = useAnimatedStyle(() => ({ width: width.value * progress.value + RUNNER / 2 }));
  const runner = useAnimatedStyle(() => ({
    transform: [
      { translateX: width.value * progress.value },
      { translateY: -bob.value * 4 },
    ],
  }));

  return (
    <View>
      <View style={styles.laneHead}>
        <Text style={styles.laneLabel} numberOfLines={1}>
          {label}
          {leading ? '  👑' : ''}
        </Text>
        <Text style={[styles.laneSteps, { color }]}>{formatSteps(steps)}</Text>
      </View>
      <View
        style={styles.track}
        onLayout={(e) => {
          width.value = Math.max(0, e.nativeEvent.layout.width - RUNNER);
        }}
      >
        <View style={styles.dashes} />
        <Animated.View style={[styles.fill, { backgroundColor: color }, fill]} />
        <Text style={styles.flag}>🏁</Text>
        <Animated.View style={[styles.runner, runner]}>
          <LemonAvatar uri={avatar} initial={(initial.charAt(0) || '?').toUpperCase()} size={RUNNER} />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  laneHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
  laneLabel: { ...font('bold', 12.5, { color: 'rgba(255,255,255,0.75)' }), maxWidth: '60%' },
  laneSteps: { ...font('extrabold', 15), letterSpacing: -0.3 },
  track: {
    height: RUNNER,
    justifyContent: 'center',
  },
  dashes: {
    position: 'absolute',
    left: RUNNER / 2,
    right: 8,
    height: 0,
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.18)',
  },
  fill: { position: 'absolute', left: 0, height: 6, borderRadius: 3, opacity: 0.85 },
  flag: { position: 'absolute', right: -2, fontSize: 16 },
  runner: { position: 'absolute', left: 0 },
  ghostLane: { opacity: 0.55 },
  ghostText: { color: 'rgba(255,255,255,0.5)' },
});

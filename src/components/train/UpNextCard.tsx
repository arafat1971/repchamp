import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';

import { ArrowIcon, FlameIcon, LockIcon } from '@/components/home/Icons';
import { PressableScale } from '@/components/ui';
import { font, scaleForRole } from '@/theme/typography';
import { palette, radius, surfaceShadow } from '@/theme/tokens';

const IC_PUSHUP = require('../../../assets/ic-pushup.png');
const IC_SQUAT = require('../../../assets/ic-squat.png');

/**
 * The one thing to do next, said once and loudly. Train opens on this: it names
 * the movement, says why now (a streak to keep, or one to start), and the
 * button breathes so the eye lands on it. Everything below is browsing; this is
 * the action.
 */
export function UpNextCard({
  exercise,
  streak,
  trainedToday,
  locked,
  onStart,
}: {
  exercise: 'push' | 'squat';
  streak: number;
  trainedToday: boolean;
  locked: boolean;
  onStart: () => void;
}) {
  const name = exercise === 'push' ? 'push-ups' : 'squats';
  const eyebrow = trainedToday ? 'BONUS SET' : 'UP NEXT';
  const title = trainedToday
    ? 'Today is done — go again?'
    : streak > 0
      ? `Keep your ${streak}-day streak alive`
      : 'Start your streak today';
  const body = trainedToday
    ? `Another set of ${name} only adds to your week.`
    : `Do a set of ${name}. Your camera counts every rep.`;

  const pulse = useSharedValue(1);
  useEffect(() => {
    if (locked) return;
    pulse.value = withRepeat(
      withSequence(withTiming(1.035, { duration: 900 }), withTiming(1, { duration: 900 })),
      -1,
    );
  }, [locked, pulse]);
  const button = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  return (
    <View style={styles.card}>
      <View style={styles.glow} pointerEvents="none" />
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <View style={styles.eyebrowRow}>
            {!trainedToday && streak > 0 ? <FlameIcon size={13} color={palette.amber300} /> : null}
            <Text style={styles.eyebrow} {...scaleForRole('control')}>
              {eyebrow}
            </Text>
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
        </View>
        <Image
          source={exercise === 'squat' ? IC_SQUAT : IC_PUSHUP}
          style={styles.art}
          contentFit="contain"
        />
      </View>

      <Animated.View style={button}>
        <PressableScale
          onPress={onStart}
          accessibilityRole="button"
          accessibilityLabel={locked ? 'Free reps used, see Pro' : `Start ${name}`}
          style={styles.cta}
        >
          <Text style={styles.ctaText}>{locked ? 'See Pro' : `Start ${name}`}</Text>
          {locked ? (
            <LockIcon size={16} color={palette.ink} />
          ) : (
            <ArrowIcon size={16} color={palette.ink} strokeWidth={2.6} />
          )}
        </PressableScale>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius['6xl'],
    padding: 18,
    backgroundColor: palette.ink,
    overflow: 'hidden',
    ...surfaceShadow,
  },
  glow: {
    position: 'absolute',
    top: -70,
    right: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(34,197,94,0.14)',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  eyebrow: { ...font('extrabold', 11, { color: palette.green300 }), letterSpacing: 1.2 },
  title: { ...font('extrabold', 21, { color: palette.white }), letterSpacing: -0.5, marginTop: 6 },
  body: { ...font('medium', 13, { color: 'rgba(255,255,255,0.68)' }), marginTop: 4, lineHeight: 18 },
  art: { width: 76, height: 76 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    marginTop: 16,
    borderRadius: radius.pill,
    backgroundColor: palette.green400,
  },
  ctaText: font('extrabold', 16, { color: palette.ink }),
});

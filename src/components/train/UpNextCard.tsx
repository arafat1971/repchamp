import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { WALL_COPY } from '@/domain/hardPaywall';
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
 *
 * Light, like Home's hero: it sat as a black slab right under the green week
 * card, two heavy surfaces in a row saying nearly the same thing. A white card
 * with a green wash keeps the week card as the one dark block on the tab, and
 * the filled green button is still the loudest thing here.
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
      <LinearGradient
        pointerEvents="none"
        colors={[palette.green50, 'rgba(234,250,240,0)']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.2, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <View style={styles.eyebrowRow}>
            {!trainedToday && streak > 0 ? <FlameIcon size={13} color={palette.amber600} /> : null}
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
          accessibilityLabel={locked ? WALL_COPY.a11y : `Start ${name}`}
          style={styles.cta}
        >
          <Text style={styles.ctaText}>{locked ? 'See Pro' : `Start ${name}`}</Text>
          {locked ? (
            <LockIcon size={16} color={palette.white} />
          ) : (
            <ArrowIcon size={16} color={palette.white} strokeWidth={2.6} />
          )}
        </PressableScale>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius['6xl'],
    borderCurve: 'continuous',
    padding: 18,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: 'rgba(15,31,23,0.06)',
    overflow: 'hidden',
    ...surfaceShadow,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  eyebrow: { ...font('extrabold', 11, { color: palette.green600 }), letterSpacing: 1.2 },
  title: { ...font('extrabold', 22, { color: palette.ink }), letterSpacing: -0.5, marginTop: 6 },
  body: { ...font('medium', 13, { color: palette.grey700 }), marginTop: 4, lineHeight: 18 },
  art: { width: 84, height: 84 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    marginTop: 16,
    borderRadius: radius.pill,
    backgroundColor: palette.green600,
  },
  ctaText: font('extrabold', 16, { color: palette.white }),
});

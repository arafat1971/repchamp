import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';

import { SnowflakeIcon } from '@/components/home/Icons';
import { PressableScale } from '@/components/ui';
import { pluralise } from '@/domain/plural';
import { FREEZE_EARN_EVERY } from '@/domain/streakFreeze';
import { successHaptic } from '@/lib/feedback';
import { font } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

/**
 * "Your streak was saved" — shown once, the first time Home opens after a
 * freeze covered a gap.
 *
 * The save happens silently on app open, so without this the athlete would
 * never learn the mechanic exists, or that they now have fewer freezes. Seeing
 * the save is what makes the next 7-day milestone worth chasing.
 */
export function FreezeSavedCard({
  used,
  streak,
  left,
  onDismiss,
}: {
  used: number;
  streak: number;
  left: number;
  onDismiss: () => void;
}) {
  useEffect(() => {
    successHaptic();
  }, []);

  return (
    <Animated.View entering={FadeInDown.duration(320)} exiting={FadeOutUp.duration(200)}>
      <LinearGradient
        colors={['#E0F2FE', '#BFDBFE']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View style={styles.bubble}>
          <SnowflakeIcon size={20} color={palette.white} strokeWidth={2.2} />
        </View>
        <View style={styles.body}>
          <Text style={styles.title}>
            {streak > 0 ? `${streak}-day streak saved` : 'Streak saved'}
          </Text>
          <Text style={styles.line}>
            {`A freeze covered ${pluralise(used, 'missed day')}. `}
            {left > 0
              ? `${pluralise(left, 'freeze')} left.`
              : `Earn another every ${FREEZE_EARN_EVERY} days in a row.`}
          </Text>
        </View>
        <PressableScale
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Got it"
          style={styles.button}
        >
          <Text style={styles.buttonText}>Got it</Text>
        </PressableScale>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius['4xl'],
    borderWidth: 1,
    borderColor: 'rgba(37,99,235,0.14)',
  },
  bubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.blue500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1 },
  title: { ...font('extrabold', 15, { color: palette.blue900 }), letterSpacing: -0.2 },
  line: { ...font('semibold', 12.5, { color: palette.blue800 }), marginTop: 2 },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: palette.white,
  },
  buttonText: font('bold', 13, { color: palette.blue700 }),
});

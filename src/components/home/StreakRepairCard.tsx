import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';

import { FlameIcon } from '@/components/home/Icons';
import { PressableScale } from '@/components/ui';
import { REPAIR_COOLDOWN_DAYS } from '@/domain/streakFreeze';
import { font } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

/**
 * "Your 12-day streak broke" — with a way back.
 *
 * Shown on Home for a few days after a break the freeze bank could not cover.
 * This is the moment an athlete is most likely to give up on the app, so it is
 * also where Pro's repair is worth the most: a Pro athlete restores the
 * streak in one tap; a free one sees what Pro would do.
 */
export function StreakRepairCard({
  lostStreak,
  isPro,
  onRepair,
  onDismiss,
}: {
  lostStreak: number;
  isPro: boolean;
  /** Pro: repairs. Free: opens the paywall. */
  onRepair: () => void;
  onDismiss: () => void;
}) {
  return (
    <Animated.View entering={FadeInDown.duration(320)} exiting={FadeOutUp.duration(200)}>
      <View style={styles.card}>
        <View style={styles.bubble}>
          <FlameIcon size={20} color={palette.amber300} />
          <View style={styles.crack} />
        </View>
        <View style={styles.body}>
          <Text style={styles.title}>{`Your ${lostStreak}-day streak broke`}</Text>
          <Text style={styles.line}>
            {isPro
              ? `Repair it now and keep going. One repair every ${REPAIR_COOLDOWN_DAYS} days.`
              : 'Pro can repair it, so the days you put in still count.'}
          </Text>
          <View style={styles.actions}>
            <PressableScale
              onPress={onRepair}
              accessibilityRole="button"
              accessibilityLabel={isPro ? 'Repair streak' : 'Repair with Pro'}
              style={styles.cta}
            >
              <Text style={styles.ctaText}>{isPro ? 'Repair streak' : 'Repair with Pro'}</Text>
            </PressableScale>
            <PressableScale
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel="Not now"
              style={styles.later}
            >
              <Text style={styles.laterText}>Not now</Text>
            </PressableScale>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: radius['4xl'],
    backgroundColor: palette.ink,
  },
  bubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(252,211,77,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // A thin diagonal slash across the flame: broken, not gone.
  crack: {
    position: 'absolute',
    width: 26,
    height: 2,
    borderRadius: 1,
    backgroundColor: palette.ink,
    transform: [{ rotate: '-45deg' }],
  },
  body: { flex: 1 },
  title: { ...font('extrabold', 15, { color: palette.white }), letterSpacing: -0.2 },
  line: { ...font('semibold', 12.5, { color: 'rgba(255,255,255,0.72)' }), marginTop: 2, lineHeight: 17 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10 },
  cta: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: palette.amber300,
  },
  ctaText: font('extrabold', 13, { color: palette.ink }),
  later: { paddingVertical: 8 },
  laterText: font('bold', 13, { color: 'rgba(255,255,255,0.6)' }),
});

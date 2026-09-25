import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';

import { HabitIcon } from '@/components/together/HabitIcon';
import { Card, PressableScale } from '@/components/ui';
import type { Habit } from '@/domain/ritual';
import { font } from '@/theme/typography';
import { palette } from '@/theme/tokens';

/**
 * Good morning: how yesterday went together, today's three chosen habits, and
 * the first glass of water one tap away. Shown once a morning; × puts it away
 * until tomorrow.
 */
export function MorningCard({
  name,
  yesterday,
  total,
  picks,
  onWater,
  onOpen,
  onDismiss,
}: {
  name: string;
  yesterday: { me: number; them: number; perfect: boolean } | null;
  total: number;
  /** Today's three hand-ticked habits. */
  picks: readonly Habit[];
  onWater: () => void;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  return (
    <Animated.View entering={FadeInDown.duration(320)} exiting={FadeOutUp.duration(200)}>
      <Card style={styles.card}>
        <View style={styles.head}>
          <Text style={styles.title}>Good morning</Text>
          <PressableScale onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Hide until tomorrow" style={styles.close}>
            <Text style={styles.closeText}>×</Text>
          </PressableScale>
        </View>
        <Text style={styles.line}>
          {yesterday
            ? yesterday.perfect
              ? `Yesterday was a perfect day with ${name}.`
              : `Yesterday: you ${yesterday.me} of ${total}, ${name} ${yesterday.them} of ${total}.`
            : `A new day with ${name}.`}
        </Text>

        <View style={styles.picks}>
          {picks.map((h) => (
            <View key={h.id} style={styles.pick}>
              <View style={styles.icon}>
                <HabitIcon id={h.id} size={18} color={palette.ink} />
              </View>
              <Text style={styles.pickText} numberOfLines={1}>
                {h.label}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          <PressableScale onPress={onWater} accessibilityRole="button" accessibilityLabel="Log a 250 ml glass" style={[styles.btn, styles.btnPrimary]}>
            <HabitIcon id="plus" size={16} color={palette.white} />
            <Text style={[styles.btnText, styles.btnTextPrimary]}>250 ml</Text>
          </PressableScale>
          <PressableScale onPress={onOpen} accessibilityRole="button" style={styles.btn}>
            <Text style={styles.btnText}>Open today</Text>
          </PressableScale>
        </View>
      </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 18 },
  head: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1, ...font('extrabold', 20, { color: palette.ink }) },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.track },
  closeText: font('semibold', 18, { color: palette.slate500 }),
  line: { marginTop: 4, ...font('regular', 14, { color: palette.slate500 }) },
  picks: { flexDirection: 'row', gap: 8, marginTop: 14 },
  pick: { flex: 1, alignItems: 'center', gap: 6 },
  icon: { width: 40, height: 40, borderRadius: 13, backgroundColor: palette.track, alignItems: 'center', justifyContent: 'center' },
  pickText: font('medium', 12, { color: palette.ink }),
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.divider,
  },
  btnPrimary: { backgroundColor: palette.ink, borderColor: palette.ink },
  btnText: font('semibold', 14, { color: palette.ink }),
  btnTextPrimary: { color: palette.white },
});

import { StyleSheet, Text, View } from 'react-native';

import { LockIcon, SnowflakeIcon } from '@/components/home/Icons';
import { PressableScale } from '@/components/ui';
import { MAX_STREAK_FREEZES_PRO, freezeCap, freezePanelCopy } from '@/domain/streakFreeze';
import { font } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

/**
 * The freeze bank, explained where the streak tile leads.
 *
 * The Home chip says "❄ 1" and nothing else, so without this a freeze is a
 * mystery until one is spent. The slots show the bank at a glance; a free
 * athlete sees the Pro slot locked beside theirs, which is the whole upsell.
 */
export function StreakFreezeCard({
  banked,
  streak,
  isPro,
  onUpgrade,
}: {
  banked: number;
  streak: number;
  isPro: boolean;
  onUpgrade: () => void;
}) {
  const cap = freezeCap(isPro);
  const copy = freezePanelCopy({ banked, streak, isPro });
  const slots = Array.from({ length: MAX_STREAK_FREEZES_PRO }, (_, i) =>
    i < banked ? 'full' : i < cap ? 'empty' : 'locked',
  );

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.eyebrow}>STREAK FREEZES</Text>
        <View style={styles.slots}>
          {slots.map((slot, i) => (
            <View
              key={i}
              style={[styles.slot, slot === 'full' && styles.slotFull, slot === 'locked' && styles.slotLocked]}
            >
              {slot === 'locked' ? (
                <LockIcon size={13} color={palette.grey600} />
              ) : (
                <SnowflakeIcon
                  size={15}
                  color={slot === 'full' ? palette.white : palette.blue300}
                  strokeWidth={2.2}
                />
              )}
            </View>
          ))}
        </View>
      </View>
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.body}>{copy.body}</Text>
      {isPro ? null : (
        <PressableScale
          onPress={onUpgrade}
          accessibilityRole="button"
          accessibilityLabel={`Pro banks up to ${MAX_STREAK_FREEZES_PRO} freezes`}
          style={styles.upsell}
        >
          <Text style={styles.upsellText}>{`Pro banks up to ${MAX_STREAK_FREEZES_PRO} →`}</Text>
        </PressableScale>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.blue50,
    borderRadius: radius['4xl'],
    borderWidth: 1,
    borderColor: 'rgba(37,99,235,0.12)',
    padding: 16,
    marginBottom: 16,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { ...font('extrabold', 10, { color: palette.blue700 }), letterSpacing: 1.5 },
  slots: { flexDirection: 'row', gap: 6 },
  slot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: palette.blue300,
    borderStyle: 'dashed',
  },
  slotFull: { backgroundColor: palette.blue500, borderColor: palette.blue500, borderStyle: 'solid' },
  slotLocked: { borderColor: palette.divider, backgroundColor: palette.white, borderStyle: 'solid' },
  title: { ...font('extrabold', 17, { color: palette.blue900 }), marginTop: 10, letterSpacing: -0.2 },
  body: { ...font('semibold', 13, { color: palette.blue800 }), marginTop: 4, lineHeight: 18 },
  upsell: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: palette.white,
  },
  upsellText: font('bold', 13, { color: palette.blue600 }),
});

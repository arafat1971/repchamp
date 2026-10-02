import { StyleSheet, Text, View } from 'react-native';

import { HeartIcon } from '@/components/home/Icons';
import { PressableScale } from '@/components/ui';
import { HomeCard } from '@/components/ui/HomeCard';
import { font } from '@/theme/typography';
import { palette } from '@/theme/tokens';

/**
 * A standing invitation for an athlete training alone. It states what pairing
 * gives you and offers one action; "Not now" hides it for a week
 * (`showInvitePartnerCard`). No preview of a fake partner and nothing is sent —
 * the action only opens the invite screen.
 */
export function InvitePartnerCard({
  onInvite,
  onDismiss,
}: {
  onInvite: () => void;
  onDismiss: () => void;
}) {
  return (
    <HomeCard style={styles.card}>
      <View style={styles.top}>
        <View style={styles.badge}>
          <HeartIcon size={20} color={palette.green700} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Train with someone</Text>
          <Text style={styles.body}>
            Pair up for a shared streak, a water jar you both fill and head-to-head sets. It takes
            one scan.
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        <PressableScale
          onPress={onInvite}
          accessibilityRole="button"
          accessibilityLabel="Invite a partner"
          style={styles.primary}
        >
          <Text style={font('extrabold', 14, { color: palette.white })}>Invite a partner</Text>
        </PressableScale>
        <PressableScale
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Not now — hide this for a week"
          style={styles.secondary}
        >
          <Text style={font('bold', 13, { color: palette.grey600 })}>Not now</Text>
        </PressableScale>
      </View>
    </HomeCard>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16 },
  top: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.green50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...font('extrabold', 16, { color: palette.ink }), letterSpacing: -0.3 },
  body: { ...font('medium', 13, { color: palette.grey600 }), marginTop: 3, lineHeight: 19 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  primary: {
    backgroundColor: palette.green600,
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 18,
    minHeight: 44,
    justifyContent: 'center',
  },
  secondary: { paddingVertical: 11, paddingHorizontal: 12, minHeight: 44, justifyContent: 'center' },
});

import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { DropIcon, DuelIcon, FlameIcon } from '@/components/home/Icons';
import { PressableScale } from '@/components/ui';
import { font } from '@/theme/typography';
import { gradients, palette } from '@/theme/tokens';

/* Drawn icons, not emoji: the OS picks an emoji's artwork, so the same chip
   looked different on every phone and never matched the rest of Home. */
const BENEFITS = [
  { label: 'Shared streak', Icon: FlameIcon },
  { label: 'One water jar', Icon: DropIcon },
  { label: 'Live duels', Icon: DuelIcon },
] as const;

/**
 * A standing invitation for an athlete training alone: my seat beside an empty
 * one, three things pairing gives you, and one action. "Not now" hides it for a
 * week (`showInvitePartnerCard`). Nothing is sent and no partner is previewed —
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
    <LinearGradient colors={gradients.heroEmerald} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
      <View style={styles.glow} pointerEvents="none" />
      <View style={styles.top}>
        <View style={styles.seats}>
          <View style={styles.seat}>
            <Text style={styles.seatGlyph}>🐼</Text>
          </View>
          <View style={[styles.seat, styles.seatGhost]}>
            <Text style={[styles.seatGlyph, { opacity: 0.35 }]}>🐼</Text>
          </View>
          <View style={styles.plus}>
            <Text style={styles.plusGlyph}>+</Text>
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Train with someone</Text>
          <Text style={styles.body}>A streak, a jar and live races, for two.</Text>
        </View>
      </View>
      <View style={styles.chips}>
        {BENEFITS.map(({ label, Icon }) => (
          <View key={label} style={styles.chip}>
            <Icon size={13} color="rgba(255,255,255,0.92)" />
            <Text style={styles.chipText} numberOfLines={1}>
              {label}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.actions}>
        <PressableScale
          onPress={onInvite}
          accessibilityRole="button"
          accessibilityLabel="Invite a partner"
          style={styles.primary}
        >
          <Text style={font('extrabold', 15, { color: palette.green700 })}>Invite a partner</Text>
        </PressableScale>
        <PressableScale
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Not now — hide this for a week"
          style={styles.secondary}
        >
          <Text style={font('bold', 13, { color: 'rgba(255,255,255,0.75)' })}>Not now</Text>
        </PressableScale>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 28, padding: 18, overflow: 'hidden' },
  glow: {
    position: 'absolute',
    top: -70,
    right: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(134,239,172,0.16)',
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  seats: { flexDirection: 'row', alignItems: 'center', width: 84 },
  seat: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: palette.white,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatGhost: {
    marginLeft: -14,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.55)',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  seatGlyph: { fontSize: 24 },
  plus: {
    position: 'absolute',
    right: 0,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: palette.green400,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusGlyph: { ...font('extrabold', 16, { color: palette.green900 }), lineHeight: 18 },
  title: { ...font('extrabold', 19, { color: palette.white }), letterSpacing: -0.4 },
  body: { ...font('medium', 13.5, { color: 'rgba(255,255,255,0.8)' }), marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.22)' },
  chipText: font('semibold', 12, { color: 'rgba(255,255,255,0.92)' }),
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  primary: {
    flex: 1,
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondary: { paddingVertical: 11, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center' },
});

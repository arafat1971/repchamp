import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInUp, ZoomIn } from 'react-native-reanimated';

import { lightImpactHaptic } from '@/lib/feedback';
import { nudgePartner } from '@/services/coupleService';
import { markReaction } from '@/services/hydrationSync';
import { useProfileStore } from '@/state/profileStore';
import { useCouple } from '@/state/useCouple';
import { font } from '@/theme/typography';

/**
 * A reaction sent from the widget — tapping the partner's bear opens this.
 *
 * Lighter than a splash: pick one emoji and it pops up over their bear on
 * their widget, with a notification that reads as itself ("Bea sent you
 * ❤️"). It rides on a water nudge, so it spends the same hourly allowance
 * and older apps still get word of it.
 */

export const REACTIONS = ['❤️', '👏', '😂', '🔥', '💪'] as const;

type State = { kind: 'pick' } | { kind: 'sent'; emoji: string } | { kind: 'wait' } | { kind: 'alone' };

export default function ReactScreen() {
  const router = useRouter();
  const couple = useCouple();
  const profile = useProfileStore();
  const [state, setState] = useState<State>({ kind: 'pick' });
  const name = couple.partner?.displayName?.trim() || 'your partner';

  const send = async (emoji: string) => {
    const coupleId = couple.couple?.id ?? null;
    const uid = couple.me?.uid ?? null;
    if (!couple.paired || !coupleId || !uid) {
      setState({ kind: 'alone' });
    } else {
      try {
        lightImpactHaptic();
        await nudgePartner(coupleId, uid, profile.displayName || profile.username || 'Your partner', 'water', { emoji });
        markReaction(coupleId, uid, emoji);
        setState({ kind: 'sent', emoji });
      } catch {
        setState({ kind: 'wait' });
      }
    }
    setTimeout(() => (router.canGoBack() ? router.back() : router.replace('/(tabs)')), 1500);
  };

  return (
    <LinearGradient colors={['#F472B6', '#A855F7', '#6366F1']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.screen}>
      {state.kind === 'pick' ? (
        <Animated.View entering={FadeIn.duration(200)} style={styles.center}>
          <Text style={styles.big}>React to {name}</Text>
          <Text style={styles.sub}>It pops up over your bear on their widget.</Text>
          <View style={styles.row}>
            {REACTIONS.map((emoji, i) => (
              <Animated.View key={emoji} entering={ZoomIn.delay(i * 60).springify().damping(11)}>
                <Pressable
                  onPress={() => void send(emoji)}
                  accessibilityRole="button"
                  accessibilityLabel={`Send ${emoji}`}
                  style={({ pressed }) => [styles.bubble, pressed && { transform: [{ scale: 0.9 }] }]}
                >
                  <Text style={styles.emoji}>{emoji}</Text>
                </Pressable>
              </Animated.View>
            ))}
          </View>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} accessibilityRole="button" style={styles.cancel}>
            <Text style={styles.cancelText}>Not now</Text>
          </Pressable>
        </Animated.View>
      ) : (
        <Animated.View entering={FadeInUp.duration(260)} style={styles.center}>
          <Animated.Text entering={ZoomIn.springify().damping(9)} style={styles.huge}>
            {state.kind === 'sent' ? state.emoji : state.kind === 'wait' ? '⏳' : '🐻'}
          </Animated.Text>
          <Text style={styles.big}>
            {state.kind === 'sent' ? `Sent to ${name}!` : state.kind === 'wait' ? 'Easy there 💧' : 'Pair up to react'}
          </Text>
          <Text style={styles.sub}>
            {state.kind === 'sent'
              ? 'It’s popping up over your bear on their widget.'
              : state.kind === 'wait'
                ? `You’ve pinged ${name} a lot this hour — give them a moment.`
                : 'Reactions go to your partner’s widget.'}
          </Text>
        </Animated.View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  center: { alignItems: 'center', gap: 10 },
  big: { ...font('extrabold', 28, { color: '#FFFFFF' }), textAlign: 'center' },
  sub: { ...font('semibold', 14.5, { color: '#FCE7F3' }), textAlign: 'center' },
  row: { flexDirection: 'row', gap: 12, marginTop: 22 },
  bubble: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 30 },
  huge: { fontSize: 88 },
  cancel: { marginTop: 24, padding: 10 },
  cancelText: font('bold', 14, { color: '#FFFFFF' }),
});

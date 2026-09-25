import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { FadeInUp, ZoomIn } from 'react-native-reanimated';

import { lightImpactHaptic } from '@/lib/feedback';
import { markSplash } from '@/services/hydrationSync';
import { nudgePartner } from '@/services/coupleService';
import { useProfileStore } from '@/state/profileStore';
import { useCouple } from '@/state/useCouple';
import { font } from '@/theme/typography';

/**
 * A splash sent from the home-screen widget's "💦" button.
 *
 * A splash is a water nudge — the partner gets "… says: drink some water 💧",
 * and their widget floats hearts over their bear for a while. It spends the
 * same hourly allowance as every other reminder, so it can be fun without
 * ever becoming a flood; when the allowance is spent this screen says so
 * kindly rather than failing silently.
 */

/** The last splash, so a link delivered twice sends once. */
let lastSplashSentAt = 0;

type Outcome = { kind: 'sent'; name: string } | { kind: 'wait'; name: string } | { kind: 'alone' };

export default function SplashScreen() {
  const router = useRouter();
  const couple = useCouple();
  const profile = useProfileStore();
  const handled = useRef(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    if (handled.current || couple.loading) return;
    handled.current = true;

    const coupleId = couple.couple?.id ?? null;
    const uid = couple.me?.uid ?? null;
    const name = couple.partner?.displayName?.trim() || 'your partner';
    const back = () => setTimeout(() => (router.canGoBack() ? router.back() : router.replace('/(tabs)')), 1700);

    void (async () => {
      let next: Outcome;
      if (!couple.paired || !coupleId || !uid) {
        next = { kind: 'alone' };
      } else if (Date.now() - lastSplashSentAt < 4000) {
        next = { kind: 'sent', name };
      } else {
        try {
          await nudgePartner(coupleId, uid, profile.displayName || profile.username || 'Your partner', 'water');
          lastSplashSentAt = Date.now();
          markSplash(coupleId, uid);
          lightImpactHaptic();
          next = { kind: 'sent', name };
        } catch {
          next = { kind: 'wait', name };
        }
      }
      setOutcome(next);
      back();
    })();
  }, [couple.loading, couple.paired, couple.couple?.id, couple.me?.uid, couple.partner?.displayName, profile.displayName, profile.username, router]);

  return (
    <LinearGradient colors={['#0EA5E9', '#6366F1', '#DB2777']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.screen}>
      {outcome ? (
        <>
          <Animated.Text entering={ZoomIn.springify().damping(10)} style={styles.emoji}>
            {outcome.kind === 'sent' ? '💦' : outcome.kind === 'wait' ? '⏳' : '🐻'}
          </Animated.Text>
          <Animated.View entering={FadeInUp.delay(140)}>
            <Text style={styles.big}>
              {outcome.kind === 'sent'
                ? `Splashed ${outcome.name}!`
                : outcome.kind === 'wait'
                  ? 'Easy there 💧'
                  : 'Pair up to splash'}
            </Text>
          </Animated.View>
          <Animated.View entering={FadeInUp.delay(240)}>
            <Text style={styles.sub}>
              {outcome.kind === 'sent'
                ? 'Hearts are floating over their bear.'
                : outcome.kind === 'wait'
                  ? `You’ve splashed ${outcome.name} a lot this hour — give them a moment.`
                  : 'Splashes go to your partner’s bear.'}
            </Text>
          </Animated.View>
        </>
      ) : null}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  emoji: { fontSize: 84 },
  big: { ...font('extrabold', 30, { color: '#FFFFFF' }), textAlign: 'center' },
  sub: { ...font('semibold', 15, { color: '#E0E7FF' }), textAlign: 'center' },
});

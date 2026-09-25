import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeInUp, ZoomIn, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { BearJar, type BearTheme } from '@/components/home/BearJar';
import { dayKey } from '@/domain/progression';
import { formatMl, sanitizeDrinkMl } from '@/domain/hydration';
import { track } from '@/lib/analytics';
import { lightImpactHaptic } from '@/lib/feedback';
import { shareDrink, syncHydrationNow } from '@/services/hydrationSync';
import { selectTodayMl, useHydrationStore } from '@/state/hydrationStore';
import { useProfileStore } from '@/state/profileStore';
import { useCouple } from '@/state/useCouple';
import { font } from '@/theme/typography';

/**
 * A drink logged from the home-screen widget's "💧 +250" button.
 *
 * The widget cannot run the app's code, so the button opens this route:
 * it logs the drink exactly as Home's Pour button does — sync, then the
 * partner's notice — shows the bear filling for a moment, and hands over to
 * Home. The whole round trip is a second and a half.
 */

const MY_BEAR: BearTheme = { body: '#ffe4ec', rim: '#f9a8c9', tint: '#fb7185' };

/**
 * The last widget drink, so a link delivered twice (a cold start replaying
 * its launch intent) logs once. Module-level: it only has to outlive a
 * remount, not a restart.
 */
let lastQuickDrinkAt = 0;

export default function QuickDrinkScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ ml?: string }>();
  const couple = useCouple();
  const profile = useProfileStore();
  const handled = useRef(false);
  const [logged, setLogged] = useState<{ ml: number; total: number; goal: number } | null>(null);

  const tilt = useSharedValue(0);
  const phase = useSharedValue(0);
  useEffect(() => {
    phase.set(withRepeat(withTiming(2 * Math.PI, { duration: 2400, easing: Easing.linear }), -1));
  }, [phase]);

  useEffect(() => {
    if (handled.current || couple.loading) return;
    handled.current = true;

    const ml = sanitizeDrinkMl(Number(params.ml ?? 250) || 250);
    const store = useHydrationStore.getState();
    const today = dayKey();
    const before = selectTodayMl(store, today);

    const fresh = Date.now() - lastQuickDrinkAt > 4000;
    if (fresh) {
      const entry = store.logDrink(ml);
      if (entry) {
        lastQuickDrinkAt = Date.now();
        lightImpactHaptic();
        track('water_logged', { ml: entry.ml, source: 'widget' });
        const coupleId = couple.couple?.id ?? null;
        const uid = couple.me?.uid ?? null;
        void syncHydrationNow(coupleId, uid).then(() =>
          shareDrink({
            coupleId,
            uid,
            senderName: profile.displayName || profile.username || 'Your partner',
            ml: entry.ml,
            beforeMl: before,
            goalMl: useHydrationStore.getState().goalMl,
          }),
        );
      }
    }
    const after = useHydrationStore.getState();
    setLogged({ ml, total: selectTodayMl(after, today), goal: after.goalMl });

    const t = setTimeout(() => router.replace('/(tabs)'), 1500);
    return () => clearTimeout(t);
  }, [couple.loading, couple.couple?.id, couple.me?.uid, params.ml, profile.displayName, profile.username, router]);

  const pct = logged ? Math.min(100, (logged.total / logged.goal) * 100) : 0;

  return (
    <LinearGradient colors={['#4C1D95', '#7E22CE', '#BE185D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.screen}>
      {logged ? (
        <>
          <Animated.View entering={ZoomIn.springify().damping(12)}>
            <BearJar id="quick-drink" percent={pct} width={150} theme={MY_BEAR} tilt={tilt} phase={phase} pourKey={1} met={pct >= 100} />
          </Animated.View>
          <Animated.Text entering={FadeInUp.delay(150)} style={styles.big}>
            +{formatMl(logged.ml)} 💧
          </Animated.Text>
          <Animated.View entering={FadeInUp.delay(260)}>
            <Text style={styles.sub}>
              {formatMl(logged.total)} of {formatMl(logged.goal)} today
            </Text>
          </Animated.View>
        </>
      ) : (
        <View />
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  big: font('extrabold', 34, { color: '#FFFFFF' }),
  sub: font('semibold', 15, { color: '#F5D0FE' }),
});

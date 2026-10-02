import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';

import { isWalled } from '@/domain/hardPaywall';
import { isPurchasesConfigured } from '@/services/purchases';
import { selectTotalReps, useProfileStore } from '@/state/profileStore';
import { useEffectivePro } from '@/state/proStore';

/**
 * Where the Reps widget's tap lands (`repchamp://reps`): straight into a
 * push-up session — through the same free-rep allowance as Home's quick start, so the
 * widget is never a way around the paywall.
 */
export default function StartReps() {
  const router = useRouter();
  const profile = useProfileStore();
  const isPro = useEffectivePro();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const walled = isWalled({ isPro, repsSoFar: selectTotalReps(profile), billingReady: isPurchasesConfigured() });
    if (walled) {
      router.replace({ pathname: '/modal/paywall', params: { source: 'rep-limit', hard: '1' } });
    } else {
      router.replace({ pathname: '/session', params: { exercise: 'push', mode: 'practice' } });
    }
  }, [isPro, profile, router]);

  return <View style={{ flex: 1 }} />;
}

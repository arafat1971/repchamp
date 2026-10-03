import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { PromoCard } from '@/components/PromoCard';
import { winBack, type WinBackDecision } from '@/domain/proWinBack';
import { track } from '@/lib/analytics';
import { captureError } from '@/lib/crash';
import { fetchLapsedSubscription, isPurchasesConfigured } from '@/services/purchases';
import { useAuthStore } from '@/state/authStore';
import { useEffectivePro } from '@/state/proStore';
import { useProfileStore } from '@/state/profileStore';
import { useWinBackStore } from '@/state/winBackStore';

/**
 * The lapsed-Pro card. Renders nothing unless `domain/proWinBack` says this
 * athlete has something true to be told.
 */
export function WinBackCard() {
  const router = useRouter();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const isPro = useEffectivePro();
  const [decision, setDecision] = useState<WinBackDecision | null>(null);
  const shown = useRef(false);

  useEffect(() => {
    if (isPro || !isPurchasesConfigured()) return;
    let cancelled = false;
    void (async () => {
      try {
        const lapsed = await fetchLapsedSubscription(uid);
        if (cancelled || !lapsed) return;
        const next = winBack({
          lapsed,
          sessions: useProfileStore.getState().sessions,
          history: useWinBackStore.getState().history,
          now: Date.now(),
        });
        if (next) setDecision(next);
      } catch (error) {
        captureError(error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, isPro]);

  useEffect(() => {
    if (!decision || shown.current) return;
    shown.current = true;
    useWinBackStore.getState().recordShown();
    track('win_back_shown', { kind: decision.kind });
  }, [decision]);

  if (!decision || isPro) return null;

  return (
    <PromoCard
      headline={decision.headline}
      body={decision.body}
      cta={decision.cta}
      onAccept={() => {
        useWinBackStore.getState().recordOutcome('tapped');
        track('win_back_tapped', { kind: decision.kind });
        router.push({ pathname: '/modal/paywall', params: { source: 'win-back' } });
      }}
      onDismiss={() => {
        useWinBackStore.getState().recordOutcome('dismissed');
        track('win_back_dismissed', { kind: decision.kind });
        setDecision(null);
      }}
    />
  );
}

import { useEffect, useRef, useState } from 'react';
import type { PurchasesPackage } from 'react-native-purchases';

import { PromoCard } from '@/components/PromoCard';
import {
  annualUpgradeOffer,
  packageTypeForProduct,
  type AnnualUpgradeOffer,
} from '@/domain/annualUpgrade';
import { dayKey } from '@/domain/progression';
import { toPlanPrice } from '@/domain/subscriptionOffering';
import { track } from '@/lib/analytics';
import { captureError } from '@/lib/crash';
import {
  fetchActiveSubscription,
  fetchOffering,
  isPurchasesConfigured,
  switchPlan,
  type ActiveSubscriptionInfo,
} from '@/services/purchases';
import { useAnnualOfferStore } from '@/state/annualOfferStore';
import { useAuthStore } from '@/state/authStore';
import { useProStore } from '@/state/proStore';
import { useProfileStore } from '@/state/profileStore';
import { showDialog } from '@/state/useDialog';

interface Ready {
  offer: AnnualUpgradeOffer;
  annual: PurchasesPackage;
  active: ActiveSubscriptionInfo;
}

const DAY_MS = 86_400_000;

/**
 * The monthly → annual switch card. Renders nothing unless the policy in
 * `domain/annualUpgrade` says this athlete should see it.
 */
export function AnnualUpgradeCard() {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const sessions = useProfileStore((s) => s.sessions);
  const [ready, setReady] = useState<Ready | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = useRef(false);

  useEffect(() => {
    if (!isPurchasesConfigured()) return;
    let cancelled = false;
    void (async () => {
      try {
        const [active, offering] = await Promise.all([
          fetchActiveSubscription(uid),
          fetchOffering(uid),
        ]);
        if (cancelled || !active || !offering) return;

        const packages = offering.availablePackages;
        const monthly = packages.find((p) => p.packageType === 'MONTHLY');
        const annual = packages.find((p) => p.packageType === 'ANNUAL');
        const packageType = packageTypeForProduct(
          active.productId,
          packages.map((p) => ({ productId: p.product.identifier, packageType: p.packageType })),
        );
        if (!monthly || !annual || !packageType) return;

        const cutoff = dayKey(new Date(Date.now() - 30 * DAY_MS));
        const offer = annualUpgradeOffer({
          active: {
            packageType,
            periodType: active.periodType,
            willRenew: active.willRenew,
            latestPurchaseAt: active.latestPurchaseAt,
            originalPurchaseAt: active.originalPurchaseAt,
          },
          monthly: toPlanPrice(monthly),
          annual: toPlanPrice(annual),
          sessionsLast30Days: sessions.filter((s) => s.day >= cutoff).length,
          history: useAnnualOfferStore.getState().history,
          now: Date.now(),
        });
        if (offer) setReady({ offer, annual, active });
      } catch (error) {
        captureError(error);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Sessions change on every set; the decision is made once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  useEffect(() => {
    if (!ready || shown.current) return;
    shown.current = true;
    useAnnualOfferStore.getState().recordShown();
    track('annual_offer_shown');
  }, [ready]);

  if (!ready) return null;

  const dismiss = () => {
    useAnnualOfferStore.getState().recordOutcome('dismissed');
    track('annual_offer_dismissed');
    setReady(null);
  };

  const accept = async () => {
    useAnnualOfferStore.getState().recordOutcome('tapped');
    track('annual_offer_tapped');
    setBusy(true);
    const result = await switchPlan(ready.annual, ready.active.productId, uid);
    setBusy(false);
    if (result.cancelled) return;
    if (result.ok) {
      track('annual_switched');
      await useProStore.getState().refresh();
      setReady(null);
      showDialog({
        title: 'You’re on annual',
        message: 'The unused part of this month is credited against it.',
        tone: 'success',
        actions: [{ label: 'Done', variant: 'primary' }],
      });
      return;
    }
    showDialog({
      title: 'Couldn’t switch plans',
      message: result.message ?? 'Nothing was changed. Your current plan is untouched.',
      tone: 'danger',
      actions: [{ label: 'OK', variant: 'primary' }],
    });
  };

  return (
    <PromoCard
      headline={ready.offer.headline}
      body={ready.offer.body}
      cta={ready.offer.cta}
      busy={busy}
      onAccept={accept}
      onDismiss={dismiss}
      style={{ marginTop: 12 }}
    />
  );
}

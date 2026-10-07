import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import type { PurchasesPackage } from 'react-native-purchases';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { track, truncateReason } from '@/lib/analytics';
import { captureError } from '@/lib/crash';
import { PRIVACY_URL, TERMS_URL } from '@/lib/urls';
import { PressableScale, PrimaryButton, Screen } from '@/components/ui';
import {
  hasFreeTrial,
  planTitle,
  renewDisclosure,
  subscribeCtaLabel,
  trialLengthDays,
  trialPeriodLabel,
  trialRibbon,
} from '@/domain/subscriptionCopy';
import {
  fetchOffering,
  isPurchasesConfigured,
  purchase,
  restore,
  sortPackagesForPaywall,
} from '@/services/purchases';
import { useAuthStore } from '@/state/authStore';
import { useProStore } from '@/state/proStore';
import { showDialog } from '@/state/useDialog';
import { headlineProof } from '@/domain/progressProof';
import { blockedBenefit, orderBenefits, type BenefitId } from '@/domain/paywallBenefits';
import { toPlanPrice } from '@/domain/subscriptionOffering';
import { selectStreak, selectTotalReps, useProfileStore } from '@/state/profileStore';
import { FREE_REP_LIMIT } from '@/domain/hardPaywall';
import { CheckIcon } from '@/components/home/Icons';
import {
  commitmentLine,
  granularPrice,
  monthlyEquivalent,
  savingsPercent,
} from '@/domain/paywallFraming';
import { paywallLead, priceInsight, trialTimeline } from '@/domain/paywallInsight';
import { font, text } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

/**
 * Compact value props — not card chrome. Push-ups & squats stay free.
 *
 * Keyed by id so `orderBenefits` can lead with whatever the athlete was just
 * refused. All four always render, in these exact words; only the order moves.
 */
const BENEFITS: Record<BenefitId, { title: string; detail: string }> = {
  library: {
    title: 'Full exercise library',
    detail: 'Every movement beyond push-ups & squats',
  },
  programmes: {
    title: 'Guided programmes',
    detail: 'Adaptive multi-week plans that scale with you',
  },
  reports: {
    title: 'Form reports',
    detail: 'Depth, tempo and alignment after every set',
  },
  'free-staples': {
    title: 'Free to start',
    detail: `${FREE_REP_LIMIT} free reps to try it, and couple mode is free forever`,
  },
};

/**
 * Pro upgrade screen — live RevenueCat packages, sticky CTA, honest empty states.
 */
export default function PaywallScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ source?: string; hard?: string }>();
  const refresh = useProStore((s) => s.refresh);
  const setPro = useProStore((s) => s.setPro);
  const uid = useAuthStore((s) => s.user?.uid ?? null);

  const [packages, setPackages] = useState<PurchasesPackage[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const billingReady = isPurchasesConfigured();

  /* Reached from the hard rep wall, which the athlete may still decline — the
     wall stays up, it just is not a trap. See `leave` for why that needs a
     different exit than the ordinary paywall. */
  const fromRepWall = params.hard === '1';

  /* Every way off this screen, whether the athlete subscribed or declined.
   *
   * `router.back()` is wrong for the rep wall in both directions. The session
   * reaches here via <Redirect>, which *replaces* the session in the stack
   * rather than stacking on top of it, so back lands on whatever preceded the
   * session — not the session. Declining that way could bounce them into a
   * screen that re-walls and sends them straight back; subscribing that way
   * drops someone who just paid to keep training onto Home with nothing
   * running.
   *
   * Home is the right destination for both. The set is gone either way, and
   * from Home a subscriber has every exercise unlocked one tap away while
   * someone who declined still has couple mode, which is never walled.
   *
   * The ordinary pushed paywall keeps `router.back()`, which already returns
   * to whatever opened it. */
  const leave = useCallback(() => {
    if (fromRepWall) {
      router.replace('/(tabs)');
      return;
    }
    router.back();
  }, [fromRepWall, router]);

  /**
   * Leaving without buying — the half of the funnel that was never measured.
   *
   * `paywall_dismissed` has been in the event catalogue since it was written,
   * described there as "the other half of the funnel", and only `onboarding`
   * ever fired it. This screen is reached from sixteen call sites — the rep
   * wall, the exercise library, form reports, programmes, duels, Profile — and
   * from every one of them a decline was invisible. `paywall_viewed` and
   * `subscribed` alone cannot tell a source that converts badly from one nobody
   * reaches; both look identical when the only signal is a view count.
   *
   * Deliberately separate from `leave`, which is also the exit after a
   * successful purchase. Firing there would count every subscriber as a
   * dismissal too and make the number meaningless.
   */
  const leaveWithoutBuying = useCallback(() => {
    track('paywall_dismissed', { source: params.source ?? 'unknown' });
    leave();
  }, [leave, params.source]);

  useEffect(() => {
    track('paywall_viewed', { source: params.source ?? 'unknown' });
  }, [params.source]);

  /* Android back, routed through the same exit as "Maybe later".
   *
   * Left alone it pops back to the session, which re-walls and redirects here
   * again — the athlete would be stuck in a loop they cannot back out of, and
   * a paywall you cannot leave is what the store rejection was about. This
   * does not block the gesture; it redirects it. */
  useEffect(() => {
    if (!fromRepWall) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      /* Backing out is a decline like any other, and on the rep wall it is the
         most likely exit of all — so it must not be the one path that goes
         unmeasured. */
      leaveWithoutBuying();
      return true;
    });
    return () => sub.remove();
  }, [fromRepWall, leaveWithoutBuying]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadFailed(false);
    setPackages(null);

    fetchOffering(uid)
      .then((offering) => {
        if (cancelled) return;
        const pkgs = sortPackagesForPaywall(offering?.availablePackages ?? []);
        setPackages(pkgs);
        const annual = pkgs.find((p) => p.packageType === 'ANNUAL') ?? pkgs[0];
        setSelectedId(annual?.identifier ?? null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        captureError(error);
        setLoadFailed(true);
        setPackages([]);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey, uid]);

  const selected = useMemo(
    () => packages?.find((p) => p.identifier === selectedId) ?? null,
    [packages, selectedId],
  );

  const plansReady = Boolean(billingReady && packages && packages.length > 0 && selected);
  const showRetry =
    billingReady && (loadFailed || (packages !== null && packages.length === 0));

  const onSubscribe = useCallback(async () => {
    if (!selected) return;
    setBusy(true);
    const result = await purchase(selected, uid);
    setBusy(false);

    /* Backed out of the store's own confirmation sheet. Tracked separately
       from `paywall_dismissed`: this athlete accepted the offer and stopped at
       the payment, which is a friction problem, not a pricing one. */
    if (result.cancelled) {
      track('purchase_cancelled', {
        plan: selected.packageType,
        source: params.source ?? 'unknown',
      });
      return;
    }

    if (result.ok && result.isPro) {
      setPro(true);
      await refresh();
      if (hasFreeTrial(selected)) {
        track('trial_started', { plan: selected.packageType, source: params.source ?? 'unknown' });
      }
      track('subscribed', { plan: selected.packageType, source: params.source ?? 'unknown' });
      leave();
      return;
    }

    /* Paid, but the entitlement did not attach.
     *
     * The RevenueCat wording is deliberate and must not be softened into
     * generic "contact support" copy. On 2026-08-09 this dialog was what
     * identified the second of two faults blocking every purchase the app had
     * ever attempted: the `pro` entitlement had no products attached, so a
     * validated purchase left `entitlements.active['pro']` empty and Pro never
     * switched on. The fault was invisible until a separate service-account
     * credentials failure cleared, and this string named the cause outright.
     *
     * It is rare, it is actionable, and the person most likely to see it is
     * whoever can fix it. Leave it specific. */
    if (result.ok && !result.isPro) {
      showDialog({
        title: 'Almost there',
        message:
          'Purchase completed, but Pro is not active yet. Try Restore purchase, or confirm the “pro” entitlement is attached in RevenueCat.',
        tone: 'info',
        actions: [{ label: 'Got it', variant: 'primary' }],
      });
      return;
    }

    /* A real failure: declined card, store outage, misconfiguration. The
       store's own message is carried through because it is what separates a
       fault the app can fix from one it cannot — the 2026-08-09 entitlement
       bug was diagnosed from exactly this kind of specific wording. */
    track('purchase_failed', {
      plan: selected.packageType,
      source: params.source ?? 'unknown',
      /* Bounded: this is a raw store-SDK string, the only free text in the
         event catalogue. See `truncateReason`. */
      reason: truncateReason(result.message),
    });
    showDialog({
      title: 'Purchase failed',
      message: result.message ?? 'Please try again.',
      tone: 'danger',
      actions: [{ label: 'Try again', variant: 'primary' }],
    });
  }, [selected, setPro, refresh, uid, leave, params.source]);

  const onRestore = useCallback(async () => {
    setBusy(true);
    const result = await restore(uid);
    setBusy(false);

    if (result.ok && result.isPro) {
      setPro(true);
      await refresh();
      track('restore_completed', { restored: true });
      showDialog({
        title: 'Restored',
        message: 'Your Pro subscription is active again.',
        tone: 'success',
        actions: [{ label: 'Got it', variant: 'primary' }],
      });
      leave();
      return;
    }

    track('restore_completed', { restored: false });
    showDialog({
      title: result.ok ? 'Nothing to restore' : 'Restore failed',
      message:
        result.message ?? 'No active subscription was found for this account.',
      tone: result.ok ? 'info' : 'danger',
      actions: [{ label: 'Got it', variant: 'primary' }],
    });
  }, [setPro, refresh, uid, leave]);

  const ctaLabel = (() => {
    if (busy) return 'Please wait…';
    if (!billingReady) return 'Continue free';
    if (showRetry) return 'Try loading plans';
    if (selected) return subscribeCtaLabel(selected);
    if (packages === null) return 'Loading…';
    return 'Continue';
  })();

  const onPrimary = () => {
    if (!billingReady || showRetry) {
      if (showRetry) {
        setReloadKey((k) => k + 1);
        return;
      }
      leave();
      return;
    }
    void onSubscribe();
  };

  const trialHint = selected && hasFreeTrial(selected) ? trialPeriodLabel(selected) : null;
  const sessions = useProfileStore((st) => st.sessions);
  const streak = useProfileStore(selectStreak);
  const ownProof = headlineProof(sessions, streak);
  const totalReps = useProfileStore(selectTotalReps);

  /* The price in the athlete's own units. Workouts are counted over the last
     thirty days from their real history, so "per workout" is their pace, not a
     typical one. */
  const [openedAt] = useState(() => Date.now());
  const workouts30 = useMemo(() => {
    const since = openedAt - 30 * 86_400_000;
    return sessions.filter((x) => x.reps > 0 && Date.parse(x.completedAt) >= since).length;
  }, [sessions, openedAt]);
  const selectedPrice = selected ? toPlanPrice(selected) : null;
  const insight = selectedPrice ? priceInsight(selectedPrice, workouts30) : null;
  const timeline = useMemo(
    () => (selected && hasFreeTrial(selected) ? trialTimeline(trialLengthDays(selected), new Date(openedAt)) : null),
    [selected, openedAt],
  );
  const lead = paywallLead(params.source, {
    fromRepWall,
    freeLimit: FREE_REP_LIMIT,
    totalReps,
  });
  const order = orderBenefits(params.source);
  const leadBenefit = blockedBenefit(params.source);
  const wallPct = Math.min(1, totalReps / FREE_REP_LIMIT);

  return (
    <Screen scroll={false} style={styles.root} contentStyle={styles.rootContent}>
      <View style={styles.body}>
        {/* `onBack` is not optional here: the rep wall arrives via <Redirect>,
            so a plain `router.back()` can land on a screen that re-walls
            straight back into this one. The close button is the same door as
            "Maybe later" (see `leave`). */}
        <View style={styles.topBar}>
          <PressableScale
            onPress={leaveWithoutBuying}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={styles.close}
          >
            <View style={[styles.closeBar, { transform: [{ rotate: '45deg' }] }]} />
            <View style={[styles.closeBar, { transform: [{ rotate: '-45deg' }] }]} />
          </PressableScale>
          {billingReady ? (
            <PressableScale
              onPress={() => void onRestore()}
              accessibilityRole="button"
              accessibilityLabel="Restore a previous purchase"
              disabled={busy}
              style={styles.footerLinkHit}
            >
              <Text style={styles.footerLink}>Restore</Text>
            </PressableScale>
          ) : null}
        </View>

        <Animated.ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <Animated.View entering={FadeInDown.duration(360)}>
            <Text style={styles.eyebrow}>REPCHAMP PRO</Text>
            <Text style={styles.title} accessibilityRole="header">
              {lead.title}
            </Text>
            <Text style={styles.sub}>{lead.sub}</Text>

            {/* The rep wall as a fact, not a lock: their own count, full. */}
            {fromRepWall ? (
              <View style={styles.wallTrack} accessibilityLabel={`${totalReps} of ${FREE_REP_LIMIT} free reps used`}>
                <View style={[styles.wallFill, { width: `${Math.round(wallPct * 100)}%` }]} />
              </View>
            ) : ownProof ? (
              <Text style={styles.ownProof}>{ownProof}</Text>
            ) : null}
          </Animated.View>

          {/* Ordered by what this source blocked; the refused one is marked.
              All four promises always render in the same words — only the
              order and the marker move. See `domain/paywallBenefits`. */}
          <View style={styles.benefits}>
            {order.map((id, i) => {
              const b = BENEFITS[id];
              const free = id === 'free-staples';
              return (
                <Animated.View
                  key={id}
                  entering={FadeInDown.delay(100 + i * 50).duration(320)}
                  style={[styles.benefit, free && styles.benefitFree]}
                >
                  <View style={[styles.benefitDot, free && styles.benefitDotFree]}>
                    <CheckIcon
                      size={12}
                      color={free ? palette.grey600 : palette.white}
                      strokeWidth={3.2}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.benefitTitleRow}>
                      <Text style={[styles.benefitTitle, free && styles.benefitTitleFree]}>
                        {b.title}
                      </Text>
                      {id === leadBenefit ? (
                        <View style={styles.forYou}>
                          <Text style={styles.forYouText}>WHAT YOU TAPPED</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.benefitDetail}>{b.detail}</Text>
                  </View>
                </Animated.View>
              );
            })}
          </View>

          <View style={styles.plans}>
            {/* No billing key on this build. This renders on every dev visit,
                so it is the athlete's copy, not a developer note. The hard
                wall stands down when billing is unconfigured (see
                domain/hardPaywall.ts), so nobody is ever locked out here. */}
            {!billingReady ? (
              <View style={styles.statusCard}>
                <Text style={styles.statusTitle}>Subscriptions aren’t available here</Text>
                <Text style={styles.statusBody}>
                  Push-ups, squats, duels and couple mode stay free — keep training and nothing
                  is locked.
                </Text>
              </View>
            ) : loadFailed ? (
              <View style={styles.statusCard}>
                <Text style={styles.statusTitle}>Couldn’t load plans</Text>
                <Text style={styles.statusBody}>
                  Check your connection, then try again. You can keep training free in the meantime.
                </Text>
              </View>
            ) : packages === null ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator color={palette.green500} />
                <Text style={styles.loadingLabel}>Fetching store prices…</Text>
              </View>
            ) : packages.length === 0 ? (
              <View style={styles.statusCard}>
                <Text style={styles.statusTitle}>Plans aren’t available yet</Text>
                <Text style={styles.statusBody}>
                  We couldn’t find subscription products for this build. Keep training free, or
                  retry in a moment.
                </Text>
              </View>
            ) : (
              packages.map((pkg, i) => (
                <Animated.View
                  key={pkg.identifier}
                  entering={FadeInDown.delay(260 + i * 50).duration(300)}
                >
                  <PlanRow
                    selected={pkg.identifier === selectedId}
                    onPress={() => setSelectedId(pkg.identifier)}
                    title={planTitle(pkg)}
                    /* One framing per plan: the monthly rate and the real
                       charge are the two that matter; a third restatement of
                       the same price reads as sales patter. */
                    subtitle={
                      monthlyFor(pkg)
                        ? (monthlyFor(pkg)?.billedAs ?? 'cancel anytime')
                        : (perWeekHint(pkg) ?? pkg.product.description ?? 'Full Pro access')
                    }
                    price={pkg.product.priceString}
                    perMonth={monthlyFor(pkg)?.perMonth}
                    billedAs={monthlyFor(pkg)?.billedAs}
                    badge={
                      pkg.packageType === 'ANNUAL'
                        ? [trialRibbon(pkg), savingsBadge(pkg, packages)]
                            .filter(Boolean)
                            .join(' · ')
                        : trialRibbon(pkg)
                    }
                    featured={pkg.packageType === 'ANNUAL'}
                  />
                </Animated.View>
              ))
            )}
          </View>

          {/* Keyed on the selection so the line re-reads when the plan changes
              instead of silently swapping a number. */}
          {plansReady && insight ? (
            <Animated.Text key={selectedId} entering={FadeIn.duration(260)} style={styles.insight}>
              {insight}
            </Animated.Text>
          ) : null}

          {/* Only a real trial earns a timeline, and only with real dates. The
              last free day is stated because that is when a surprise charge is
              avoided — the single most useful thing to know before tapping. */}
          {plansReady && timeline ? (
            <Animated.View key={`t-${selectedId}`} entering={FadeIn.duration(260)} style={styles.timeline}>
              <TimelineStep label="Today" detail="Full access starts. Nothing charged." first />
              <TimelineStep
                label={timeline.chargeDate}
                detail={`Billing begins. Cancel by ${timeline.cancelBy} to pay nothing.`}
                last
              />
            </Animated.View>
          ) : null}
        </Animated.ScrollView>
      </View>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <PrimaryButton
          label={ctaLabel}
          onPress={onPrimary}
          disabled={busy || (billingReady && !showRetry && !plansReady && packages === null)}
        />

        {/* The reassurance sits directly under the button, where the hesitation
            is, and it only promises a trial when the plan carries one. */}
        {selected && plansReady ? (
          <Text style={styles.commitLine}>
            {commitmentLine(hasFreeTrial(selected), trialHint)}
          </Text>
        ) : null}
        {selected && plansReady ? (
          <Text style={styles.footerHint} numberOfLines={2}>
            {renewDisclosure(selected)}
          </Text>
        ) : null}

        <View style={styles.footerLinks}>
          {/* Unconditional: declining must always be one obvious tap. On the
              rep wall an iOS athlete otherwise has no visible way to decline,
              which is the dead end the store rejection was about. */}
          <PressableScale
            onPress={leaveWithoutBuying}
            accessibilityRole="button"
            accessibilityLabel="Maybe later"
            disabled={busy}
            style={styles.footerLinkHit}
          >
            <Text style={styles.footerLink}>Maybe later</Text>
          </PressableScale>
          <Text style={styles.footerSep}>·</Text>
          <PressableScale
            onPress={() => void Linking.openURL(TERMS_URL)}
            accessibilityRole="link"
            accessibilityLabel="Terms of use"
            style={styles.footerLinkHit}
          >
            <Text style={styles.footerLink}>Terms</Text>
          </PressableScale>
          <Text style={styles.footerSep}>·</Text>
          <PressableScale
            onPress={() => void Linking.openURL(PRIVACY_URL)}
            accessibilityRole="link"
            accessibilityLabel="Privacy policy"
            style={styles.footerLinkHit}
          >
            <Text style={styles.footerLink}>Privacy</Text>
          </PressableScale>
        </View>
      </View>
    </Screen>
  );
}

function TimelineStep({
  label,
  detail,
  first,
  last,
}: {
  label: string;
  detail: string;
  first?: boolean;
  last?: boolean;
}) {
  return (
    <View style={styles.tlRow}>
      <View style={styles.tlRail}>
        <View style={[styles.tlLine, first && { backgroundColor: 'transparent' }]} />
        <View style={[styles.tlDot, first && styles.tlDotOn]} />
        <View style={[styles.tlLine, last && { backgroundColor: 'transparent' }]} />
      </View>
      <View style={{ flex: 1, paddingVertical: 8 }}>
        <Text style={styles.tlLabel}>{label}</Text>
        <Text style={styles.tlDetail}>{detail}</Text>
      </View>
    </View>
  );
}

function PlanRow({
  selected,
  onPress,
  title,
  subtitle,
  price,
  perMonth,
  billedAs,
  badge,
  featured,
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  subtitle: string;
  price: string;
  /** Monthly-equivalent headline, e.g. "$5" — absent for already-monthly plans. */
  perMonth?: string | null;
  /** The charge that actually lands, e.g. "paid $60 annually". */
  billedAs?: string | null;
  badge?: string | null;
  featured?: boolean;
}) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      /* The spoken label always carries the real charge. A screen-reader user
         must not hear "$5 a month" and be billed $60 without being told. */
      accessibilityLabel={
        perMonth && billedAs
          ? `${title}, ${perMonth} per month, ${billedAs}${badge ? `, ${badge}` : ''}`
          : `${title}, ${price}${badge ? `, ${badge}` : ''}`
      }
      style={[styles.plan, selected && styles.planSelected]}
    >
      <View style={[styles.radio, selected && styles.radioOn]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text style={styles.planTitle}>{title}</Text>
        {badge ? (
          <View style={[styles.planBadge, featured && styles.planBadgeFeatured]}>
            <Text style={[styles.planBadgeText, featured && { color: palette.white }]}>
              {badge}
            </Text>
          </View>
        ) : (
          <Text style={styles.planSubtitle}>{subtitle}</Text>
        )}
      </View>
      {/* The rate leads, the charge follows: "$60" and "$10" are not the same
          unit, so both in one unit makes the comparison honest, and the real
          charge stays attached because finding it out at the store sheet is
          what produces refunds. */}
      {perMonth && billedAs ? (
        <View style={{ alignItems: 'flex-end' }}>
          <View style={styles.planRateRow}>
            <Text style={styles.planPrice}>{perMonth}</Text>
            <Text style={styles.planRateUnit}> / mo</Text>
          </View>
          <Text style={styles.planBilledAs}>{billedAs}</Text>
        </View>
      ) : (
        <Text style={styles.planPrice}>{price}</Text>
      )}
    </PressableScale>
  );
}

/** The monthly-rate split for a plan, or null when it is already monthly. */
function monthlyFor(pkg: PurchasesPackage) {
  return monthlyEquivalent(toPlanPrice(pkg), pkg.product.priceString, pkg.packageType);
}

function perWeekHint(pkg: PurchasesPackage): string | null {
  /* The arithmetic lives in `domain/paywallFraming`, where it is tested. */
  const granular = granularPrice(toPlanPrice(pkg));
  return granular ? `${granular} · cancel anytime` : null;
}

function savingsBadge(annual: PurchasesPackage, all: PurchasesPackage[]): string {
  /* Anchored on the dearest plan the athlete could actually buy, never an
     invented "was" price. `savingsPercent` returns null rather than 0% when
     there is nothing honest to claim, and a bare BEST VALUE beats a fabricated
     discount — stores treat the latter as a dark pattern. */
  const pct = savingsPercent(
    toPlanPrice(annual),
    all.filter((p) => p !== annual).map(toPlanPrice),
  );
  return pct ? `BEST VALUE · SAVE ${pct}%` : 'BEST VALUE';
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  rootContent: { flex: 1, paddingBottom: 0 },
  body: { flex: 1 },
  scrollContent: { paddingBottom: 20 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 8,
  },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBar: {
    position: 'absolute',
    width: 16,
    height: 2,
    borderRadius: 1,
    backgroundColor: palette.ink,
  },

  eyebrow: {
    ...font('extrabold', 11, { color: palette.green600 }),
    letterSpacing: 2.4,
    marginTop: 12,
  },
  title: {
    ...font('extrabold', 32, { color: palette.ink }),
    letterSpacing: -1,
    lineHeight: 37,
    marginTop: 8,
  },
  sub: { ...font('medium', 15, { color: palette.grey600 }), lineHeight: 21, marginTop: 6 },
  ownProof: { ...font('bold', 13, { color: palette.green700 }), marginTop: 10, lineHeight: 18 },
  wallTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.divider,
    marginTop: 16,
    overflow: 'hidden',
  },
  wallFill: { height: 4, borderRadius: 2, backgroundColor: palette.green500 },

  benefits: { marginTop: 24, gap: 14 },
  benefit: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  benefitFree: {
    marginTop: 2,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.borderStrong,
  },
  benefitDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: palette.green500,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  benefitDotFree: { backgroundColor: palette.divider },
  benefitTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  benefitTitle: font('extrabold', 15, { color: palette.ink }),
  benefitTitleFree: { color: palette.grey600 },
  benefitDetail: { ...text.caption, marginTop: 2, lineHeight: 17 },
  forYou: {
    backgroundColor: palette.green50,
    borderRadius: radius.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  forYouText: { ...font('extrabold', 9, { color: palette.green700 }), letterSpacing: 0.8 },

  plans: { gap: 10, marginTop: 28 },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderColor: palette.border,
    borderRadius: radius['4xl'],
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: palette.white,
  },
  planSelected: { borderColor: palette.ink, backgroundColor: palette.white },
  planTitle: font('extrabold', 16, { color: palette.ink }),
  planBadge: {
    alignSelf: 'flex-start',
    marginTop: 5,
    backgroundColor: palette.green50,
    borderRadius: radius.xs,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  planBadgeFeatured: { backgroundColor: palette.green600 },
  planBadgeText: font('extrabold', 9.5, { color: palette.green700 }),
  planRateRow: { flexDirection: 'row', alignItems: 'baseline' },
  /* Pricing type: semibold (not extrabold) at a larger size reads as figures,
     not shouting; tabular numerals keep digits the same width so the two plans
     line up, and tight tracking stops large numerals looking loose. */
  planPrice: {
    ...font('semibold', 22, { color: palette.ink }),
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
  },
  planRateUnit: { ...font('medium', 13, { color: palette.grey600 }), letterSpacing: 0 },
  planBilledAs: {
    ...font('medium', 11.5, { color: palette.grey500 }),
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },
  planSubtitle: { ...text.caption, marginTop: 3 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: palette.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: palette.ink },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.ink },

  insight: {
    ...font('semibold', 13, { color: palette.green700 }),
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    marginTop: 14,
  },

  timeline: { marginTop: 18, paddingHorizontal: 4 },
  tlRow: { flexDirection: 'row', gap: 12 },
  tlRail: { width: 12, alignItems: 'center' },
  tlLine: { flex: 1, width: 2, backgroundColor: palette.border },
  tlDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: palette.borderStrong,
    backgroundColor: palette.canvas,
  },
  tlDotOn: { borderColor: palette.green500, backgroundColor: palette.green500 },
  tlLabel: font('extrabold', 13, { color: palette.ink }),
  tlDetail: { ...text.caption, marginTop: 1, lineHeight: 17 },

  statusCard: {
    borderRadius: radius['4xl'],
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
    gap: 4,
  },
  statusTitle: font('extrabold', 15, { color: palette.ink }),
  statusBody: { ...text.caption, lineHeight: 18 },
  loadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 28,
  },
  loadingLabel: font('semibold', 13, { color: palette.grey600 }),

  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.borderStrong,
    backgroundColor: palette.canvas,
    paddingTop: 12,
    gap: 4,
  },
  /* Directly under the CTA, muted: findable at the moment of hesitation
     without competing with the button itself. */
  commitLine: {
    ...font('semibold', 11.5, { color: palette.grey550 }),
    textAlign: 'center',
    marginTop: 8,
  },
  footerHint: {
    ...text.caption,
    color: palette.grey450,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  footerLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  footerLinkHit: { paddingVertical: 8, paddingHorizontal: 8 },
  footerLink: font('bold', 12.5, { color: palette.grey600 }),
  footerSep: font('bold', 12.5, { color: palette.grey450 }),
});

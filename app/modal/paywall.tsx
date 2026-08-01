import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { PurchasesPackage } from 'react-native-purchases';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { track } from '@/lib/analytics';
import { captureError } from '@/lib/crash';
import { PRIVACY_URL, TERMS_URL } from '@/lib/urls';
import { ModalHeader } from '@/components/ModalHeader';
import { PressableScale, PrimaryButton, Screen } from '@/components/ui';
import {
  hasFreeTrial,
  planTitle,
  renewDisclosure,
  subscribeCtaLabel,
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
import { font, text } from '@/theme/typography';
import { gradients, palette, radius, shadow } from '@/theme/tokens';

/** Compact value props — not card chrome. Push-ups & squats stay free. */
const BENEFITS = [
  { title: 'Full exercise library', detail: 'Every movement beyond push-ups & squats' },
  { title: 'Guided programmes', detail: 'Adaptive multi-week plans that scale with you' },
  { title: 'Form reports', detail: 'Depth, tempo and alignment after every set' },
  { title: 'Always free staples', detail: 'Push-ups, squats, duels & couple mode stay free' },
];

/**
 * Pro upgrade screen — live RevenueCat packages, sticky CTA, honest empty states.
 */
export default function PaywallScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ source?: string }>();
  const refresh = useProStore((s) => s.refresh);
  const setPro = useProStore((s) => s.setPro);
  const uid = useAuthStore((s) => s.user?.uid ?? null);

  const [packages, setPackages] = useState<PurchasesPackage[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const billingReady = isPurchasesConfigured();

  useEffect(() => {
    track('paywall_viewed', { source: params.source ?? 'unknown' });
  }, [params.source]);

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

    if (result.cancelled) return;

    if (result.ok && result.isPro) {
      setPro(true);
      await refresh();
      if (hasFreeTrial(selected)) {
        track('trial_started', { plan: selected.packageType });
      }
      track('subscribed', { plan: selected.packageType });
      router.back();
      return;
    }

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

    showDialog({
      title: 'Purchase failed',
      message: result.message ?? 'Please try again.',
      tone: 'danger',
      actions: [{ label: 'Try again', variant: 'primary' }],
    });
  }, [selected, setPro, refresh, router, uid]);

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
      router.back();
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
  }, [setPro, refresh, router, uid]);

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
      router.back();
      return;
    }
    void onSubscribe();
  };

  const trialHint = selected && hasFreeTrial(selected) ? trialPeriodLabel(selected) : null;

  return (
    <Screen scroll={false} style={styles.root} contentStyle={styles.rootContent}>
      <View style={styles.body}>
        <ModalHeader
          title="RepChamp Pro"
          subtitle="Unlock depth. Keep the free staples."
        />

        <Animated.ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <Animated.View entering={FadeInDown.duration(380).springify()}>
            <LinearGradient colors={gradients.brandDeep} style={[styles.hero, shadow.brand]}>
              <View style={styles.heroTop}>
                <View style={styles.heroBadge}>
                  <Image
                    source={require('../../assets/logo.png')}
                    style={styles.heroLogo}
                    contentFit="contain"
                  />
                </View>
                <View style={styles.heroProTag}>
                  <Text style={styles.heroProTagText}>PRO</Text>
                </View>
              </View>
              <Text style={styles.heroTitle}>Train without limits</Text>
              <Text style={styles.heroCopy}>
                Full library, programmes, and form reports — cancel anytime.
              </Text>
              {trialHint ? (
                <View style={styles.trialPill}>
                  <Text style={styles.trialPillText}>{trialHint} free · then subscribe</Text>
                </View>
              ) : (
                <View style={styles.trustRow}>
                  <Text style={styles.trustText}>Cancel anytime</Text>
                  <Text style={styles.trustDot}>·</Text>
                  <Text style={styles.trustText}>Store-secured billing</Text>
                </View>
              )}
            </LinearGradient>
          </Animated.View>

          <View style={styles.benefits}>
            {BENEFITS.map((b, i) => (
              <Animated.View
                key={b.title}
                entering={FadeInDown.delay(80 + i * 45).duration(320)}
                style={styles.benefit}
              >
                <View style={styles.benefitIcon}>
                  <Text style={styles.benefitCheck}>✓</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.benefitTitle}>{b.title}</Text>
                  <Text style={styles.benefitDetail}>{b.detail}</Text>
                </View>
              </Animated.View>
            ))}
          </View>

          <Text style={styles.plansLabel}>CHOOSE YOUR PLAN</Text>

          <View style={styles.plans}>
            {!billingReady ? (
              <View style={styles.statusCard}>
                <Text style={styles.statusTitle}>Billing connects on release builds</Text>
                <Text style={styles.statusBody}>
                  Push-ups, squats, duels and couple mode stay free. See REVENUECAT_SETUP.md to
                  wire live plans.
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
                  entering={FadeInDown.delay(120 + i * 50).duration(300)}
                >
                  <PlanRow
                    selected={pkg.identifier === selectedId}
                    onPress={() => setSelectedId(pkg.identifier)}
                    title={planTitle(pkg)}
                    subtitle={perWeekHint(pkg) ?? (pkg.product.description || 'Full Pro access')}
                    price={pkg.product.priceString}
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
        </Animated.ScrollView>
      </View>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {selected && plansReady ? (
          <Text style={styles.footerHint} numberOfLines={2}>
            {renewDisclosure(selected)}
          </Text>
        ) : null}

        <PrimaryButton
          label={ctaLabel}
          onPress={onPrimary}
          disabled={busy || (billingReady && !showRetry && !plansReady && packages === null)}
        />

        {billingReady ? (
          <View style={styles.footerLinks}>
            <PressableScale
              onPress={() => void onRestore()}
              accessibilityRole="button"
              accessibilityLabel="Restore a previous purchase"
              disabled={busy}
              style={styles.footerLinkHit}
            >
              <Text style={styles.footerLink}>Restore purchase</Text>
            </PressableScale>
            <Text style={styles.footerSep}>·</Text>
            {showRetry ? (
              <>
                <PressableScale
                  onPress={() => router.back()}
                  accessibilityRole="button"
                  accessibilityLabel="Maybe later"
                  style={styles.footerLinkHit}
                >
                  <Text style={styles.footerLink}>Maybe later</Text>
                </PressableScale>
                <Text style={styles.footerSep}>·</Text>
              </>
            ) : null}
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
        ) : (
          <PressableScale
            onPress={() => router.back()}
            accessibilityRole="button"
            style={styles.footerLinkHit}
          >
            <Text style={[styles.footerLink, { textAlign: 'center' }]}>Maybe later</Text>
          </PressableScale>
        )}
      </View>
    </Screen>
  );
}

function PlanRow({
  selected,
  onPress,
  title,
  subtitle,
  price,
  badge,
  featured,
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  subtitle: string;
  price: string;
  badge?: string | null;
  featured?: boolean;
}) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}, ${price}${badge ? `, ${badge}` : ''}`}
      style={[
        styles.plan,
        selected && styles.planSelected,
        featured && selected && styles.planFeatured,
      ]}
    >
      {badge ? (
        <View style={[styles.planBadge, featured && styles.planBadgeFeatured]}>
          <Text
            style={[
              styles.planBadgeText,
              featured && { color: palette.white },
            ]}
          >
            {badge}
          </Text>
        </View>
      ) : null}
      <View
        style={[
          styles.radio,
          selected && { borderColor: palette.green600, backgroundColor: palette.green600 },
        ]}
      >
        {selected ? <Text style={{ color: palette.white, fontSize: 13 }}>✓</Text> : null}
      </View>
      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text style={font('extrabold', 16, { color: palette.ink })}>{title}</Text>
        <Text style={styles.planSubtitle}>{subtitle}</Text>
      </View>
      <Text style={font('extrabold', 17, { color: palette.ink })}>{price}</Text>
    </PressableScale>
  );
}

function perWeekHint(pkg: PurchasesPackage): string | null {
  const price = pkg.product.price;
  const weeks: Record<string, number> = { ANNUAL: 52, MONTHLY: 4.345, WEEKLY: 1 };
  const w = weeks[pkg.packageType];
  if (!price || !w) return null;
  const perWeek = price / w;
  const symbol = pkg.product.priceString.replace(/[\d.,\s]/g, '') || '';
  return `${symbol}${perWeek.toFixed(2)} / week · cancel anytime`;
}

function savingsBadge(annual: PurchasesPackage, all: PurchasesPackage[]): string {
  const annualPerWeek = (annual.product.price || 0) / 52;
  const refs = all
    .filter((p) => p.packageType === 'WEEKLY' || p.packageType === 'MONTHLY')
    .map((p) => (p.product.price || 0) / (p.packageType === 'WEEKLY' ? 1 : 4.345))
    .filter((n) => n > 0);
  const ref = Math.max(0, ...refs);
  if (!ref || !annualPerWeek || annualPerWeek >= ref) return 'BEST VALUE';
  const pct = Math.round((1 - annualPerWeek / ref) * 100);
  return `BEST VALUE · SAVE ${pct}%`;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  rootContent: { flex: 1, paddingBottom: 0 },
  body: { flex: 1 },
  scrollContent: { paddingBottom: 20 },

  hero: {
    borderRadius: radius['6xl'],
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    overflow: 'hidden',
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroBadge: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroLogo: { width: 34, height: 34, borderRadius: radius.sm, overflow: 'hidden' },
  heroProTag: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  heroProTagText: {
    ...font('extrabold', 11, { color: palette.green700 }),
    letterSpacing: 2.5,
  },
  heroTitle: {
    ...font('extrabold', 26, { color: palette.white }),
    marginTop: 16,
  },
  heroCopy: {
    ...font('semibold', 13.5, { color: 'rgba(255,255,255,0.9)' }),
    marginTop: 4,
    lineHeight: 19,
  },
  trialPill: {
    alignSelf: 'flex-start',
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  trialPillText: font('extrabold', 12, { color: palette.white }),
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  trustText: font('semibold', 12, { color: 'rgba(255,255,255,0.85)' }),
  trustDot: font('semibold', 12, { color: 'rgba(255,255,255,0.45)' }),

  benefits: { marginTop: 16, gap: 12 },
  benefit: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  benefitIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: palette.green500,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  benefitCheck: font('extrabold', 14, { color: palette.white }),
  benefitTitle: font('extrabold', 14.5, { color: palette.ink }),
  benefitDetail: {
    ...text.caption,
    marginTop: 4,
    lineHeight: 17,
  },

  plansLabel: {
    ...font('extrabold', 11, { color: palette.grey550 }),
    letterSpacing: 1.2,
    marginTop: 20,
    marginBottom: 8,
  },
  plans: { gap: 8, paddingTop: 8 },

  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 2,
    borderColor: palette.border,
    borderRadius: radius['2xl'],
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: palette.white,
    overflow: 'visible',
  },
  planSelected: {
    borderColor: palette.green500,
    backgroundColor: palette.green50,
  },
  planFeatured: {
    borderColor: palette.green600,
    ...shadow.card,
  },
  planBadge: {
    position: 'absolute',
    top: -10,
    right: 14,
    backgroundColor: palette.green50,
    borderWidth: 1,
    borderColor: palette.green200,
    borderRadius: radius.xs,
    paddingHorizontal: 8,
    paddingVertical: 4,
    zIndex: 2,
  },
  planBadgeFeatured: {
    backgroundColor: palette.green600,
    borderColor: palette.green700,
  },
  planBadgeText: font('extrabold', 9, { color: palette.green700 }),
  planSubtitle: { ...text.caption, marginTop: 4 },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: palette.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },

  statusCard: {
    borderRadius: radius['2xl'],
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
    borderTopWidth: 1,
    borderTopColor: palette.divider,
    backgroundColor: palette.canvas,
    paddingHorizontal: 0,
    paddingTop: 12,
    gap: 4,
  },
  footerHint: {
    ...text.caption,
    color: palette.grey450,
    textAlign: 'center',
    marginBottom: 4,
    paddingHorizontal: 8,
  },
  footerLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  footerLinkHit: { paddingVertical: 8, paddingHorizontal: 8 },
  footerLink: font('bold', 12.5, { color: palette.grey600 }),
  footerSep: font('bold', 12.5, { color: palette.grey450 }),
});

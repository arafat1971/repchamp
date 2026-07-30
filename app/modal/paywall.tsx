import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';

import { track } from '@/lib/analytics';
import { captureError } from '@/lib/crash';
import { ModalHeader } from '@/components/ModalHeader';
import { Card, PressableScale, PrimaryButton, Screen } from '@/components/ui';
import {
  fetchOffering,
  isPurchasesConfigured,
  purchase,
  restore,
} from '@/services/purchases';
import { useProStore } from '@/state/proStore';
import { showDialog } from '@/state/useDialog';
import { font, text } from '@/theme/typography';
import { gradients, palette, radius, shadow } from '@/theme/tokens';

// Only what Pro genuinely unlocks — the full exercise library and guided
// programmes (see src/domain/pro.ts). Push-ups, squats, duels and couple mode
// stay free for everyone, so we never advertise them as paid.
const BENEFITS = [
  { title: 'Full exercise library', detail: 'Every movement beyond push-ups & squats' },
  { title: 'Guided programmes', detail: 'Adaptive multi-week training plans' },
  { title: 'New workouts first', detail: 'Fresh exercises land for members first' },
  { title: 'Support an indie app', detail: 'Push-ups & squats stay free for everyone' },
];

/**
 * Pro upgrade screen — real subscriptions via RevenueCat.
 *
 * Fetches the live offering (localised prices straight from the store),
 * purchases the selected package, and offers Restore (required by the stores so
 * a reinstall can recover Pro). When billing isn't configured (placeholder keys)
 * it degrades to an honest "not set up yet" note instead of a fake charge.
 * Android Play billing uses `revenueCatGoogle` only — Apple is optional until
 * you ship iOS.
 */
export default function PaywallScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ source?: string }>();
  const setPro = useProStore((s) => s.setPro);

  // Freemium: the paywall is always dismissible — it's an invitation to upgrade
  // (shown when a free user reaches for Pro depth), never a wall that traps them.
  const [packages, setPackages] = useState<PurchasesPackage[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Set when the offering fetch fails, so we can offer a retry instead of spinning. */
  const [loadFailed, setLoadFailed] = useState(false);
  /** Bumped to re-run the offering fetch when the athlete taps "Try again". */
  const [reloadKey, setReloadKey] = useState(0);

  const billingReady = isPurchasesConfigured();

  useEffect(() => {
    track('paywall_viewed', { source: params.source ?? 'unknown' });
  }, [params.source]);

  // Load the current offering's packages (annual/monthly/…) with their real,
  // localised prices from the store. Defaults the selection to the annual plan,
  // which is the one worth anchoring on.
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadFailed(false);

    fetchOffering()
      .then((offering) => {
        if (cancelled) return;
        // A missing offering is a real, terminal outcome (misconfigured store or
        // no products) — not a reason to spin forever. Render it as an empty
        // list so the "no plans available" copy shows.
        const pkgs = offering?.availablePackages ?? [];
        setPackages(pkgs);
        const annual = pkgs.find((p) => p.packageType === 'ANNUAL') ?? pkgs[0];
        setSelectedId(annual?.identifier ?? null);
      })
      .catch((error: unknown) => {
        // Never leave the athlete on an endless spinner with no way to buy —
        // a failed fetch here is lost revenue, so surface it and offer a retry.
        if (cancelled) return;
        captureError(error);
        setLoadFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const selected = useMemo(
    () => packages?.find((p) => p.identifier === selectedId) ?? null,
    [packages, selectedId],
  );

  const onSubscribe = async () => {
    if (!selected) return;
    track('trial_started', { plan: selected.packageType });
    setBusy(true);
    const result = await purchase(selected);
    setBusy(false);

    if (result.cancelled) return; // Backing out isn't an error.
    if (result.ok && result.isPro) {
      setPro(true);
      track('subscribed', { plan: selected.packageType });
      router.back();
      return;
    }
    showDialog({
      title: 'Purchase failed',
      message: result.message ?? 'Please try again.',
      tone: 'danger',
      actions: [{ label: 'Try again', variant: 'primary' }],
    });
  };

  const onRestore = async () => {
    setBusy(true);
    const result = await restore();
    setBusy(false);
    if (result.ok && result.isPro) {
      setPro(true);
      showDialog({
        title: 'Restored',
        message: 'Your Pro subscription is active again.',
        tone: 'success',
        actions: [{ label: 'Got it', variant: 'primary' }],
      });
      router.back();
    } else {
      showDialog({
        title: 'Nothing to restore',
        message: 'No active subscription was found for this account.',
        tone: 'info',
        actions: [{ label: 'Got it', variant: 'primary' }],
      });
    }
  };

  return (
    <Screen>
      <ModalHeader title="RepChamp Pro" subtitle="Unlock the full library and programmes" />

      <LinearGradient colors={gradients.brandDeep} style={[styles.hero, shadow.brand]}>
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
        <Text style={font('extrabold', 24, { color: palette.white, marginTop: 12 })}>
          Train without limits
        </Text>
        <Text style={styles.heroCopy}>Everything in RepChamp, unlocked.</Text>
      </LinearGradient>

      <View style={{ gap: 12, marginTop: 18 }}>
        {BENEFITS.map((b) => (
          <Card key={b.title} style={styles.benefit}>
            <View style={styles.benefitIcon}>
              <Text style={styles.benefitCheck}>✓</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={text.cardTitle}>{b.title}</Text>
              <Text style={text.caption}>{b.detail}</Text>
            </View>
          </Card>
        ))}
      </View>

      <View style={{ marginTop: 22, gap: 12 }}>
        {!billingReady ? (
          <Text style={styles.disclaimer}>
            Billing isn’t set up in this build yet. See FIREBASE_SETUP.md / the RevenueCat
            steps to connect real subscriptions.
          </Text>
        ) : loadFailed ? (
          <View style={{ gap: 10 }}>
            <Text style={styles.disclaimer}>
              We couldn’t load the subscription plans. Check your connection and try again.
            </Text>
            <PressableScale
              onPress={() => setReloadKey((k) => k + 1)}
              accessibilityRole="button"
              accessibilityLabel="Try loading plans again"
              style={styles.retryButton}
            >
              <Text style={font('extrabold', 14, { color: palette.green700 })}>Try again</Text>
            </PressableScale>
          </View>
        ) : packages === null ? (
          <ActivityIndicator color={palette.green500} style={{ marginVertical: 12 }} />
        ) : packages.length === 0 ? (
          <Text style={styles.disclaimer}>
            No subscription plans are available right now. Please try again later.
          </Text>
        ) : (
          packages.map((pkg) => (
            <PlanRow
              key={pkg.identifier}
              selected={pkg.identifier === selectedId}
              onPress={() => setSelectedId(pkg.identifier)}
              title={planTitle(pkg)}
              subtitle={perWeekHint(pkg) ?? (pkg.product.description || 'RepChamp Pro')}
              price={pkg.product.priceString}
              badge={pkg.packageType === 'ANNUAL' ? savingsBadge(pkg, packages) : null}
            />
          ))
        )}
      </View>

      <PrimaryButton
        label={busy ? 'Please wait…' : selected ? ctaLabel(selected) : 'Continue'}
        onPress={() => void onSubscribe()}
        disabled={busy || !selected}
        style={{ marginTop: 20 }}
      />

      {billingReady ? (
        <PressableScale
          onPress={() => void onRestore()}
          accessibilityRole="button"
          accessibilityLabel="Restore a previous purchase"
          style={styles.restore}
        >
          <Text style={font('bold', 13, { color: palette.grey600 })}>Restore purchase</Text>
        </PressableScale>
      ) : null}

      <Text style={styles.disclaimer}>
        Subscriptions renew automatically until cancelled. Manage or cancel anytime in your
        {'\n'}App Store or Google Play account settings.
      </Text>
    </Screen>
  );
}

/** A friendly plan title from the RevenueCat package type. */
function planTitle(pkg: PurchasesPackage): string {
  switch (pkg.packageType) {
    case 'ANNUAL':
      return 'Yearly';
    case 'MONTHLY':
      return 'Monthly';
    case 'LIFETIME':
      return 'Lifetime';
    case 'WEEKLY':
      return 'Weekly';
    default:
      return pkg.product.title || 'RepChamp Pro';
  }
}

/** CTA copy: lead with the trial if the store offers one, else a plain subscribe. */
function ctaLabel(pkg: PurchasesPackage): string {
  const hasTrial = pkg.product.introPrice?.price === 0;
  if (hasTrial) return 'Start free trial';
  return pkg.packageType === 'LIFETIME' ? 'Unlock forever' : 'Subscribe';
}

function PlanRow({
  selected,
  onPress,
  title,
  subtitle,
  price,
  badge,
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  subtitle: string;
  price: string;
  /** e.g. "BEST VALUE · SAVE 62%" on the anchor plan. */
  badge?: string | null;
}) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}, ${price}${badge ? `, ${badge}` : ''}`}
      style={[styles.plan, { borderColor: selected ? palette.green500 : palette.border }]}
    >
      <View
        style={[
          styles.radio,
          selected && { borderColor: palette.green600, backgroundColor: palette.green600 },
        ]}
      >
        {selected ? <Text style={{ color: palette.white, fontSize: 13 }}>✓</Text> : null}
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.planTitleRow}>
          <Text style={font('extrabold', 16, { color: palette.ink })}>{title}</Text>
          {badge ? (
            <View style={styles.planBadge}>
              <Text style={font('extrabold', 9, { color: palette.green700 })}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={text.caption}>{subtitle}</Text>
      </View>
      <Text style={font('extrabold', 16, { color: palette.ink })}>{price}</Text>
    </PressableScale>
  );
}

/** Effective per-week price hint, e.g. "$0.96 / week" — makes annual look cheap. */
function perWeekHint(pkg: PurchasesPackage): string | null {
  const price = pkg.product.price; // numeric, in the store's currency
  const weeks: Record<string, number> = { ANNUAL: 52, MONTHLY: 4.345, WEEKLY: 1 };
  const w = weeks[pkg.packageType];
  if (!price || !w) return null;
  const perWeek = price / w;
  const symbol = pkg.product.priceString.replace(/[\d.,\s]/g, '') || '';
  return `${symbol}${perWeek.toFixed(2)} / week`;
}

/** "BEST VALUE · SAVE N%" for the annual plan vs the priciest per-week option. */
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
  hero: { borderRadius: radius['6xl'], padding: 26, alignItems: 'center' },
  heroBadge: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroLogo: { width: 44, height: 44, borderRadius: 12, overflow: 'hidden' },
  heroProTag: {
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  heroProTagText: { ...font('extrabold', 11, { color: palette.white }), letterSpacing: 3 },
  heroCopy: {
    ...font('semibold', 13, { color: 'rgba(255,255,255,0.9)' }),
    marginTop: 4,
    textAlign: 'center',
  },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  benefitIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.green500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitCheck: font('extrabold', 18, { color: palette.white }),
  planTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planBadge: {
    backgroundColor: palette.green50,
    borderWidth: 1,
    borderColor: '#bfeccb',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 2,
    borderRadius: radius['2xl'],
    paddingVertical: 16,
    paddingHorizontal: 18,
    backgroundColor: palette.white,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: palette.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restore: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 20, marginTop: 6 },
  disclaimer: {
    ...text.caption,
    color: palette.grey450,
    textAlign: 'center',
    marginTop: 14,
  },
  retryButton: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: radius.xl,
    backgroundColor: palette.green50,
    borderWidth: 1,
    borderColor: palette.green200,
  },
});

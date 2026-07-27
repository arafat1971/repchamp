import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, StyleSheet, Text, View } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';

import { track } from '@/lib/analytics';
import { ModalHeader } from '@/components/ModalHeader';
import { Card, PressableScale, PrimaryButton, Screen } from '@/components/ui';
import {
  fetchOffering,
  isPurchasesConfigured,
  purchase,
  restore,
} from '@/services/purchases';
import { useProStore } from '@/state/proStore';
import { font, text } from '@/theme/typography';
import { gradients, palette, radius, shadow } from '@/theme/tokens';

const BENEFITS = [
  { emoji: '⚔️', title: 'Unlimited duels', detail: 'Challenge anyone, as often as you like' },
  { emoji: '📊', title: 'Advanced form stats', detail: 'Per-rep depth and tempo history' },
  { emoji: '🎯', title: 'Custom targets', detail: 'Set your own rep goals and timers' },
  { emoji: '🏆', title: 'Priority matchmaking', detail: 'Faster quick matches at your level' },
];

/**
 * Pro upgrade screen — real subscriptions via RevenueCat.
 *
 * Fetches the live offering (localised prices straight from the store),
 * purchases the selected package, and offers Restore (which Apple requires on
 * any paywall). Entitlement truth flows back through `proStore`, never a local
 * flag. When billing isn't configured (placeholder keys) it degrades to an
 * honest "not set up yet" note instead of a fake charge.
 */
export default function PaywallScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ source?: string; hard?: string }>();
  const setPro = useProStore((s) => s.setPro);

  // Hard mode: the wall after the first free session. It can't be dismissed —
  // no back chevron, and the Android hardware back is swallowed — so the only
  // ways forward are to subscribe or restore a purchase.
  const hard = params.hard === '1';
  const navigation = useNavigation();
  useEffect(() => {
    if (!hard) return;
    // Kill the swipe-down-to-dismiss on the card presentation, and swallow the
    // Android hardware back — the wall stands until the user subscribes.
    navigation.setOptions({ gestureEnabled: false });
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [hard, navigation]);

  const [packages, setPackages] = useState<PurchasesPackage[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const billingReady = isPurchasesConfigured();

  useEffect(() => {
    track('paywall_viewed', { source: params.source ?? 'unknown' });
  }, [params.source]);

  // Load the current offering's packages (annual/monthly/…) with their real,
  // localised prices from the store. Defaults the selection to the annual plan,
  // which is the one worth anchoring on.
  useEffect(() => {
    let cancelled = false;
    void fetchOffering().then((offering) => {
      if (cancelled || !offering) return;
      const pkgs = offering.availablePackages;
      setPackages(pkgs);
      const annual = pkgs.find((p) => p.packageType === 'ANNUAL') ?? pkgs[0];
      setSelectedId(annual?.identifier ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
    Alert.alert('Purchase failed', result.message ?? 'Please try again.');
  };

  const onRestore = async () => {
    setBusy(true);
    const result = await restore();
    setBusy(false);
    if (result.ok && result.isPro) {
      setPro(true);
      Alert.alert('Restored', 'Your Pro subscription is active again.');
      router.back();
    } else {
      Alert.alert('Nothing to restore', 'No active subscription was found for this account.');
    }
  };

  return (
    <Screen>
      <ModalHeader
        title="RepChamp Pro"
        subtitle={hard ? 'Free reps used up — unlock to keep training' : undefined}
        hideBack={hard}
      />

      <LinearGradient colors={gradients.brandDeep} style={[styles.hero, shadow.brand]}>
        <Text style={{ fontSize: 48 }}>✨</Text>
        <Text style={font('extrabold', 24, { color: palette.white, marginTop: 8 })}>
          Train without limits
        </Text>
        <Text style={styles.heroCopy}>Everything in RepChamp, unlocked.</Text>
      </LinearGradient>

      <View style={{ gap: 12, marginTop: 18 }}>
        {BENEFITS.map((b) => (
          <Card key={b.title} style={styles.benefit}>
            <View style={styles.benefitIcon}>
              <Text style={{ fontSize: 20 }}>{b.emoji}</Text>
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
              subtitle={pkg.product.description || 'RepChamp Pro'}
              price={pkg.product.priceString}
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
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  subtitle: string;
  price: string;
}) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}, ${price}`}
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
        <Text style={font('extrabold', 16, { color: palette.ink })}>{title}</Text>
        <Text style={text.caption}>{subtitle}</Text>
      </View>
      <Text style={font('extrabold', 16, { color: palette.ink })}>{price}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius['6xl'], padding: 26, alignItems: 'center' },
  heroCopy: {
    ...font('semibold', 13, { color: 'rgba(255,255,255,0.9)' }),
    marginTop: 4,
    textAlign: 'center',
  },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  benefitIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: palette.green50,
    alignItems: 'center',
    justifyContent: 'center',
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
});

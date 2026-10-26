import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PurchasesPackage } from 'react-native-purchases';

import { PressableScale, Spinner } from '@/components/ui';
import { goalPlan, type Blocker, type FitnessLevel } from '@/domain/onboardingPlan';
import {
  CLOSE_DELAY_MS,
  benefitsFor,
  exitOffer,
  paywallHeadline,
  planKeyOf,
  resolvePlan,
  sixWeekClimb,
  type PlanKey,
} from '@/domain/onboardingPaywall';
import { savingsPercent, weeklyEquivalent } from '@/domain/paywallFraming';
import { billingPeriodSuffix, hasFreeTrial, renewDisclosure, trialPeriodLabel } from '@/domain/subscriptionCopy';
import { sortPackagesForPaywall, toPlanPrice } from '@/domain/subscriptionOffering';
import { track, truncateReason } from '@/lib/analytics';
import { captureError } from '@/lib/crash';
import { lightImpactHaptic, selectionHaptic, successHaptic } from '@/lib/feedback';
import { PRIVACY_URL, TERMS_URL } from '@/lib/urls';
import { fetchOffering, isPurchasesConfigured, purchase, restore } from '@/services/purchases';
import { useAuthStore } from '@/state/authStore';
import { useProStore } from '@/state/proStore';
import { showDialog } from '@/state/useDialog';
import { font } from '@/theme/typography';

const SOURCE = 'onboarding';
const GOLD = { from: '#FDE68A', to: '#F59E0B', ink: '#78350F' };
const INK = '#F8FAF9';
const MUTED = 'rgba(248,250,249,0.66)';
const CARD = 'rgba(255,255,255,0.06)';
const LINE = 'rgba(255,255,255,0.12)';

/**
 * The end of onboarding: a hard paywall, built from the athlete's own answers.
 *
 * Their face and handle, "your plan is ready", the six-week climb their answers
 * produced, three benefits led by what they said stops them, and the real store
 * plans priced per week. Dark, so it reads as the moment the app changes gear.
 *
 * Hard, but never a trap: the close control fades in after a few seconds (an
 * inescapable paywall is what Play rejected), and reaching for it shows one
 * honest smaller plan before letting go. No timers, no invented prices, no
 * testimonials. See `domain/onboardingPaywall` for every decision.
 */
export function HardPaywall({
  username,
  avatarUri,
  goal,
  weeklyGoal,
  level,
  blocker,
  plan,
  onSelect,
  onNext,
}: {
  username: string;
  avatarUri: string | null;
  goal: string | null;
  weeklyGoal: number;
  level: FitnessLevel | null;
  blocker: Blocker | null;
  plan: PlanKey;
  onSelect: (p: PlanKey) => void;
  onNext: () => void;
}) {
  const insets = useSafeAreaInsets();
  const billingReady = isPurchasesConfigured();
  const [packages, setPackages] = useState<PurchasesPackage[] | null>(null);
  const [loadKey, setLoadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [closeShown, setCloseShown] = useState(false);
  const [offer, setOffer] = useState<PlanKey | null>(null);
  const [offerUsed, setOfferUsed] = useState(false);

  useEffect(() => {
    track('paywall_viewed', { source: SOURCE });
  }, []);

  useEffect(() => {
    if (!billingReady) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPackages([]);
      return;
    }
    let cancelled = false;
    setPackages(null);
    fetchOffering()
      .then((o) => {
        if (!cancelled) setPackages(sortPackagesForPaywall(o?.availablePackages ?? []));
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          captureError(error);
          setPackages([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [billingReady, loadKey]);

  const byKey = useMemo(() => {
    const m = new Map<PlanKey, PurchasesPackage>();
    for (const p of packages ?? []) {
      const k = planKeyOf(p.packageType);
      if (k && !m.has(k)) m.set(k, p);
    }
    return m;
  }, [packages]);
  const available = useMemo(() => (['year', 'month', 'week'] as const).filter((k) => byKey.has(k)), [byKey]);
  const current = resolvePlan(plan, available);
  const selected = current ? (byKey.get(current) ?? null) : null;
  const nothingToSell = packages !== null && available.length === 0;

  /* The close control waits so the offer is read — unless there is nothing to
     buy, when a wall would be a dead end. */
  useEffect(() => {
    if (nothingToSell) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCloseShown(true);
      return;
    }
    const t = setTimeout(() => setCloseShown(true), CLOSE_DELAY_MS);
    return () => clearTimeout(t);
  }, [nothingToSell]);

  const saving = useMemo(() => {
    const annual = byKey.get('year');
    if (!annual) return null;
    const others = (['month', 'week'] as const).flatMap((k) => {
      const p = byKey.get(k);
      return p ? [toPlanPrice(p)] : [];
    });
    return savingsPercent(toPlanPrice(annual), others);
  }, [byKey]);

  const buy = useCallback(
    async (pkg: PurchasesPackage) => {
      if (busy) return;
      setBusy(true);
      const uid = useAuthStore.getState().user?.uid ?? null;
      const result = await purchase(pkg, uid);
      setBusy(false);
      if (result.cancelled) {
        track('purchase_cancelled', { plan: pkg.packageType, source: SOURCE });
        return;
      }
      if (result.ok && result.isPro) {
        successHaptic();
        useProStore.getState().setPro(true);
        if (hasFreeTrial(pkg)) track('trial_started', { plan: pkg.packageType, source: SOURCE });
        track('subscribed', { plan: pkg.packageType, source: SOURCE });
        onNext();
        return;
      }
      /* Kept specific on purpose — see the same dialog in modal/paywall. */
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
      track('purchase_failed', { plan: pkg.packageType, source: SOURCE, reason: truncateReason(result.message) });
      showDialog({
        title: 'Purchase failed',
        message: result.message ?? 'Please try again.',
        tone: 'danger',
        actions: [{ label: 'Try again', variant: 'primary' }],
      });
    },
    [busy, onNext],
  );

  const onRestore = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const uid = useAuthStore.getState().user?.uid ?? null;
    const result = await restore(uid);
    setBusy(false);
    if (result.ok && result.isPro) {
      useProStore.getState().setPro(true);
      track('restore_completed', { restored: true });
      successHaptic();
      onNext();
      return;
    }
    track('restore_completed', { restored: false });
    showDialog({
      title: result.ok ? 'Nothing to restore' : 'Restore failed',
      message: result.ok ? 'No active subscription was found on this account.' : (result.message ?? 'Please try again.'),
      tone: 'info',
      actions: [{ label: 'OK', variant: 'primary' }],
    });
  }, [busy, onNext]);

  const leave = useCallback(() => {
    track('paywall_dismissed', { source: SOURCE });
    onNext();
  }, [onNext]);

  const onClose = useCallback(() => {
    if (busy) return;
    lightImpactHaptic();
    const smaller = current && !offerUsed ? exitOffer(current, available) : null;
    if (smaller) {
      setOfferUsed(true);
      setOffer(smaller);
      return;
    }
    leave();
  }, [busy, current, offerUsed, available, leave]);

  const climb = useMemo(() => sixWeekClimb(weeklyGoal, level), [weeklyGoal, level]);
  const benefits = useMemo(() => benefitsFor(blocker), [blocker]);
  const handle = username.trim();
  const trial = selected && hasFreeTrial(selected) ? trialPeriodLabel(selected) : null;
  const cta = trial ? `Start my ${trial} free` : 'Unlock my plan';

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient colors={['#04100A', '#0A2215', '#0D3320']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Glow />

      {/* Top bar: the quiet way out, and restore. */}
      <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
        {closeShown ? (
          <Animated.View entering={FadeIn.duration(600)}>
            <PressableScale onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} style={styles.close}>
              <Text style={styles.closeText}>✕</Text>
            </PressableScale>
          </Animated.View>
        ) : (
          <View style={styles.close} />
        )}
        <PressableScale onPress={() => void onRestore()} accessibilityRole="button" hitSlop={10}>
          <Text style={styles.restore}>Restore</Text>
        </PressableScale>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero: them, and the plan they just built. */}
        <Animated.View entering={FadeInDown.duration(500)} style={styles.hero}>
          <View style={styles.avatarRing}>
            <LinearGradient colors={[GOLD.from, GOLD.to]} style={[StyleSheet.absoluteFill, { borderRadius: 46 }]} />
            <View style={styles.avatarInner}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatar} contentFit="cover" />
              ) : (
                <Text style={styles.avatarLetter}>{(handle[0] ?? 'R').toUpperCase()}</Text>
              )}
            </View>
            <View style={styles.proBadge}>
              <Text style={styles.proBadgeText}>PRO</Text>
            </View>
          </View>
          <View style={styles.builtChip}>
            <Text style={styles.builtChipText}>✓ Plan 100% built</Text>
          </View>
          <Text style={styles.headline}>{paywallHeadline(handle)}</Text>
          <Text style={styles.sub}>
            {weeklyGoal} days a week · {goalPlan(goal).title}
          </Text>
        </Animated.View>

        {/* The climb their answers produced. */}
        <Animated.View entering={FadeInUp.delay(120).duration(500)} style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Your next 6 weeks</Text>
            <Text style={styles.cardTrend}>
              {climb[0]} → {climb[5]} reps/wk
            </Text>
          </View>
          <Climb values={climb} />
        </Animated.View>

        {/* Three benefits, led by their blocker. */}
        <View style={styles.benefits}>
          {benefits.map((b, i) => (
            <Animated.View key={b.title} entering={FadeInUp.delay(200 + i * 90).duration(420)} style={styles.benefit}>
              <View style={styles.benefitIcon}>
                <Text style={{ fontSize: 18 }}>{b.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.benefitTitle}>{b.title}</Text>
                <Text style={styles.benefitBody}>{b.body}</Text>
              </View>
            </Animated.View>
          ))}
        </View>

        {/* The plans. */}
        {packages === null ? (
          <Spinner color={GOLD.to} style={{ marginVertical: 24 }} />
        ) : nothingToSell ? (
          <View style={styles.unavailable}>
            <Text style={styles.unavailableText}>
              {billingReady ? 'Plans couldn’t load just now.' : 'Pro isn’t available on this build.'}
            </Text>
            {billingReady ? (
              <PressableScale onPress={() => setLoadKey((n) => n + 1)} accessibilityRole="button" style={styles.retry}>
                <Text style={styles.retryText}>Try again</Text>
              </PressableScale>
            ) : null}
          </View>
        ) : (
          <View style={styles.plans}>
            {available.map((k, i) => {
              const pkg = byKey.get(k)!;
              return (
                <Animated.View key={k} entering={FadeInUp.delay(420 + i * 80).duration(400)}>
                  <PlanCard
                    pkg={pkg}
                    selected={current === k}
                    badge={k === 'year' ? (saving ? `BEST VALUE · SAVE ${saving}%` : 'BEST VALUE') : null}
                    onPress={() => {
                      selectionHaptic();
                      onSelect(k);
                    }}
                  />
                </Animated.View>
              );
            })}
          </View>
        )}
        <Text style={styles.together}>👫 One plan covers training solo and with your partner.</Text>
      </ScrollView>

      {/* Pinned: the one action. */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 10 }]}>
        <Cta
          label={busy ? 'One moment…' : cta}
          disabled={busy || !selected}
          onPress={() => {
            if (selected) void buy(selected);
          }}
        />
        <Text style={styles.reassure}>
          {trial ? '✓ No payment now · Cancel anytime' : '✓ Cancel anytime in Google Play · Secured by Google Play'}
        </Text>
        {selected ? <Text style={styles.disclosure}>{renewDisclosure(selected)}</Text> : null}
        <View style={styles.legal}>
          <Text style={styles.legalLink} onPress={() => void Linking.openURL(TERMS_URL)}>
            Terms
          </Text>
          <Text style={styles.legalDot}>·</Text>
          <Text style={styles.legalLink} onPress={() => void Linking.openURL(PRIVACY_URL)}>
            Privacy
          </Text>
        </View>
      </View>

      {offer && byKey.get(offer) ? (
        <ExitOffer
          pkg={byKey.get(offer)!}
          from={current ?? 'year'}
          busy={busy}
          onAccept={() => {
            onSelect(offer);
            const pkg = byKey.get(offer)!;
            setOffer(null);
            void buy(pkg);
          }}
          onDecline={() => {
            setOffer(null);
            leave();
          }}
        />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */

function PlanCard({
  pkg,
  selected,
  badge,
  onPress,
}: {
  pkg: PurchasesPackage;
  selected: boolean;
  badge: string | null;
  onPress: () => void;
}) {
  const k = planKeyOf(pkg.packageType);
  const weekly = weeklyEquivalent(toPlanPrice(pkg), pkg.product.priceString, pkg.packageType);
  const title = k === 'year' ? 'Yearly' : k === 'month' ? 'Monthly' : 'Weekly';
  const big = weekly ? weekly.perWeek : pkg.product.priceString;
  const sub = weekly ? weekly.billedAs : 'billed weekly';
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}, ${pkg.product.priceString}${billingPeriodSuffix(pkg)}`}
      style={[styles.plan, selected && styles.planOn, badge ? { marginTop: 12 } : null]}
    >
      {selected ? (
        <LinearGradient
          colors={['rgba(253,230,138,0.16)', 'rgba(245,158,11,0.06)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <View style={styles.radioDot} /> : null}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.planTitle}>{title}</Text>
        <Text style={styles.planSub}>{sub}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.planPrice}>{big}</Text>
        <Text style={styles.planPer}>per week</Text>
      </View>
    </PressableScale>
  );
}

/** Six bars rising to a gold sixth week. */
function Climb({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <View style={styles.climb}>
      {values.map((v, i) => {
        const last = i === values.length - 1;
        return (
          <View key={i} style={styles.climbCol}>
            {last ? <Text style={styles.climbTop}>{v}</Text> : null}
            <Animated.View entering={FadeInUp.delay(300 + i * 90).duration(500)} style={{ height: 16 + (v / max) * 62, width: '100%' }}>
              <LinearGradient
                colors={last ? [GOLD.from, GOLD.to] : ['rgba(74,222,128,0.85)', 'rgba(22,163,74,0.6)']}
                style={styles.climbBar}
              />
            </Animated.View>
            <Text style={[styles.climbLabel, last && { color: GOLD.from }]}>{i === 0 ? 'Now' : `W${i + 1}`}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** The gold button: a slow breath and a sheen, so the eye lands on it. */
function Cta({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const reduced = useReducedMotion();
  const breath = useSharedValue(1);
  const sheen = useSharedValue(-1);
  useEffect(() => {
    if (reduced) return;
    breath.set(withRepeat(withSequence(withTiming(1.025, { duration: 1100 }), withTiming(1, { duration: 1100 })), -1));
    sheen.set(withRepeat(withTiming(1.4, { duration: 2600, easing: Easing.inOut(Easing.quad) }), -1));
    return () => {
      cancelAnimation(breath);
      cancelAnimation(sheen);
    };
  }, [reduced, breath, sheen]);
  const scale = useAnimatedStyle(() => ({ transform: [{ scale: breath.value }] }));
  const shine = useAnimatedStyle(() => ({ transform: [{ translateX: sheen.value * 260 }, { rotate: '18deg' }] }));
  return (
    <Animated.View style={[scale, disabled && { opacity: 0.6 }]}>
      <PressableScale
        onPress={() => {
          lightImpactHaptic();
          onPress();
        }}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={styles.cta}
      >
        <LinearGradient colors={[GOLD.from, GOLD.to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <Animated.View pointerEvents="none" style={[styles.sheen, shine]} />
        <Text style={styles.ctaText}>{label}</Text>
      </PressableScale>
    </Animated.View>
  );
}

/** One honest smaller plan before letting go. */
function ExitOffer({
  pkg,
  from,
  busy,
  onAccept,
  onDecline,
}: {
  pkg: PurchasesPackage;
  /** The plan they were on when they reached for the close. */
  from: PlanKey;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const insets = useSafeAreaInsets();
  const k = planKeyOf(pkg.packageType);
  const span = k === 'week' ? 'a week' : 'a month';
  useEffect(() => {
    track('paywall_viewed', { source: `${SOURCE}-exit-${k ?? 'plan'}` });
  }, [k]);
  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={styles.scrim}>
      <PressableScale onPress={onDecline} accessibilityLabel="Dismiss" style={StyleSheet.absoluteFill}>
        <View />
      </PressableScale>
      <Animated.View
        entering={SlideInDown.springify().damping(18)}
        exiting={SlideOutDown.duration(220)}
        style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}
      >
        <View style={styles.grabber} />
        <Text style={styles.sheetEmoji}>🤝</Text>
        <Text style={styles.sheetTitle}>Not ready for {from === 'month' ? 'a month' : 'a year'}?</Text>
        <Text style={styles.sheetBody}>
          Start with {span} — {pkg.product.priceString}
          {billingPeriodSuffix(pkg)}. Same plan, everything unlocked, cancel anytime.
        </Text>
        <Cta label={busy ? 'One moment…' : `Start with ${span}`} onPress={onAccept} disabled={busy} />
        <PressableScale onPress={onDecline} accessibilityRole="button" style={styles.sheetDecline}>
          <Text style={styles.sheetDeclineText}>No thanks</Text>
        </PressableScale>
      </Animated.View>
    </Animated.View>
  );
}

function Glow() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.glow, { top: -80, left: -60, backgroundColor: 'rgba(74,222,128,0.18)' }]} />
      <View style={[styles.glow, { top: 220, right: -120, backgroundColor: 'rgba(245,158,11,0.12)' }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#04100A' },
  glow: { position: 'absolute', width: 320, height: 320, borderRadius: 160 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 4 },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  closeText: font('bold', 14, { color: 'rgba(255,255,255,0.55)' }),
  restore: font('semibold', 13.5, { color: MUTED }),
  scroll: { paddingHorizontal: 20, paddingBottom: 20 },
  hero: { alignItems: 'center', marginTop: 4 },
  avatarRing: { width: 92, height: 92, borderRadius: 46, padding: 3, overflow: 'visible', alignItems: 'center', justifyContent: 'center' },
  avatarInner: {
    width: 84,
    height: 84,
    borderRadius: 42,
    overflow: 'hidden',
    backgroundColor: '#123524',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: { width: 84, height: 84 },
  avatarLetter: font('extrabold', 36, { color: GOLD.from }),
  proBadge: {
    position: 'absolute',
    bottom: -6,
    alignSelf: 'center',
    backgroundColor: GOLD.to,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 2,
    borderWidth: 2,
    borderColor: '#04100A',
  },
  proBadgeText: { ...font('extrabold', 10, { color: GOLD.ink }), letterSpacing: 1.2 },
  builtChip: { marginTop: 18, backgroundColor: 'rgba(74,222,128,0.14)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  builtChipText: font('bold', 12, { color: '#86EFAC' }),
  headline: { ...font('extrabold', 30, { color: INK, marginTop: 10 }), textAlign: 'center', letterSpacing: -0.8, lineHeight: 34 },
  sub: { ...font('medium', 14, { color: MUTED, marginTop: 6 }), textAlign: 'center' },
  card: { marginTop: 20, backgroundColor: CARD, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: LINE },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: font('bold', 14, { color: INK }),
  cardTrend: { ...font('bold', 12, { color: '#86EFAC' }), fontVariant: ['tabular-nums'] },
  climb: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 18, height: 116 },
  climbCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  climbBar: { flex: 1, borderRadius: 7 },
  climbTop: { ...font('extrabold', 12, { color: GOLD.from, marginBottom: 4 }), fontVariant: ['tabular-nums'] },
  climbLabel: font('semibold', 11, { color: MUTED, marginTop: 6 }),
  benefits: { marginTop: 18, gap: 14 },
  benefit: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  benefitIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  benefitTitle: font('bold', 15, { color: INK }),
  benefitBody: font('medium', 13, { color: MUTED, marginTop: 2, lineHeight: 18 }),
  plans: { marginTop: 22, gap: 10 },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: LINE,
    backgroundColor: CARD,
    overflow: 'visible',
  },
  planOn: { borderColor: GOLD.to },
  badge: {
    position: 'absolute',
    top: -11,
    left: 16,
    backgroundColor: GOLD.to,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  badgeText: { ...font('extrabold', 10, { color: GOLD.ink }), letterSpacing: 0.8 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: GOLD.to },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: GOLD.to },
  planTitle: font('extrabold', 16, { color: INK }),
  planSub: font('medium', 12, { color: MUTED, marginTop: 1 }),
  planPrice: { ...font('extrabold', 18, { color: INK }), fontVariant: ['tabular-nums'] },
  planPer: font('medium', 11, { color: MUTED }),
  unavailable: { alignItems: 'center', gap: 10, marginTop: 22 },
  unavailableText: { ...font('medium', 14, { color: MUTED }), textAlign: 'center' },
  retry: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: 'rgba(255,255,255,0.1)' },
  retryText: font('bold', 13.5, { color: INK }),
  together: { ...font('medium', 12.5, { color: MUTED, marginTop: 16 }), textAlign: 'center' },
  footer: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: LINE, backgroundColor: 'rgba(4,16,10,0.92)' },
  cta: { height: 58, borderRadius: 29, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  sheen: { position: 'absolute', top: -20, bottom: -20, left: -140, width: 60, backgroundColor: 'rgba(255,255,255,0.35)' },
  ctaText: { ...font('extrabold', 17, { color: GOLD.ink }), letterSpacing: 0.2 },
  reassure: { ...font('semibold', 12.5, { color: '#86EFAC', marginTop: 10 }), textAlign: 'center' },
  disclosure: { ...font('medium', 10.5, { color: 'rgba(248,250,249,0.45)', marginTop: 4, lineHeight: 14 }), textAlign: 'center' },
  legal: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 6 },
  legalLink: { ...font('semibold', 11, { color: 'rgba(248,250,249,0.55)' }), textDecorationLine: 'underline' },
  legalDot: font('semibold', 11, { color: 'rgba(248,250,249,0.35)' }),
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#0B2416', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 22, paddingTop: 10, borderWidth: 1, borderColor: LINE },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)', marginBottom: 14 },
  sheetEmoji: { fontSize: 34, textAlign: 'center' },
  sheetTitle: { ...font('extrabold', 22, { color: INK, marginTop: 6 }), textAlign: 'center' },
  sheetBody: { ...font('medium', 14, { color: MUTED, marginTop: 6, marginBottom: 18, lineHeight: 20 }), textAlign: 'center' },
  sheetDecline: { alignItems: 'center', paddingVertical: 12 },
  sheetDeclineText: font('bold', 13.5, { color: MUTED }),
});

import { CameraView, useCameraPermissions } from 'expo-camera';
import type { BarcodeScanningResult } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandedQR } from '@/components/BrandedQR';
import { ModalHeader } from '@/components/ModalHeader';
import { Avatar, PressableScale, Screen } from '@/components/ui';
import { classifyScan, friendInviteDeepLink, landingHref, type ScanTarget } from '@/domain/scanTarget';
import { track } from '@/lib/analytics';
import { successHaptic } from '@/lib/feedback';
import { friendInviteLink } from '@/lib/urls';
import { useProfileStore } from '@/state/profileStore';
import { reservedControlHeight } from '@/theme/fontScale';
import { font, scaleForRole, text } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

const RETICLE = 230;

/** What a successful read says for a beat before routing on. */
const FOUND_LABEL: Record<ScanTarget['kind'], string> = {
  couple: '🫶 Partner invite',
  duel: '⚔️ Duel invite',
  friend: '👋 Friend code',
};

/**
 * One QR surface for the whole app: scan anything RepChamp prints, or show
 * your own code.
 *
 * The couple and duel scanners each accept only their own kind of code, so
 * pointing one at the other's QR silently did nothing. This one classifies the
 * scan (`domain/scanTarget`) and hands it to the route that already owns that
 * flow — `couple/join`, `duel/join`, `modal/add-friend` — so no join logic is
 * repeated here and a phone camera opening the same link lands in the same
 * place. Friends had no code at all; "My code" is theirs.
 *
 * Camera via `expo-camera`, for the reason given in `couple-scan.tsx`.
 */
export default function ScanScreen() {
  const [tab, setTab] = useState<'scan' | 'mine'>('scan');

  return (
    <Screen scroll={false}>
      <ModalHeader title="Scan & connect" />
      <View style={styles.tabs} accessibilityRole="tablist">
        <TabButton label="Scan a code" active={tab === 'scan'} onPress={() => setTab('scan')} />
        <TabButton label="My code" active={tab === 'mine'} onPress={() => setTab('mine')} />
      </View>
      {tab === 'scan' ? <Scanner onShowMine={() => setTab('mine')} /> : <MyCode />}
    </Screen>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={[styles.tab, active && styles.tabActive]}
    >
      <Text style={font('extrabold', 13, { color: active ? palette.white : palette.slate600 })}>
        {label}
      </Text>
    </PressableScale>
  );
}

/* ------------------------------------------------------------------ *
 * Scan
 * ------------------------------------------------------------------ */

function Scanner({ onShowMine }: { onShowMine: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [found, setFound] = useState<ScanTarget | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);

  /* The sweep is the one thing on this screen that says "working" while
     nothing is found — a still reticle over a live feed reads as frozen. */
  const sweep = useSharedValue(0);
  useEffect(() => {
    sweep.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [sweep]);
  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sweep.value * (RETICLE - 6) }],
  }));

  const route = useCallback((target: ScanTarget) => router.replace(landingHref(target)), [router]);

  const onBarcodeScanned = useCallback(
    (result: BarcodeScanningResult) => {
      if (handled.current || !result.data) return;
      const target = classifyScan(result.data);
      if (!target) return; // Someone else's code — keep looking.

      // Latched: `onBarcodeScanned` keeps firing while the code is in view.
      handled.current = true;
      successHaptic();
      track('qr_scanned', { kind: target.kind });
      setFound(target);
      // Long enough to read what was found; short enough not to feel like a wait.
      setTimeout(() => route(target), 650);
    },
    [route],
  );

  const granted = permission?.granted ?? false;

  return (
    <>
      <View style={styles.stage}>
        {granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={found ? undefined : onBarcodeScanned}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.center]}>
            <Text style={styles.placeholder}>
              {permission && !permission.canAskAgain
                ? 'Camera access is off. Turn it on in Settings to scan.'
                : 'Camera access is needed to scan.'}
            </Text>
          </View>
        )}

        <View pointerEvents="none" style={styles.reticleWrap}>
          <View style={[styles.reticle, found && styles.reticleFound]}>
            {found ? null : <Animated.View style={[styles.sweep, sweepStyle]} />}
          </View>
        </View>

        {found ? (
          <Animated.View entering={FadeIn.duration(180)} style={styles.foundPill}>
            <Text style={font('extrabold', 15, { color: palette.ink })}>
              {FOUND_LABEL[found.kind]} ✓
            </Text>
          </Animated.View>
        ) : null}
      </View>

      <Text style={[text.caption, styles.hint]}>
        Partner invite, duel lobby or friend code — point at any RepChamp QR.
      </Text>

      <PressableScale
        onPress={onShowMine}
        accessibilityRole="button"
        style={[styles.secondary, { marginBottom: insets.bottom + 12 }]}
      >
        <Text style={font('extrabold', 14, { color: palette.ink })} {...scaleForRole('control')}>
          Show my code instead
        </Text>
      </PressableScale>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * My code
 * ------------------------------------------------------------------ */

function MyCode() {
  const router = useRouter();
  const { fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const username = useProfileStore((s) => s.username);
  const displayName = useProfileStore((s) => s.displayName);
  const avatarUri = useProfileStore((s) => s.avatarUri);

  /* No handle, no code: the friend link is keyed on it. Say so and offer the
     fix, rather than printing a QR for a placeholder name that belongs to
     nobody (add-friend's own link falls back to "champion"). */
  if (!username) {
    return (
      <View style={[styles.mineCard, styles.center]}>
        <Text style={font('extrabold', 17, { color: palette.ink })}>Pick a username first</Text>
        <Text style={[text.caption, styles.mineCaption]}>
          Your code points to @yourname, so friends can find exactly you.
        </Text>
        <PressableScale
          onPress={() => router.push('/modal/username')}
          accessibilityRole="button"
          style={[styles.primary, { minHeight: reservedControlHeight(48, fontScale) }]}
        >
          <Text style={font('extrabold', 14, { color: palette.white })}>Choose username</Text>
        </PressableScale>
      </View>
    );
  }

  const share = () => {
    track('share_opened', { kind: 'friend-qr' });
    void Share.share({ message: `Add me on RepChamp and let's race reps: ${friendInviteLink(username)}` });
  };

  return (
    <View style={{ flex: 1, marginBottom: insets.bottom + 12 }}>
      <Animated.View entering={FadeIn.duration(220)} style={styles.mineCard}>
        <Avatar
          initial={(displayName?.charAt(0) || username.charAt(0)).toUpperCase()}
          uri={avatarUri}
          size={56}
        />
        <Text style={[font('extrabold', 19, { color: palette.ink }), styles.mineName]}>
          {displayName?.trim() || username}
        </Text>
        <Text style={font('bold', 14, { color: palette.green700 })}>@{username}</Text>
        <View style={styles.qrWrap}>
          <BrandedQR
            payload={friendInviteDeepLink(username)}
            size={220}
            accessibilityLabel={`RepChamp friend code for @${username}`}
          />
        </View>
        <Text style={[text.caption, styles.mineCaption]}>
          Friends scan this in RepChamp — or with their phone camera — to add you and race.
        </Text>
      </Animated.View>
      <PressableScale
        onPress={share}
        accessibilityRole="button"
        style={[styles.primary, { minHeight: reservedControlHeight(52, fontScale) }]}
      >
        <Text style={font('extrabold', 15, { color: palette.white })} {...scaleForRole('control')}>
          Share my link
        </Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    backgroundColor: palette.divider,
    borderRadius: radius['2xl'],
    padding: 4,
    marginTop: 4,
    marginBottom: 12,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.xl },
  tabActive: { backgroundColor: palette.ink },
  stage: { flex: 1, borderRadius: radius['3xl'], overflow: 'hidden', backgroundColor: palette.ink },
  center: { alignItems: 'center', justifyContent: 'center' },
  placeholder: {
    ...text.caption,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  reticleWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  reticle: {
    width: RETICLE,
    height: RETICLE,
    borderRadius: radius['4xl'],
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
    overflow: 'hidden',
  },
  reticleFound: { borderColor: palette.green400 },
  sweep: {
    height: 3,
    marginHorizontal: 14,
    borderRadius: 2,
    backgroundColor: palette.green400,
    shadowColor: palette.green400,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 4,
  },
  foundPill: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    backgroundColor: palette.white,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
  },
  hint: { textAlign: 'center', marginTop: 12 },
  secondary: {
    marginTop: 12,
    minHeight: 52,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mineCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.white,
    borderRadius: radius['3xl'],
    padding: 20,
  },
  mineName: { marginTop: 10 },
  qrWrap: { marginTop: 16, padding: 12, borderRadius: radius['2xl'], backgroundColor: palette.white },
  mineCaption: { textAlign: 'center', marginTop: 14, paddingHorizontal: 12 },
  primary: {
    marginTop: 12,
    borderRadius: radius['2xl'],
    backgroundColor: palette.green600,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
});

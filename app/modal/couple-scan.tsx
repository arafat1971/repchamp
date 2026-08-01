import { CameraView, useCameraPermissions } from 'expo-camera';
import type { BarcodeScanningResult } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalHeader } from '@/components/ModalHeader';
import { PressableScale, Screen } from '@/components/ui';
import { normalizePairCode, parseInviteCode } from '@/domain/couple';
import { track } from '@/lib/analytics';
import { successHaptic } from '@/lib/feedback';
import { joinCoupleByCode } from '@/services/coupleService';
import { useAuthStore } from '@/state/authStore';
import { showDialog } from '@/state/useDialog';
import { useProfileStore } from '@/state/profileStore';
import { font, text } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

/**
 * Scan a partner's couple QR to pair.
 *
 * Uses `expo-camera`'s `CameraView` with QR barcode scanning — NOT
 * react-native-vision-camera. Vision-camera (which the app already ships for rep
 * counting) exposes an object/code scanner in its TypeScript API, but its
 * Android native factory throws "CameraObjectOutput is not available on Android"
 * (`HybridCameraFactory.kt`), so it can't scan on the target device. expo-camera
 * scans on both platforms.
 *
 * The QR encodes a bare 6-char pair code; on a valid read we hand it to
 * `joinCoupleByCode` and pop back to the couple screen, which is already
 * subscribed and flips to the paired state. `handled` latches the first accepted
 * code because `onBarcodeScanned` keeps firing while the code is in view.
 */
export default function CoupleScanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const uid = useAuthStore((s) => s.user?.uid);
  const displayName = useProfileStore((s) => s.displayName);
  const avatarUri = useProfileStore((s) => s.avatarUri);

  const [permission, requestPermission] = useCameraPermissions();
  const [joining, setJoining] = useState(false);
  const handled = useRef(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);

  const pair = useCallback(
    async (rawScan: string) => {
      if (handled.current) return;
      if (!uid) {
        showDialog({
          title: 'Still signing in',
          message: 'Wait a moment and scan again, or enter the invite code by hand.',
          tone: 'info',
          actions: [
            { label: 'Enter code', variant: 'primary', onPress: () => router.replace('/modal/couple-invite') },
            { label: 'OK', variant: 'cancel' },
          ],
        });
        return;
      }
      // A scanned QR may hold the invite *link* or the bare code — accept either.
      const code = parseInviteCode(rawScan) ?? normalizePairCode(rawScan);
      if (!code) return; // Not one of our codes — keep scanning.

      handled.current = true;
      setJoining(true);
      try {
        await joinCoupleByCode(code, { uid, displayName, avatarUrl: avatarUri });
        track('couple_paired', { via: 'qr' });
        successHaptic();
        router.back();
      } catch (error) {
        // Let them try again rather than dead-end — unlatch and surface why.
        handled.current = false;
        setJoining(false);
        showDialog({
          title: 'Could not pair',
          message: error instanceof Error ? error.message : 'That code did not work. Try again.',
          tone: 'danger',
          actions: [{ label: 'Try again', variant: 'primary' }],
        });
      }
    },
    [uid, displayName, avatarUri, router],
  );

  const onBarcodeScanned = useCallback(
    (result: BarcodeScanningResult) => {
      if (result.data) void pair(result.data);
    },
    [pair],
  );

  const granted = permission?.granted ?? false;

  return (
    <Screen scroll={false}>
      <ModalHeader title="Scan your partner's code" />

      <View style={styles.stage}>
        {granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            // Stop delivering scans while we're joining, so we never double-fire.
            onBarcodeScanned={joining ? undefined : onBarcodeScanned}
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

        {/* Reticle — a bracketed square to aim the code into. */}
        <View pointerEvents="none" style={styles.reticleWrap}>
          <View style={styles.reticle} />
        </View>

        {joining ? (
          <View style={[StyleSheet.absoluteFill, styles.center, styles.dim]}>
            <ActivityIndicator color={palette.white} />
            <Text style={styles.joiningText}>Pairing…</Text>
          </View>
        ) : null}
      </View>

      <Text style={[text.caption, styles.hint]}>
        Point your camera at the QR on your partner&apos;s phone.
      </Text>

      <PressableScale
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Enter the code by hand instead"
        style={[styles.manual, { marginBottom: insets.bottom + 12 }]}
      >
        <Text style={font('extrabold', 14, { color: palette.ink })}>Enter code by hand</Text>
      </PressableScale>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    borderRadius: radius['3xl'],
    overflow: 'hidden',
    backgroundColor: palette.ink,
    marginTop: 8,
  },
  center: { alignItems: 'center', justifyContent: 'center' },
  dim: { backgroundColor: 'rgba(9,14,11,0.6)' },
  placeholder: {
    ...text.caption,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  reticleWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticle: {
    width: 220,
    height: 220,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  joiningText: { ...font('extrabold', 15, { color: palette.white }), marginTop: 12 },
  hint: { textAlign: 'center', marginTop: 12 },
  manual: {
    marginTop: 12,
    height: 52,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

import { CameraView, useCameraPermissions } from 'expo-camera';
import type { BarcodeScanningResult } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalHeader } from '@/components/ModalHeader';
import { PressableScale, Screen } from '@/components/ui';
import { showDialog } from '@/state/useDialog';
import { isJoinableByQr, isOwnDuelInvite, parseDuelInvite } from '@/domain/duelInvite';
import { fetchDuel } from '@/services/duelService';
import { useAuthStore } from '@/state/authStore';
import { font, text } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';
import { track } from '@/lib/analytics';

/**
 * Scan a rival's duel QR and drop into their live race.
 *
 * Mirrors `couple-scan` deliberately, including the choice of `expo-camera`
 * over vision-camera: vision-camera ships a code scanner in its types, but its
 * Android factory throws "CameraObjectOutput is not available on Android", so
 * it cannot scan on the target device.
 *
 * What differs from pairing is the checks before joining. A couple code is
 * either valid or not; a duel can also be *stale* — already joined by someone
 * else, aimed at a specific athlete, or the scanner's own code. Each of those
 * is caught here and explained, because the alternative is routing into the
 * duel screen and letting a Firestore transaction fail with something an
 * athlete cannot act on.
 *
 * `handled` latches the first accepted code: `onBarcodeScanned` keeps firing
 * for as long as the code is in frame.
 */
export default function DuelScanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const uid = useAuthStore((s) => s.user?.uid);

  const [permission, requestPermission] = useCameraPermissions();
  const [joining, setJoining] = useState(false);
  const handled = useRef(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);

  /** Unlatch so a corrected aim can try again, rather than dead-ending. */
  const retry = useCallback((title: string, message: string) => {
    handled.current = false;
    setJoining(false);
    showDialog({
      title,
      message,
      tone: 'danger',
      actions: [{ label: 'Try again', variant: 'primary' }],
    });
  }, []);

  const join = useCallback(
    async (rawScan: string) => {
      if (handled.current) return;

      const duelId = parseDuelInvite(rawScan);
      if (!duelId) return; // Not one of our codes — keep scanning silently.

      if (!uid) {
        showDialog({
          title: 'Still signing in',
          message: 'Wait a moment and scan again.',
          tone: 'info',
          actions: [{ label: 'OK', variant: 'cancel' }],
        });
        return;
      }

      handled.current = true;
      setJoining(true);

      try {
        const duel = await fetchDuel(duelId);
        if (!duel) {
          retry('Duel not found', 'That code has expired, or the duel was cancelled.');
          return;
        }
        if (isOwnDuelInvite(duel, uid)) {
          retry('That’s your own code', 'Show it to your rival — they scan it, not you.');
          return;
        }
        if (!isJoinableByQr(duel)) {
          retry('Too late', 'Someone already took this duel. Ask for a fresh code.');
          return;
        }

        // Seating happens on the duel screen, which already owns the join
        // transaction, the live subscription and the countdown into the set.
        // Routing there rather than joining here keeps one path into a race.
        track('duel_joined', { via: 'qr' });
        router.replace({
          pathname: '/duel/[id]',
          params: { id: duelId, role: 'guest', exercise: duel.exercise, duration: String(duel.duration) },
        });
      } catch (error) {
        retry(
          'Could not join',
          error instanceof Error ? error.message : 'That code did not work. Try again.',
        );
      }
    },
    [uid, retry, router],
  );

  const onBarcodeScanned = useCallback(
    (result: BarcodeScanningResult) => {
      if (result.data) void join(result.data);
    },
    [join],
  );

  const granted = permission?.granted ?? false;

  return (
    <Screen scroll={false}>
      <ModalHeader title="Scan a duel code" />

      <View style={styles.stage}>
        {granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            // Stop delivering scans while joining, so we never double-fire.
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
            <Text style={styles.joiningText}>Joining…</Text>
          </View>
        ) : null}
      </View>

      <Text style={[text.caption, styles.hint]}>
        Point your camera at the QR on your rival&apos;s phone.
      </Text>

      <PressableScale
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Cancel scanning"
        style={[styles.manual, { marginBottom: insets.bottom + 12 }]}
      >
        <Text style={font('extrabold', 14, { color: palette.ink })}>Cancel</Text>
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
    borderRadius: radius['4xl'],
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

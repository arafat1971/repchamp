/**
 * Firebase App Check — attest that a write comes from the genuine app.
 *
 * The Firestore rules cap what a client *may* write (owner-only, XP ceilings),
 * but on their own they can't tell a real install from a script holding a copy
 * of the public config — so a determined cheater could still POST inflated
 * scores. App Check closes that: each request carries a short-lived token minted
 * by the platform attestation service (Play Integrity on Android, DeviceCheck /
 * App Attest on iOS). With enforcement on in the Firebase console, requests
 * without a valid token are rejected before the rules even run.
 *
 * Initialised once at startup, after Firebase is up. No-ops when Firebase isn't
 * configured (the placeholder build has nothing to attest against), so wiring it
 * is always safe — exactly like the services in `src/services/*`.
 *
 * ⚠️ Two things must be done in the Firebase console for this to bite (see
 * FIREBASE_SETUP.md): register the app's Play Integrity / App Attest provider,
 * and turn on *enforcement* for Firestore & Storage. Until enforcement is on,
 * tokens are collected but not required — so you can ship this, watch the App
 * Check metrics fill in, and flip enforcement only once real traffic looks
 * healthy, with zero risk of locking out live users.
 */

// Importing the package for its side effect: it registers `appCheck()` on the
// Firebase app instance. The provider class is re-exported type-only from the
// package's public types (a packaging quirk), so we construct it through the
// instance's `newReactNativeFirebaseAppCheckProvider()` factory instead — which
// is a real runtime value — rather than `new`-ing the type-only export.
import '@react-native-firebase/app-check';

import { firebase, isFirebaseConfigured } from '@/lib/firebase';
import { captureError } from '@/lib/crash';

let ready = false;
let inFlight: Promise<void> | null = null;

/**
 * Activate App Check. Idempotent and best-effort: a failure to initialise must
 * never take down app start (the request would just go un-attested), so it's
 * caught and reported rather than thrown.
 *
 * Only marks ready after a successful init so a transient failure can retry on
 * the next call (e.g. after Play Integrity warms up).
 */
export async function initAppCheck(): Promise<void> {
  if (ready || !isFirebaseConfigured()) return;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const appCheck = firebase.app().appCheck();
      // The RN Firebase provider picks Play Integrity on Android and
      // DeviceCheck/App Attest on iOS. `isTokenAutoRefreshEnabled` keeps a fresh
      // token ready so live requests never block on minting one.
      const provider = appCheck.newReactNativeFirebaseAppCheckProvider();
      provider.configure({
        android: { provider: 'playIntegrity' },
        apple: { provider: 'appAttestWithDeviceCheckFallback' },
      });
      await appCheck.initializeAppCheck({
        provider,
        isTokenAutoRefreshEnabled: true,
      });
      ready = true;
    } catch (error) {
      // Attestation unavailable (emulator, misconfig) — degrade to un-attested
      // requests rather than crashing. With enforcement off this is invisible;
      // with it on, those requests fail closed, which is the safe direction.
      captureError(error);
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

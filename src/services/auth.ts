/**
 * Authentication service — thin wrapper over React Native Firebase Auth.
 *
 * Design: the app should never *block* on auth. A first-run athlete gets an
 * anonymous account transparently so their local training data has a cloud
 * home immediately; they can later "upgrade" that same account to email or
 * Google without losing history (Firebase account linking preserves the uid).
 *
 * When Firebase is not configured every call resolves to a deterministic local
 * pseudo-user so the UI (avatars, "signed in as…") still renders sensibly.
 */

import auth, {
  type FirebaseAuthTypes,
} from '@react-native-firebase/auth';
import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';

import { buildCloudProgressSlice } from '@/domain/cloudProgress';
import {
  isValidEmail,
  isValidPassword,
  normalizeEmail,
  passwordError,
} from '@/domain/input';
import { googleWebClientId as configuredGoogleWebClientId } from '@/lib/config';
import { isFirebaseConfigured } from '@/lib/firebase';
import { upsertProfile } from '@/services/userService';
import { useProfileStore } from '@/state/profileStore';

export interface AuthUser {
  uid: string;
  isAnonymous: boolean;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

/**
 * The Firebase "Web client" OAuth id, required by Google Sign-In.
 *
 * Read from app config rather than hardcoded: it is only present once Google
 * sign-in has actually been enabled in the Firebase console. Until then
 * `isGoogleAuthConfigured()` is false and the UI hides the Google button
 * instead of offering a control that would throw when tapped.
 */
export function googleWebClientId(): string | null {
  return configuredGoogleWebClientId() ?? null;
}

/** True when Google sign-in can actually complete (Firebase + a web client id). */
export function isGoogleAuthConfigured(): boolean {
  return isFirebaseConfigured() && googleWebClientId() !== null;
}

/** Stable local identity used before/without a backend. Exported so authStore
 *  can assign it when Firebase is unconfigured (otherwise `user` stays null and
 *  every cloud-gated screen dead-ends). */
const LOCAL_USER: AuthUser = {
  uid: 'local-device-user',
  isAnonymous: true,
  email: null,
  displayName: null,
  photoURL: null,
};

function toAuthUser(u: FirebaseAuthTypes.User): AuthUser {
  return {
    uid: u.uid,
    isAnonymous: u.isAnonymous,
    email: u.email,
    displayName: u.displayName,
    photoURL: u.photoURL,
  };
}

/**
 * Subscribe to auth state. Returns an unsubscribe fn.
 *
 * Without Firebase it fires once with the local user and never again — the
 * caller's contract (one initial emission) is preserved either way.
 */
export function onAuthChange(cb: (user: AuthUser | null) => void): () => void {
  if (!isFirebaseConfigured()) {
    cb(LOCAL_USER);
    return () => {};
  }
  return auth().onAuthStateChanged((u) => cb(u ? toAuthUser(u) : null));
}

/**
 * Flush local progress onto the *current* Firebase uid before a cross-uid
 * sign-in. Returns false when there was progress to save but the write failed
 * — callers must abort the account switch so authStore.reset() cannot wipe it.
 */
async function flushLocalProfileToCurrentUid(): Promise<boolean> {
  if (!isFirebaseConfigured()) return true;
  const current = auth().currentUser;
  if (!current) return true;
  const p = useProfileStore.getState();
  const hasProgress = p.onboarded || p.totalXp > 0 || p.sessions.length > 0;
  if (!hasProgress) return true;
  try {
    const progress = buildCloudProgressSlice({
      sessions: p.sessions,
      programme: p.programme,
    });
    return await upsertProfile({
      uid: current.uid,
      username: (p.username || 'champion').toLowerCase(),
      displayName: p.displayName,
      avatarUrl: p.avatarUri,
      weeklyGoal: p.weeklyGoal,
      totalXp: p.totalXp,
      personalBests: p.personalBests,
      onboarded: p.onboarded,
      pairingBonusClaimed: p.pairingBonusClaimed,
      pairingBonusUntil: p.pairingBonusUntil,
      trainedDays: progress.trainedDays,
      weekKey: progress.weekKey,
      weekXp: progress.weekXp,
      weekExerciseReps: progress.weekExerciseReps,
      programme: progress.programme,
    });
  } catch {
    return false;
  }
}

const ACCOUNT_SWITCH_FLUSH_ERROR =
  'Could not save your progress before switching accounts. Check your connection and try again.';

/** Ensure there is *some* signed-in user; creates an anonymous one if needed. */
export async function ensureSignedIn(): Promise<AuthUser> {
  if (!isFirebaseConfigured()) return LOCAL_USER;

  const current = auth().currentUser;
  if (current) return toAuthUser(current);

  const cred = await auth().signInAnonymously();
  return toAuthUser(cred.user);
}

export async function signInWithEmail(email: string, password: string): Promise<AuthUser> {
  if (!isFirebaseConfigured()) return LOCAL_USER;
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized) || !password) {
    throw new Error('Enter a valid email and password.');
  }

  const credential = auth.EmailAuthProvider.credential(normalized, password);
  const current = auth().currentUser;

  // Link onto the anonymous uid when present so local/cloud history carries over
  // (same pattern as Google / sign-up). Existing email accounts fall through to
  // a normal sign-in after `credential-already-in-use`.
  if (current?.isAnonymous) {
    try {
      const linked = await current.linkWithCredential(credential);
      return toAuthUser(linked.user);
    } catch (linkError) {
      if (!isCredentialAlreadyInUse(linkError)) throw linkError;
      // Existing email account — park anon progress before the uid switches.
      if (!(await flushLocalProfileToCurrentUid())) {
        throw new Error(ACCOUNT_SWITCH_FLUSH_ERROR);
      }
    }
  }

  const cred = await auth().signInWithEmailAndPassword(normalized, password);
  return toAuthUser(cred.user);
}

/**
 * Create an email account. If the athlete is currently anonymous we *link*
 * rather than create, so their existing uid — and all cloud data under it —
 * carries over.
 */
export async function signUpWithEmail(email: string, password: string): Promise<AuthUser> {
  if (!isFirebaseConfigured()) return LOCAL_USER;

  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) {
    throw new Error('Enter a valid email address.');
  }
  const pwErr = passwordError(password);
  if (pwErr || !isValidPassword(password)) {
    throw new Error(pwErr ?? 'Password is invalid.');
  }

  const current = auth().currentUser;
  const credential = auth.EmailAuthProvider.credential(normalized, password);

  if (current?.isAnonymous) {
    const linked = await current.linkWithCredential(credential);
    return toAuthUser(linked.user);
  }
  const created = await auth().createUserWithEmailAndPassword(normalized, password);
  return toAuthUser(created.user);
}

/**
 * Google sign-in. `webClientId` comes from the Firebase console (OAuth 2.0
 * "Web client"). Also links onto an anonymous account when present.
 *
 * If the Google account is already tied to another Firebase user, linking
 * fails with `credential-already-in-use` — we then sign in to that account
 * instead of leaving the athlete stuck on the generic failure toast.
 */
export async function signInWithGoogle(webClientId?: string): Promise<AuthUser> {
  if (!isFirebaseConfigured()) return LOCAL_USER;

  const clientId = webClientId ?? googleWebClientId();
  if (!clientId) {
    throw new Error(
      'Google sign-in is not configured: set extra.googleWebClientId in app.json',
    );
  }

  try {
    GoogleSignin.configure({ webClientId: clientId });
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    const result = await GoogleSignin.signIn();
    const idToken = result.data?.idToken;
    if (!idToken) throw new Error('Google sign-in returned no ID token');

    const googleCredential = auth.GoogleAuthProvider.credential(idToken);
    const current = auth().currentUser;

    if (current?.isAnonymous) {
      try {
        const linked = await current.linkWithCredential(googleCredential);
        return toAuthUser(linked.user);
      } catch (linkError) {
        if (!isCredentialAlreadyInUse(linkError)) throw linkError;
        // Existing Google account — park anon progress before the uid switches.
        if (!(await flushLocalProfileToCurrentUid())) {
          throw new Error(ACCOUNT_SWITCH_FLUSH_ERROR);
        }
        const signed = await auth().signInWithCredential(googleCredential);
        return toAuthUser(signed.user);
      }
    }
    const signed = await auth().signInWithCredential(googleCredential);
    return toAuthUser(signed.user);
  } catch (error) {
    if (isGoogleCancel(error)) throw error;
    throw new Error(formatGoogleSignInError(error));
  }
}

export async function signOut(): Promise<void> {
  if (!isFirebaseConfigured()) return;
  try {
    await GoogleSignin.signOut();
  } catch {
    // Not signed in with Google — fine.
  }
  await auth().signOut();
}

/** Maps Google's cancel/in-progress codes to a friendly discriminator. */
export function isGoogleCancel(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  return code === statusCodes.SIGN_IN_CANCELLED || code === statusCodes.IN_PROGRESS;
}

function isCredentialAlreadyInUse(error: unknown): boolean {
  const code = String((error as { code?: string })?.code ?? '');
  return (
    code === 'auth/credential-already-in-use' ||
    code === 'auth/email-already-in-use' ||
    code === 'auth/account-exists-with-different-credential'
  );
}

/** Human-readable Google / Firebase auth failures for the UI. */
export function formatGoogleSignInError(error: unknown): string {
  const code = String((error as { code?: string | number })?.code ?? '');
  const message = error instanceof Error ? error.message : String(error ?? '');

  if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
    return 'Google Play Services is missing or outdated on this device.';
  }
  // Android ApiException status 10 — SHA fingerprint / OAuth client mismatch.
  if (
    code === '10' ||
    code === 'DEVELOPER_ERROR' ||
    /DEVELOPER_ERROR|\bstatus code:\s*10\b/i.test(message)
  ) {
    return 'Google Sign-In isn’t set up for this build. Add the signing keystore’s SHA-1 in Firebase → Project settings → Android app (for local debug builds: android/app/debug.keystore), then download a fresh google-services.json.';
  }
  if (/network/i.test(code) || /network/i.test(message)) {
    return 'Network error during Google Sign-In. Check your connection and try again.';
  }
  if (message && message !== 'Error' && !/^\[.*\]$/.test(message)) {
    return message;
  }
  return "Couldn't sign in with Google. Please try again.";
}

export { LOCAL_USER };

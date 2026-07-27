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

import { isFirebaseConfigured } from '@/lib/firebase';

export interface AuthUser {
  uid: string;
  isAnonymous: boolean;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

/** Stable local identity used before/without a backend. */
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
  const cred = await auth().signInWithEmailAndPassword(email.trim(), password);
  return toAuthUser(cred.user);
}

/**
 * Create an email account. If the athlete is currently anonymous we *link*
 * rather than create, so their existing uid — and all cloud data under it —
 * carries over.
 */
export async function signUpWithEmail(email: string, password: string): Promise<AuthUser> {
  if (!isFirebaseConfigured()) return LOCAL_USER;

  const current = auth().currentUser;
  const credential = auth.EmailAuthProvider.credential(email.trim(), password);

  if (current?.isAnonymous) {
    const linked = await current.linkWithCredential(credential);
    return toAuthUser(linked.user);
  }
  const created = await auth().createUserWithEmailAndPassword(email.trim(), password);
  return toAuthUser(created.user);
}

/**
 * Google sign-in. `webClientId` comes from the Firebase console (OAuth 2.0
 * "Web client"). Also links onto an anonymous account when present.
 */
export async function signInWithGoogle(webClientId: string): Promise<AuthUser> {
  if (!isFirebaseConfigured()) return LOCAL_USER;

  GoogleSignin.configure({ webClientId });
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  const result = await GoogleSignin.signIn();
  const idToken = result.data?.idToken;
  if (!idToken) throw new Error('Google sign-in returned no ID token');

  const googleCredential = auth.GoogleAuthProvider.credential(idToken);
  const current = auth().currentUser;

  if (current?.isAnonymous) {
    const linked = await current.linkWithCredential(googleCredential);
    return toAuthUser(linked.user);
  }
  const signed = await auth().signInWithCredential(googleCredential);
  return toAuthUser(signed.user);
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

export { LOCAL_USER };

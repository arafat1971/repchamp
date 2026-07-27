/**
 * Firebase bootstrap and the single "is the backend live?" guard.
 *
 * The whole point of this module is that the rest of the app must run whether
 * or not Firebase has been provisioned yet. React Native Firebase reads its
 * credentials from the native `google-services.json` / `GoogleService-Info.plist`
 * that ship in the build — there is no JS config to check. So before the app is
 * wired to a real project the native SDK initialises a placeholder app whose
 * project id is the all-zeros sentinel we ship in the templates.
 *
 * `isFirebaseConfigured()` returns false in that state, and every service in
 * `src/services/*` falls back to the local simulation (bot opponents, hardcoded
 * leaderboard) so the app is fully usable offline and pre-provisioning. Once you
 * drop in real credential files and rebuild the dev-client, this flips to true
 * and the same call sites start reading/writing the cloud — no other code
 * changes needed.
 *
 * See FIREBASE_SETUP.md for the provisioning checklist.
 */

import firebase from '@react-native-firebase/app';

/** The project id we ship in the credential templates. Real projects never use it. */
const PLACEHOLDER_PROJECT_ID = 'repchamp-placeholder';

let cachedConfigured: boolean | null = null;

/**
 * True when the app is wired to a real Firebase project.
 *
 * Cached after the first call — the native app options don't change at runtime.
 * Guarded in a try/catch because on a build with no google-services file at all
 * the native module can throw on access rather than return a placeholder.
 */
export function isFirebaseConfigured(): boolean {
  if (cachedConfigured !== null) return cachedConfigured;

  try {
    const options = firebase.app().options;
    const projectId = options.projectId ?? '';
    cachedConfigured =
      projectId.length > 0 &&
      projectId !== PLACEHOLDER_PROJECT_ID &&
      // The all-zeros EAS/GCP sentinel we also ship in templates.
      !projectId.startsWith('00000000');
  } catch {
    cachedConfigured = false;
  }

  return cachedConfigured;
}

/** For tests / settings screens: a human-readable backend status. */
export function firebaseStatus(): 'live' | 'not-configured' {
  return isFirebaseConfigured() ? 'live' : 'not-configured';
}

export { firebase };

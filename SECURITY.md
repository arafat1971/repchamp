# RepChamp security

## Protect API keys

- **Public SDK keys only** in the app: PostHog `phc_`, RevenueCat `goog_` / `appl_`, Sentry DSN, Google OAuth web client id. These are extractable from any binary — that is normal for mobile.
- Never put RevenueCat `sk_`, Firebase Admin, or personal API tokens in `app.json` or `EXPO_PUBLIC_*`.
- Load overrides via `EXPO_PUBLIC_*` (EAS Secrets) through `app.config.js` → `src/lib/config.ts`, which rejects secret-shaped keys.
- Native Firebase configs (`google-services.json`, `GoogleService-Info.plist`) stay gitignored; ship them via CI / EAS secrets.

## Secure backend APIs

- There is no custom REST API today. App data goes through **Firebase Auth + Firestore / Storage** with `firestore.rules` and `storage.rules`.
- Owner-scoped writes; duel / couple seat freezes; push tokens under `users/{uid}/private` (owner-only).
- Enable **App Check** (Play Integrity) and enforce once metrics look clean — see `FIREBASE_SETUP.md`.

## HTTPS

- Product URLs are HTTPS (`src/lib/urls.ts`, PostHog, Sentry).
- `assertHttps` refuses cleartext hosts for analytics / crash init.
- Firebase and Play Billing use TLS by default.

## Validate user input

- Shared rules in `src/domain/input.ts` (username, email, password, display name).
- Applied in onboarding, add-friend, auth signup, and profile / score upserts.
- Firestore rules also cap string lengths and numeric ranges.

## Prevent unauthorized access

- Auth required for profile, leaderboard, duel, couple, and matchmaking paths (as scoped in rules).
- Couples: `get` for members or pending invite-by-code; `list` only for members.
- Avatars: authenticated read; owner write with size / type caps (JPEG/PNG/WebP, 2 MB).
- Billing truth is RevenueCat + Play — not a spoofable local `isPro` flag.

## Social safety (UGC)

- **Report** — `reports/{id}` create-only; reasons + optional note; rate-limited client-side.
- **Block** — `users/{uid}/blocks/{blockedUid}`; removes friend edge; filters discovery / challenges.
- **Usernames** — reserved names + light language filter in `src/domain/safety.ts`.
- **Avatars** — uploaded via Storage with HTTPS URL only on the public profile; remove photo supported.
- UI: friend profile Report / Block; Settings → Blocked users; legal copy describes the process.

Deploy rule changes:

```bash
firebase deploy --only firestore:rules,storage
```

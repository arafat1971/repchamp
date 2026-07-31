# Audit & Gap Status

Snapshot of the app's readiness gaps, split by who can close them. Last swept 2026-07-26.

Health at time of audit: **312 tests pass, 0 type errors, Android build succeeds and
runs on device** (Pixel 7a). The bones are solid; gaps are at the edges.

---

## ✅ Closed in code (this session)

### Couple-document spoofing hole — FIXED & DEPLOYED
`firestore.rules` `isMemberUpdate()` previously froze only `memberUids`, so a member
could write any `totalReps` / `trainedDays` and fake a huge combined total or streak.
Now the update rule also:
- restricts the writable field set to `members`, `nudge`, `pending`, `pairedAt`
  (id and `createdAt` are frozen),
- pins both member objects to the same two uids in the same order (no seat swap, no
  third body),
- caps each member's `totalReps` to a sane ceiling (mirrors the leaderboard's
  `weeklyXp <= 100000`).

Deployed live to `repchamp-14f78` via `firebase deploy --only firestore:rules`.
Real per-session anti-cheat (validating each delta) still belongs server-side — these
caps stop the trivial spoof, not a determined one.

### Privacy Policy & Terms — FIXED
Onboarding referenced a policy that didn't exist (an App/Play Store rejection reason).
Added `app/modal/legal.tsx` — a real in-app Privacy Policy + Terms screen whose copy
matches what the app actually does (on-device pose processing, Firebase sync, PostHog
analytics, RevenueCat billing). The onboarding "Terms and Privacy Policy" text is now
tappable (`?tab=terms` deep-links to the Terms section), and Settings → Your Data links
to it.

**Public hosted URL — DONE (2026-07-27):** the policy is live at
`https://repchamp.web.app/privacy` (and `/terms`), both HTTP 200 with real GDPR-grade
copy — the URL Google Play requires in the store listing. Centralised in `src/lib/urls.ts`
(`PRIVACY_URL` / `TERMS_URL`); the in-app legal screen now shows a "View the full,
always-current version online ↗" link that opens it. Use `https://repchamp.web.app/privacy`
in the Play Console listing's Privacy Policy field.

### Data export & account deletion — FIXED
GDPR/CCPA + store data-safety requirement. Added `src/services/accountService.ts`:
- `exportAccountData(uid)` — gathers profile, leaderboard, matchmaking, and shared
  couple docs into JSON, handed to the OS share sheet (no new native dep).
- `deleteAccount(uid)` — erases the cloud footprint (users, leaderboard, matchmaking,
  couple doc, Storage avatar) then the auth account, and the caller wipes local storage.
Surfaced in Settings → Your Data (Export my data / Delete my account, double-confirmed).

---

## ⚠️ Open — requires YOUR account access (cannot be done in code)

| Gap | Why it blocks | Where |
|---|---|---|
| **No RevenueCat products registered** | Paywall fetches an empty offering → **zero revenue**. Android key is already in `app.json`; you still need Play products + a RevenueCat offering. | Google Play Console → RevenueCat: **`rc_pro_monthly`** + **`rc_pro_annual`**, entitlement `pro`, offering `current`. See `REVENUECAT_SETUP.md`. |
| **Android SHA fingerprints for Google Sign-In** | Web client id is set; release/EAS builds still need SHA-1/SHA-256 on the Firebase Android app. | `eas credentials` / `keytool` → Firebase → Android fingerprints. See `FIREBASE_SETUP.md` §3. |
| ~~**Sentry DSN is a placeholder**~~ | **FIXED** — real DSN in `app.json`. Crash reporting lights up on next build. | — |
| ~~**Google Sign-In web client id empty**~~ | **FIXED** — web client id + refreshed `google-services.json` / `GoogleService-Info.plist` from Firebase. | Rebuild + add SHA fingerprints (row above). |
| **Cross-device nudge push half-wired** | Local streak reminders work; partner nudge uses Expo Push from the client. Optional Cloud Function for guaranteed delivery. | Optional (documented in FIREBASE_SETUP.md) |

### Deferred — not needed for Play Store launch
| Gap | Status |
|---|---|
| **iOS RevenueCat / App Store products** | **Skipped on purpose** — shipping Android first. Leave `revenueCatApple` empty until App Store. Does not affect Play billing. |

### RevenueCat setup steps (Play — clears empty paywall)
1. **Google Play Console** → create subscription products (e.g. `rc_pro_monthly`, `rc_pro_annual`).
2. **RevenueCat** → Products → add those product IDs; attach entitlement **`pro`**.
3. Create an **Offering** (`current`) → add Packages → attach the products.
4. Confirm `app.json` `extra.revenueCatGoogle` matches your `goog_…` public key.
5. Rebuild, add a licence tester, verify the paywall shows prices and purchase flips Pro.

---

## Firebase App Check — WIRED & running on device (2026-07-26)
Client is done and verified on the Pixel: `src/lib/appCheck.ts` initialises the Play
Integrity provider at startup (logcat confirms `configureProvider [DEFAULT]/playIntegrity`
and `getToken` calls). Plugin added to `app.json`, rebuilt clean, app runs at 60fps.

Currently **collecting, not enforcing** — exactly the safe intended state. Device log
shows the expected `403 Firebase App Check API has not been used in project 613733102264`
and the SDK falling back to a placeholder token, so nothing breaks. To activate (your
console access, see FIREBASE_SETUP.md):
1. Enable the **App Check API** for the project (the 403 link).
2. Register **Play Integrity** (Android) — still collect-only.
3. Watch verified-vs-unverified metrics for Firestore/Storage, then flip **Enforce**.

Also tightened this round and DEPLOYED: leaderboard `totalXp`/`displayName` caps and
`users` profile XP + string-length caps (previously only `weeklyXp` was bounded).
- The legal copy uses `arafathossain455@gmail.com` as the contact.

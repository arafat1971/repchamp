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
| **No RevenueCat products registered** | Paywall fetches an empty offering → the `ConfigurationError` you saw → **zero revenue possible**. | Google Play Console: create subscription → RevenueCat: add product + offering + `pro` entitlement |
| **No iOS RevenueCat key** | Only `revenueCatGoogle` is in `app.json`. iOS paywall is dead until an `appl_…` key + App Store products exist. | `app.json` `extra.revenueCatApple` + App Store Connect |
| **Sentry DSN is a placeholder** | Crash reporting is off (`https://placeholder@sentry.io/0`) — you're blind to production crashes. Non-blocking. | `app.json` `extra.sentryDsn` from your Sentry project |
| **Cross-device nudge push half-wired** | Local streak reminders work; a nudge to a *backgrounded* partner needs a trusted sender. `nudgePartner` POSTs to Expo's push service directly (free, no Blaze) — works if the partner's Expo token is saved, but there's no `functions/` dir if you want server-guaranteed delivery. | Optional Cloud Function (documented in FIREBASE_SETUP.md) |

### RevenueCat setup steps (clears the on-screen error)
1. **Google Play Console** → create a subscription product (e.g. `repchamp_pro_monthly`).
2. **RevenueCat** → Products → add that product ID.
3. Create an **Offering** (e.g. `default`) → add a **Package** → attach the product.
4. Attach an **Entitlement** named exactly `pro` (code checks `PRO_ENTITLEMENT = 'pro'`).
5. Repeat for iOS with an App Store subscription + `appl_…` public key.

---

## Firebase App Check — WIRED & running on device (2026-07-26)
Client is done and verified on the Pixel: `src/lib/appCheck.ts` initialises the Play
Integrity provider at startup (logcat confirms `configureProvider [DEFAULT]/playIntegrity`
and `getToken` calls). Plugin added to `app.json`, rebuilt clean, app runs at 60fps.

Currently **collecting, not enforcing** — exactly the safe intended state. Device log
shows the expected `403 Firebase App Check API has not been used in project 613733102264`
and the SDK falling back to a placeholder token, so nothing breaks. To activate (your
console access, see FIREBASE_SETUP.md):
1. Enable the **App Check API** for the project (the 403 link), then register the
   **Play Integrity** (Android) / **App Attest** (iOS) provider.
2. Watch verified-vs-unverified metrics for Firestore/Storage, then flip **Enforce**.

Also tightened this round and DEPLOYED: leaderboard `totalXp`/`displayName` caps and
`users` profile XP + string-length caps (previously only `weeklyXp` was bounded).
- The legal copy uses `privacy@repchamp.gg` as the contact — change it if that mailbox
  isn't real before store submission.

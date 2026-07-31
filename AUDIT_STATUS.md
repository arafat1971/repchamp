# Audit & Gap Status

Snapshot of the app's readiness gaps, split by who can close them. Last swept 2026-07-31.

Health after the audit and its follow-up work: **524 tests pass, 0 type errors, 9 lint
errors (all known stylistic false positives on correct code), Android build succeeds and
runs on device** (Pixel 7a).

Full sweep of all 36 routes and 65 modules on 2026-07-31 found **no broken screens, no
dead buttons, no unresolvable navigation, no orphaned routes and no TODO/FIXME in `app/`**.
The bones are solid; gaps are at the edges.

---

## ✅ Closed in code (2026-07-31 audit)

Six silent-failure bugs — paths that reported success while doing nothing. See commit
"Fix silent-failure bugs found in the full-app audit" for the full reasoning.

- **Account deletion (GDPR)** — every erase swallowed its own rejection, so the athlete was
  told the account was deleted while their profile and leaderboard row were still live. Now
  raises, naming what survived. Regression tests added (`accountService` had none).
- **Couple credits could double-count** — `done` was persisted only after the whole flush
  loop, and the server's replay window (40) was narrower than the client's retry memory
  (200). Now persists per credit; server window raised to 250.
- **Pro lost by a paying subscriber** — `refresh()` re-checked RevenueCat anonymously on a
  cold start. Now passes the uid. `initialize()` could also hang the paywall forever.
- **Blocking left an accepted duel live** — the cleanup query did not match the delete rule.
- **Unsettled duels retried forever** — a 5s Firestore write loop for the life of the
  process, now capped.
- **Leaderboard monotonicity was bypassable** — `weekKey` was unvalidated in the rules, which
  disabled the "score can only go up" guard. ✅ Deployed live to `repchamp-14f78` on
  2026-08-01. Safe to tighten because `publishScore` is the only writer to `leaderboard/{uid}`
  and it always sends `weekKey`; the other match in the codebase is a read-only query in
  `seedPhantoms.ts`.

### Closed in follow-up work

- **Profile sync reported success it never achieved** — `upsertProfile` signals a rejected
  write by *returning false* rather than throwing, so `pushProfile`'s catch never fired: a
  denied write left `status` on 'synced' while XP quietly stopped mirroring. It also
  published a leaderboard row for a profile that was never saved.
- **Action-shot capture leaked a temp file per rep** — it wrote a full-resolution JPEG to the
  app cache on every capture with nothing reclaiming it. Now encodes in memory.
- **Friends / leaderboard empty states** — a network failure on the friends list was
  pixel-identical to "you have no friends". Added a shared `EmptyState`/`ErrorState` to
  `src/components/ui`, which was the missing piece that let coverage drift in the first
  place, and adopted it in both screens.
- **FAB artwork clipping** — the scale constant was tuned to a near-square mark; the current
  landscape one would have been cut off by the circular clip.

Test coverage went 499 → 551, and every service now has a test file. `accountService`,
`proStore`, `authStore`, `safetyService` and `liveResultSettle` had none at all, which is
precisely why their bugs survived. Every regression test was verified by reinstating the
original bug and confirming the test fails.

### On-device verification (Pixel 7a, 2026-08-01)

- **FAB artwork** — confirmed by screenshot: both figures render fully inside the ring with
  margin. The inherited 1.3 scale would have clipped them.
- **Camera session** — opened a live squats session, camera preview streaming, calibration
  ring and framing brackets rendering, clean teardown on exit. **Zero `SuspendAll` / SIGABRT /
  ANR signatures**, which is the scenario that used to abort within ~90s before the
  VisionCamera 5.2.0 / Nitro 0.36.4 upgrade.
- **Share-card action photo — still unverified.** The capture only runs on a *completed rep*,
  so it needs a person in frame; with the phone on a desk, MoveNet never detects a body and
  calibration stalls (correct behaviour). This one cannot be verified without a real set.

Earlier "blank screenshot" failures were the device screen being off, not a secure-surface
block — `screencap` works normally when the phone is awake.

### Known remaining gaps (deliberately deferred)

- **`isUsernameAvailable` returns `true` on error**, so two offline devices can claim the
  same name. The real fix is a `usernames/{name}` reservation doc, which is a schema change
  rather than a patch; the current behaviour is a documented tradeoff (don't block onboarding
  while offline).
- **iOS billing is inert** — `revenueCatApple` is empty by choice while shipping Android
  first. Not a defect.

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

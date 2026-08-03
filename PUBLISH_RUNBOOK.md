# RepChamp — Play Store Publish Runbook

Status as of 2026-07-27: **both hard Play blockers are cleared.** What remains is the
standard build-and-submit mechanics below — most of which need your Expo / Google accounts.

## ✅ Already done (in code)
- No fake users / real photos — honest labelled AI partners
- Public privacy policy live + wired: `https://repchamp.web.app/privacy` (and `/terms`)
- Real-time competition built + test-proven; hard rep paywall built (dormant until billing)
- 329 tests pass, 0 type errors
- `eas.json` created with `development` / `preview` / `production` profiles.
  Production = signed **AAB**, `autoIncrement: true` (EAS manages versionCode for you).

---

## Your steps

### 0. Install & log in to EAS (one-time)
```bash
npm install -g eas-cli
eas login
```

### 1. Build a preview APK first (test on your own phone)
```bash
eas build --platform android --profile preview
```
Download the APK from the build URL, install it, run the full test pass
(see `LIVE_DUEL_TEST.md` for the two-person duel check).

### 2. Build the production AAB (for the Play Store)
```bash
eas build --platform android --profile production
```
This produces the signed `.aab`. EAS handles the keystore (or use your own).

### 3. Create the app in Google Play Console
- Create app `RepChamp`, package `gg.repchamp.app`.
- Upload the AAB to an **internal testing** track first (fastest review, safe).

### 4. Fill the required listing fields

Each of these has a doc with the exact answers already worked out — they are
derived from the code, so paste from them rather than improvising:

| Console section | Doc | Status |
|---|---|---|
| Store listing (name, descriptions) | `STORE_LISTING.md` | ✅ copy ready, SEO-tuned |
| Store settings (category, tags, contact) | `STORE_LISTING.md` § Filling in the Play Console form | ✅ ready |
| Data safety | `DATA_SAFETY.md` | ✅ ready |
| Content rating + target audience | `CONTENT_RATING.md` | ✅ ready |
| Release notes | `RELEASE_NOTES.md` | ✅ ready |
| Feature graphic (1024×500) | `store/feature-graphic.png` | ✅ generated |
| App icon (512×512) | `store/icon-512.png` | ✅ generated |
| Phone screenshots (2–8) | `store/screenshots/` | ✅ 3 of 5 — enough to publish |

- **Privacy Policy URL:** `https://repchamp.web.app/privacy`

Regenerate the graphics after any icon or brand-colour change:

```bash
/usr/bin/python3 scripts/make-store-graphics.py
```

(System Python specifically — the Homebrew `python3` on this Mac has an
x86_64 Pillow that will not load on arm64.)

Three screenshots — Arena, Home, Profile — are captured and composited in
`store/screenshots/`, which clears Play's two-shot minimum. Upload those, not
the raw captures: a raw phone grab is 1080x2400, and Play rejects anything
whose long side is more than twice its short side.

The two strongest shots are still missing because they need a second person in
frame: a live session with the pose skeleton overlaid, and a couple streak
with a paired partner. The session shot is the clearest single image of what
this app does and should lead the listing once it exists. Drop raws into
`store/screenshots-raw/` as `04.png` / `05.png` and re-run:

```bash
/usr/bin/python3 scripts/caption-screenshots.py
```

Screenshots move install conversion more than any other single thing in the
listing, so this is worth finishing properly. Shot list and staging notes:
`STORE_SCREENSHOTS.md`.

### 4b. Deploy Firestore rules whenever they change

Editing `firestore.rules` changes nothing until it is deployed — the file in
the repo and the rules the server enforces are separate things, and a client
written against the local file will simply be denied.

```bash
npx firebase-tools deploy --only firestore:rules --project repchamp-14f78
```

Check the output. `uploading rules` means it shipped; `already up to date,
skipping upload` means the server already had it and the problem you are
chasing is somewhere else.

Dry-run first when the change is non-trivial — it compiles without touching
the live project:

```bash
npx firebase-tools deploy --only firestore:rules --project repchamp-14f78 --dry-run
```

Two rules bugs have already shipped this way, both silent: avatars were
rejected because the rule still demanded `https://` URLs after the app moved
to inlined data URIs, and the duel QR could not be read because an open invite
matched neither `isPlayer()` nor `isTarget()`. Neither surfaced as an error a
user could act on — one was a missing photo, the other a permission denial.

### 5. RevenueCat products (unblocks revenue + activates the paywall)
Until this is done the hard paywall stays **dormant** by design (the billing-configured
safety valve), so the app is fully usable but earns nothing.

**Canonical Play product IDs** (must match across Play Console + RevenueCat):
- `rc_pro_monthly`
- `rc_pro_annual` (optional 7-day free trial)

1. Google Play Console → Monetize → Subscriptions → create those two products; activate.
2. RevenueCat → import them → entitlement **`pro`** (exact) → offering **`current`**
   with Monthly + Annual packages.
3. Confirm `app.json → extra.revenueCatGoogle` matches your `goog_…` key.
4. Leave `revenueCatApple` empty until App Store. Full checklist: `REVENUECAT_SETUP.md`.

### 6. Google Sign-In fingerprints (production builds)
Add debug + EAS/Play SHA-1 / SHA-256 to Firebase Android app settings — see
`FIREBASE_SETUP.md` §3. Without fingerprints, Google Sign-In fails on release builds.

### 7. (Optional, recommended) real Sentry DSN
Replace the `sentryDsn` placeholder in `app.json` with your project's DSN so you get
production crash reports. Builds already pass `SENTRY_DISABLE_AUTO_UPLOAD=true` via
`eas.json`, so a missing org won't fail the build.

---

## Order that minimises risk
1. `preview` build → test on device with a friend (duel + couple flows)
2. RevenueCat products (so the paywall is real before launch)
3. `production` build → internal testing track → your own final check
4. Promote to closed/open testing, then production

## Notes
- `versionCode` is now auto-managed by EAS (`autoIncrement`) — no manual bumping.
- The privacy site is on Firebase Hosting (`repchamp.web.app`); keep it up — Play
  re-checks the URL.

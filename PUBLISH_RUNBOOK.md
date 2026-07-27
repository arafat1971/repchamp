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
- **Privacy Policy URL:** `https://repchamp.web.app/privacy`
- **Data safety form** — declare what you collect: account/profile, workout stats,
  approximate usage analytics (PostHog), crash data (Sentry, if enabled). Say data is
  encrypted in transit and users can request deletion (Settings → Delete my account).
- **Content rating** questionnaire (fitness app, no objectionable content → low rating).
- Screenshots (phone), feature graphic, short + full description, app icon.

### 5. RevenueCat products (unblocks revenue + activates the paywall)
Until this is done the hard paywall stays **dormant** by design (the billing-configured
safety valve), so the app is fully usable but earns nothing.
1. Google Play Console → Monetize → Subscriptions → create `repchamp_pro` with
   Monthly + Annual base plans; activate them.
2. RevenueCat dashboard → add product `repchamp_pro`, entitlement **`pro`** (exact),
   offering `default` with Monthly + Annual packages.
3. Put the `appl_…` iOS key in `app.json` too when you do iOS.

### 6. (Optional, recommended) real Sentry DSN
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

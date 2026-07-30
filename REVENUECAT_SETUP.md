# RevenueCat — real subscriptions (Play Store first)

Billing is wired end to end in code (`react-native-purchases` + `src/services/purchases.ts`
+ `src/state/proStore.ts` + the real `app/modal/paywall.tsx`). It **no-ops until you
add real API keys and store products**, so the app runs fine today; the paywall shows
an honest "billing not set up yet" / empty-plans note until Play + RevenueCat are live.

**You are shipping Android first.** Only Google Play products + `revenueCatGoogle` are
required. Leave `revenueCatApple` empty until you ship to the App Store — it does not
block Play billing.

Everything below needs your developer accounts — I can't create store products or sign
into Play Console / RevenueCat for you.

## What's already built

- **Entitlement layer** — `src/domain/pro.ts` defines free vs. Pro (couple mode +
  push-ups + squats free; full library + programmes Pro), unit-tested.
- **Live entitlement** — `proStore` follows RevenueCat's customer info; never caches a
  local "is pro" flag.
- **Real paywall** — fetches the current offering, shows localised store prices,
  purchases, and Restore.
- **Gates** — Pro exercises / programmes route to the paywall when billing is configured.
- **Analytics** — `paywall_viewed`, `trial_started`, `subscribed` already fire.
- **Android key** — `app.json → extra.revenueCatGoogle` is already set.

## Your setup (≈20–30 min, Play only)

### 1. Create the products in Google Play Console
Monetize → Subscriptions → create products, e.g.:
- `rc_pro_annual` (yearly, optional 7-day free trial)
- `rc_pro_monthly` (monthly)

Use the same product IDs you will import into RevenueCat.

### 2. RevenueCat dashboard (<https://app.revenuecat.com>)
1. Create a project, add your **Android** app (package `gg.repchamp.app`).
2. **Entitlements** → create one with identifier **`pro`** (must match
   `PRO_ENTITLEMENT` in `src/domain/pro.ts`).
3. **Products** → import the Play products; attach each to the `pro` entitlement.
4. **Offerings** → create the default (`current`) offering; add Annual + Monthly
   packages pointing at those products.
5. Confirm the **Google** public SDK key (`goog_…`) matches `app.json → extra.revenueCatGoogle`.

### 3. Rebuild & test
```bash
npx expo prebuild --clean
npm run android
```
- Add a **licence tester** in Play Console → test purchase (no real charge).
- The paywall should show real prices; buying flips `isPro` live; Restore recovers it
  on a fresh install.

### 4. Later — App Store (optional)
When you ship iOS: create App Store subscriptions with the same product IDs, add the
iOS app in RevenueCat, and set `revenueCatApple` to the `appl_…` key. No other code
change is required.

## Notes

- **Keep couple mode free** — it's the viral loop. The gate in `pro.ts` already does
  this; don't move it behind Pro.
- Prices/copy on the paywall come from the store — change them in Play Console, not
  in code.
- RevenueCat validates receipts server-side, so no receipt backend is needed on your end.

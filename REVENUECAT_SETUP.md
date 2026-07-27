# RevenueCat — real subscriptions

Billing is wired end to end in code (`react-native-purchases` + `src/services/purchases.ts`
+ `src/state/proStore.ts` + the real `app/modal/paywall.tsx`). It **no-ops until you
add real API keys**, so the app runs fine today; the paywall shows an honest "billing
isn't set up yet" note.

Everything below needs your developer accounts — I can't create store products or sign
into App Store Connect / Play Console / RevenueCat for you.

## What's already built

- **Entitlement layer** — `src/domain/pro.ts` defines free vs. Pro (couple mode +
  push-ups + squats free; everything else Pro), unit-tested.
- **Live entitlement** — `proStore` follows RevenueCat's customer info; never caches a
  local "is pro" flag (which is how apps serve Pro to lapsed subscribers).
- **Real paywall** — fetches the current offering, shows localised store prices,
  purchases, and offers **Restore** (Apple requires it).
- **Gates** — Pro exercises (mobility drills) route to the paywall; Profile shows an
  Upgrade CTA / PRO badge.
- **Analytics** — `paywall_viewed`, `trial_started`, `subscribed` already fire.

## Your setup (≈30–45 min, one time)

### 1. Create the products in the stores
- **App Store Connect** → your app → Subscriptions → create a group `RepChamp Pro`
  with: `rc_pro_annual` ($39.99/yr, add a 7-day free trial intro offer) and
  `rc_pro_monthly` ($7.99/mo). Optionally `rc_pro_lifetime` ($79.99 non-consumable).
- **Google Play Console** → Monetize → Subscriptions → create matching products with the
  same ids and prices.

### 2. RevenueCat dashboard (<https://app.revenuecat.com>, free tier is fine)
1. Create a project, add your iOS + Android apps (bundle/package `gg.repchamp.app`).
2. **Entitlements** → create one with identifier **`pro`** (must match
   `PRO_ENTITLEMENT` in `src/domain/pro.ts`).
3. **Products** → import the store products from step 1; attach each to the `pro`
   entitlement.
4. **Offerings** → create the default (`current`) offering; add Annual + Monthly
   (+ Lifetime) packages pointing at those products.
5. **API keys** → copy the **Apple** key (`appl_…`) and **Google** key (`goog_…`).

### 3. Put the keys in the app
Replace the placeholders in `app.json → extra`:
```json
"revenueCatApple": "appl_YOUR_KEY",
"revenueCatGoogle": "goog_YOUR_KEY"
```
Then rebuild (native module was added):
```bash
npx expo prebuild --clean
npm run android   # or: npm run ios
```

### 4. Test
- Android: add a **licence tester** in Play Console → test purchase (no real charge).
- iOS: use a **Sandbox** Apple ID → purchases don't charge.
- The paywall should show real prices; buying flips `isPro` live (Profile shows PRO,
  the exercise-library gate opens); Restore recovers it on a fresh install.

## Notes

- **Keep couple mode free** — it's the viral loop. The gate in `pro.ts` already does
  this; don't move it behind Pro.
- Prices/copy on the paywall come from the store, so change them in App Store Connect /
  Play Console, not in code.
- RevenueCat validates receipts server-side, so no receipt backend is needed on your end.

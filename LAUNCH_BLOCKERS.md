# Launch blockers — one console task

Everything code-side is done and verified. What remains needs your Google
account, so it is the last thing standing between the current build and a Play
Store release. It fails silently — nothing crashes, so it does not show up in
testing unless you look for it.

Verified against the code on 2026-08-01 — every id below is what the app
actually asks for, not what a doc once said.

---

## 1. ~~Firebase Storage~~ — solved in code, nothing to do

Storage needs the paid Blaze plan, and avatars were the only thing using it, so
the app no longer uses Storage at all.

The picked photo is downscaled to 192x192 and stored as a base64 data URI on the
profile document — about 6 KB against Firestore's 1 MiB per-document limit.
Avatars never render above ~96pt in this app, so 192px is still retina-sharp.
`storage.rules` and its `firebase.json` entry are gone.

**You do not need to enable Storage or upgrade to Blaze.** The free Spark tier
covers this.

## 2. No RevenueCat products — the paywall is empty

**Symptom:** the paywall shows no plans and earns nothing. Logcat carries the
exact cause:

> `PurchasesError(code=ConfigurationError, underlyingErrorMessage=You have
> configured the SDK with a Play Store API key, but there are no Play Store
> products registered in the RevenueCat dashboard for your offerings.`

The Android SDK key in `app.json` is valid and the SDK configures fine — only
the dashboard products are missing. `fetchOffering` returns null rather than
throwing, so the app degrades quietly instead of crashing.

### What the code expects — these ids must match exactly
| Thing | Value |
|---|---|
| Package name | `gg.repchamp.app` |
| Entitlement id | `pro` |
| Offering | the one marked **current** |
| Products | `rc_pro_monthly`, `rc_pro_annual` |

The entitlement id is asserted in `src/domain/pro.ts` (`PRO_ENTITLEMENT`), and
`fetchOffering` prefers the dashboard's `current` offering, falling back to any
offering that still has packages.

### Fix
1. **Play Console** → Monetise → Subscriptions → create `rc_pro_monthly` and
   `rc_pro_annual` (a 7-day trial on the annual plan is optional), then
   **activate** both. Inactive products do not appear in an offering.
2. **RevenueCat** → Products → import from Play → attach both to the **`pro`**
   entitlement.
3. **RevenueCat** → Offerings → create/confirm the **`current`** offering and
   add both packages to it.
4. Relaunch the app. The ConfigurationError should be gone and both plans
   should render with localised prices.

> iOS is deliberately unconfigured — `extra.revenueCatApple` is empty, so
> `isPurchasesConfigured()` is false there and purchases report "Billing is not
> set up yet." That is the Android-first decision, not a defect.

---

## 3. Play Data Safety form — needs submitting by hand

Answers are drafted field by field in `DATA_SAFETY.md`. The two that get
flagged most often:

- **Photos = Yes.** The avatar is a real photograph and it leaves the device.
  Answering No because "it is just an avatar" is the kind of mismatch Play
  rejects for.
- **Videos = No.** The camera stream is processed frame by frame on-device and
  discarded. Nothing is recorded or uploaded.

If you already submitted the form while the duel action-shot feature existed,
**re-submit it** — that feature was removed, so the old answer now overstates
what the app collects.

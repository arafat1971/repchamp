# Launch blockers — two console tasks

Everything code-side is done and verified. These two need your Google/Firebase
logins, so they are the only things standing between the current build and a
Play Store release. Both are silent failures: nothing crashes, so neither shows
up in testing unless you look for it.

Verified against the code on 2026-08-01 — every id below is what the app
actually asks for, not what a doc once said.

---

## 1. Firebase Storage is not provisioned

**Symptom:** avatars work for the athlete who picked them and are invisible to
everyone else. Friends, the leaderboard and duel opponents all see initials.

**Why:** no Storage bucket exists on `repchamp-14f78`. `uploadAvatar` throws,
`syncAvatar` catches it and falls back to the local `file://` path, and
`isCloudSafeAvatarUrl` then rejects anything that is not `https://` — so
`avatarUrl: null` is what reaches Firestore. Every layer handles the failure
"correctly", which is exactly why it stayed invisible.

Confirmed two ways: `firebase deploy --only storage` fails with "Firebase
Storage has not been set up on project", and a REST probe of the Storage API
returns **404** for both `repchamp-14f78.firebasestorage.app` and the legacy
`repchamp-14f78.appspot.com`.

**The client is already correct** — `android/app/google-services.json` names
`repchamp-14f78.firebasestorage.app`. No code or config change is needed.

### Fix
1. https://console.firebase.google.com/project/repchamp-14f78/storage
2. **Get started** → accept the default rules → pick a region.
   Choose the region nearest your users; **it cannot be changed later**.
3. Then publish the repo's rules (they are stricter than the default):

```bash
firebase deploy --only storage --project repchamp-14f78
```

`storage.rules` allows an athlete to write only `avatars/{their-own-uid}.jpg`,
and leaves `duelPhotos/` delete-only so account deletion can still erase shots
uploaded while that feature existed.

---

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

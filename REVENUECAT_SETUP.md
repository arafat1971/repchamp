# RevenueCat setup

What is already done, what is broken, and the exact steps to fix it.

Verified against the code and the device on 2026-08-09.

---

## Already working — do not change these

| Thing | Value | Where |
|---|---|---|
| Android API key | `goog_MDPF…` | `app.json` → `extra.revenueCatGoogle` |
| Entitlement the app checks | `pro` | `src/domain/pro.ts:16` |
| Products | Created 2026-08-02 | RevenueCat dashboard |
| Google Play billing | **Working** | Proved on device — a duplicate purchase was correctly refused |

The purchase call reaches Google and gets a real answer. Nothing in the app is
the problem.

---

## Status: working, verified on device 2026-08-09

A purchase completed, RevenueCat validated it, the `pro` entitlement attached
and the PRO badges disappeared. Before that day it had never once worked.

Two faults, fixed in this order — the second was invisible until the first
cleared:

1. **The service account could not authenticate.** Eight
   `InvalidCredentialsError` per launch. Fixed by granting the four Play Console
   permissions below and waiting for Google to propagate them.
2. **The `pro` entitlement had no products attached.** The purchase then
   succeeded and Pro still did not activate — the app checks
   `entitlements.active['pro']`, which stayed empty. Fixed in the RevenueCat
   dashboard by attaching both products to the entitlement.

The app surfaced the second one itself: "Purchase completed, but Pro is not
active yet. Try Restore purchase, or confirm the 'pro' entitlement is attached
in RevenueCat." That dialog named the exact cause.

The rest of this file is the setup that got there, kept for the next time.

---

## What was broken

Every launch logs, eight times:

```
PurchasesError(code=InvalidCredentialsError,
  underlyingErrorMessage=Invalid Play Store credentials.)
```

That comes from **RevenueCat's server**, not the app. RevenueCat tried to call
Google Play's API and Google refused it. Until this clears:

- The paywall shows even to an athlete who already owns Pro
- Purchases fail with `ITEM_ALREADY_OWNED`, because Google knows about the
  subscription and RevenueCat does not
- Pro never unlocks

---

## Fix: connect a Google Play service account

Three consoles. The middle one is where it usually goes wrong.

### 1. Create the service account — Google Cloud

**console.cloud.google.com** → project **repchamp-14f78**

1. **IAM & Admin → Service Accounts → + Create service account**
2. Name: `revenuecat` → **Create and continue**
3. Role: **Pub/Sub Admin** → **Continue** → **Done**
4. Click the new account → **Keys** tab → **Add key → Create new key → JSON**

A `.json` file downloads. **Treat it like a password.** Do not commit it, do not
paste its contents into a chat.

Copy the account's email while you are here — it looks like
`revenuecat@repchamp-14f78.iam.gserviceaccount.com`.

### 2. Grant it access — Play Console  ← the step that usually fails

**play.google.com/console** → **Users and permissions**

This is at **account level**, not inside the app. If you are looking at
RepChamp, back out first.

1. **Invite new user**
2. Email address: the service account address from step 1
3. Under **Account permissions**, tick **both**:
   - View financial data, orders, and cancellation survey responses
   - Manage orders and subscriptions
4. **Invite user**

Then **go back and check it says Active**, not *Invitation pending*. A pending
invite produces exactly this error, forever, with no other symptom.

### 3. Upload it — RevenueCat

**app.revenuecat.com** → your project → **Apps** → the Android app

1. Find **Service Account credentials JSON**
2. Upload the file from step 1 → **Save**

RevenueCat validates on upload. A green state means the file itself is fine —
it does not mean Google has propagated the permission yet.

### 4. Wait

Google takes **up to 36 hours** to propagate Play Console permissions. The error
keeps appearing throughout. That is Google's delay, not a mistake on your part.

---

## Two more things to confirm while you are in RevenueCat

**The entitlement must be named exactly `pro`** — lowercase. `src/domain/pro.ts`
checks that literal string. `Pro` or `premium` would let a purchase succeed
while Pro never unlocks, which is a far worse failure than this one because it
takes the athlete's money first.

**Both products must be attached to that entitlement, and to an Offering marked
current.** A product outside the current offering never reaches the paywall,
which shows up as blank prices rather than an error.

---

## How to tell it is fixed

On a connected device:

```bash
adb logcat -c
adb shell am force-stop gg.repchamp.app
adb shell am start -n gg.repchamp.app/.MainActivity
sleep 14
adb logcat -d | grep -c InvalidCredentialsError
```

**0** means RevenueCat is authenticating. Your existing subscription should then
unlock Pro with no purchase at all, because RevenueCat can finally see it.

If it is still failing after 36 hours, the cause is step 2 — check the invite
status before redoing anything else.

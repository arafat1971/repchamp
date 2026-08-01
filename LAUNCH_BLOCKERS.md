# Launch blockers — all clear, one form left to submit

Both console blockers are resolved. Firebase Storage was solved in code (no paid
plan needed); the RevenueCat products were created and confirmed on device on
2026-08-02. What remains is the Data Safety form, which only you can submit.

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

## 2. ~~RevenueCat products~~ — done (2026-08-02)

Subscriptions created and activated in Play Console, imported into RevenueCat,
attached to the `pro` entitlement and added to the `current` offering.

Verified from the device: the `ConfigurationError` that fired on every launch
("no Play Store products registered in the RevenueCat dashboard for your
offerings") no longer appears in logcat at all. The SDK is finding the offering.

Two things that still need a human eye:

- **The paywall has not been seen rendering.** No error is strong evidence but
  not proof — open Profile → Upgrade, or tap a locked exercise, and check both
  plans show with localised prices. Blank prices usually mean the base plans are
  still propagating through Google's billing API, which can take a few hours.
- **A real purchase cannot be tested from a sideloaded build.** That needs a
  licence tester account (Play Console → Setup → Licence testing) and a build
  installed from a Play track — which is what the `.aab` is for.

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

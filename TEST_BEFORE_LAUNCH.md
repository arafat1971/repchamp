# Test before launch

What to check on the internal-testing build, in the order that finds problems
soonest. Written 2026-08-06, updated for versionCode 9, against `store/aab/repchamp-2.0.0-vc9.aab`.

Nothing here is a formality. Every item is something that has **never been
seen working on real hardware** — the code is tested and the rules are
deployed, but no human has watched any of it run on a phone.

---

## Getting it on a device

1. Play Console → **Testing → Internal testing → Create new release**
2. Upload `store/aab/repchamp-2.0.0-vc9.aab`
3. Release notes: paste from `RELEASE_NOTES.md`
4. **Testers** tab → add your own Google account, plus anyone helping
5. **Setup → Licence testing** → add the same accounts

Step 5 is not optional if you want to test paying. Google Play Billing refuses
sideloaded builds — the `ITEM_UNAVAILABLE` seen earlier was that, not a bug —
and a licence tester can complete a purchase without being charged.

Install from the Play link the testers tab gives you, not by sideloading. A
sideloaded copy cannot buy anything.

---

## 1. Does rep counting start?  ⬜

Everything else depends on this. Open the app → **Start now** → push-ups.

- Expect a pause of up to ~6 seconds on the first set. That is the GPU
  delegate being given its chance before the fallback to CPU.
- Then the skeleton should appear and the count should move.

**If it still says "Rep counting couldn't start on this device"** the delegate
fix did not work on your hardware, and that is the most important thing to
report back. Capture it with:

```bash
adb logcat -d | grep -iE "tflite|delegate|ReactNativeJS" | tail -40
```

---

## 2. Does the count keep up?  ⬜

Do a set of ten at a normal pace.

- The number should move while you are still pushing **up**, not after you
  have locked out.
- Count out loud and compare. Ten reps should read ten.

Report which way it is wrong if it is: **late** (trails your body), **missed**
(you did ten, it says eight), or **over** (you did ten, it says twelve). Those
three have different causes and different fixes.

> Known limit, unrelated to the above: below roughly 800ms per rep the
> smoothing filter cannot track the descent at all and nothing counts. Very
> fast reps are a separate problem.

---

## 3. The social paths  ⬜

These were broken until recently and the fixes are unverified.

- **Add a friend** — Friends → search a username → Add. This failed with
  `permission-denied` until `a7f7e50`.
- **Profile photo on a second device** — set one, then sign in elsewhere and
  look at your profile. Avatars never reached Firestore until `5898d61`.
- **Duel QR** — one phone: Arena → Find an opponent → the waiting room shows a
  code. Other phone: Arena → Find an opponent → **Scan a code**. Both should
  land in the same live race.

---

## 3b. Invite links open the app, not a browser  ⬜

Testable on the **local APK**, not only from Play. Verification compares the
installed app's signing certificate against `assetlinks.json`, and the debug
key that signs a local release build is already listed there — confirmed
against Google's own checker, which returns all three fingerprints for
`gg.repchamp.app` with no errors:

```bash
curl -s "https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://repchamp.web.app&relation=delegate_permission/common.handle_all_urls"
```

(An earlier version of this file claimed a sideload could never verify. That
is wrong — it is the *certificate* that has to match, not the installer.)

First confirm Android accepted the domain:

```bash
adb shell pm get-app-links gg.repchamp.app
```

`repchamp.web.app` should read **verified**. If it says `none` or
`legacy_failure`, the app is installed but unverified — links will open the
browser and the checks below cannot pass.

Then, from a chat app or email (not by typing them into Chrome's address bar,
which can bypass the handler):

- **A couple invite** — `https://repchamp.web.app/couple/join?code=ABC234`
  should open the app straight into pairing, no browser tab.
- **A friend invite** — `https://repchamp.web.app/@yourhandle` should open the
  app on Add Friend with the username already in the search box.
- **A duel invite** — from the waiting room tap **Copy link**, paste it into a
  chat, and open it on the other phone. It should land in the same duel. New
  in this build: what the button copied before was a bare id, and the link it
  now copies points at `/duel/join`, which is the route that answers it.

If either opens the browser instead, the page still offers "Open in RepChamp",
so the loop is not broken — it is the verification that failed, and
`assetlinks.json` versus the installed signing key is the first thing to check.

> **The likeliest failure, worth pre-empting.** Verification compares the
> installed APK's signing certificate against the fingerprints in
> `website/.well-known/assetlinks.json`. Play re-signs uploads with the **app
> signing key**, which is usually *not* the upload key EAS holds — so the
> fingerprint that matters is the one Play shows, not the one that built the
> AAB. Check they agree before blaming the manifest:
>
> Play Console → Test and release → **Setup → App signing** → copy the
> **SHA-256 of the app signing key**, and confirm it appears in
> `assetlinks.json`. The file currently lists three fingerprints; if Play's is
> not among them, add it and redeploy hosting:
>
> ```bash
> firebase deploy --only hosting
> ```
>
> Verification is retried on install, so a corrected file means reinstalling the
> app rather than waiting.

---

## 4. A real purchase  ⬜

Only possible from a Play track with a licence-tester account.

- Profile → Upgrade, or tap a locked exercise
- Both plans should show with **localised prices**. Blank prices usually mean
  the base plans are still propagating through Google's billing API, which can
  take a few hours after creating them.
- Complete a purchase. It should not charge a licence tester.
- Check Pro unlocks: the full exercise library becomes available.

---

## 5. Onboarding, from a fresh install  ⬜

Uninstall first, or use a device that has never had the app.

- **No notification prompt on the welcome screen.** It used to fire at launch,
  before anything had been shown. If it appears there, `c0d05a5` did not take.
- Google Sign-In now appears near the end, not on the first screen.
- Three screens before the first set: reminders, how reps count, setting up
  your space.
- Watch for a step that jumps. During simulator testing the flow skipped from
  the username screen to the paywall once; it was never reproduced and may
  have been an artefact of clearing app data mid-session. **If you see it,
  say so** — it would mean new users skip most of onboarding.

---

## 6. The home carousel  ⬜

Only appears **after one completed session** — before that, Home shows a
single "Your first set" card by design. So do step 1 first.

- Five dots under the hero card, swipeable
- The couple card: photo, "Train" in white above "Together" in green,
  "Start Together", and the two chips

---

## What is already verified

Not everything is unknown. These were checked on the iOS simulator:

- Welcome screen without Google Sign-In
- Showcase video, value screens, username availability against real Firestore
- Home, Arena, Friends and Profile layouts after the design pass
- The couple hero card rendering
- The FAB "Hold for more" hint

What the simulator cannot do is anything needing a camera or a Play install —
which is to say, items 1 through 4 above.

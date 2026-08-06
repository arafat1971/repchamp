# Test before launch

What to check on the internal-testing build, in the order that finds problems
soonest. Written 2026-08-06 against `store/aab/repchamp-test-release.aab`.

Nothing here is a formality. Every item is something that has **never been
seen working on real hardware** — the code is tested and the rules are
deployed, but no human has watched any of it run on a phone.

---

## Getting it on a device

1. Play Console → **Testing → Internal testing → Create new release**
2. Upload `store/aab/repchamp-test-release.aab`
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

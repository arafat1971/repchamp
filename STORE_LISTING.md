# Play Store listing copy

Every claim below is checked against the code, not written from imagination.
Play rejects listings that describe features an app does not have, and a
reviewer opening the app is the one who notices.

Character limits are Play's: **app name 30**, **short description 80**, **full
description 4000**.

---

## App name (30 max)

```
Fitness Duel: RepChamp
```
22 characters. Matches `expo.name` and the Android launcher label.

---

## Short description (80 max)

The one users actually read — it appears under the icon in search results.

```
AI rep counter. Duel friends, train with your partner, climb the leaderboard.
```
76 characters.

### Alternatives

```
Your camera counts the reps. Duel friends and keep a streak alive together.
```
74 characters — leads with the mechanic rather than the AI framing.

```
Push-ups and squats counted by your camera. Race friends. Never miss a day.
```
74 characters — most concrete, weakest on the social hook.

---

## Full description (4000 max)

```
Your camera is the rep counter.

Fitness Duel: RepChamp watches your form through the front camera and counts
every rep as you do it. No wearables, no manual tapping, no guessing whether
that last one was deep enough.

COUNTED, NOT ESTIMATED
Pose detection runs entirely on your phone. Prop it up, step back, and start —
the app tracks your joints in real time, counts each rep, and scores your depth
and alignment so you know which reps actually counted.

DUEL A RIVAL
Challenge a friend to a timed set and watch both scores climb live. Most reps
before the clock runs out takes it. No friends online? An AI partner is always
ready to race — clearly labelled, never pretending to be someone it isn't.

TRAIN TOGETHER
Pair with a partner and share one streak. It survives only if you both show up,
which turns out to be far harder to abandon than a streak of your own. Nudge
them when they're falling behind.

CLIMB THE LEAGUES
Bronze to Platinum, reset weekly. Earn XP for every set, hold your streak, and
take badges for your first duel win, a 100-rep session, and perfect form.

WHAT YOU GET FREE
Push-ups and squats, unlimited. Duels, couple mode, leaderboards, streaks and
badges — all included.

REPCHAMP PRO
Unlocks the full library: lunges, sit-ups, glute bridges, pike push-ups, high
knees, jumping jacks, shoulder rolls and full-body stretches.

YOUR VIDEO NEVER LEAVES YOUR PHONE
This is the part worth reading twice. Pose detection is on-device. Your camera
feed is never recorded, never uploaded, and never shared — in any mode,
including live duels. The only photo we store is the profile picture you choose
yourself.

Train hard. Train honestly.

---
Rep counts and form scores are estimates from on-device pose detection and can
be wrong. RepChamp is a fitness tool, not medical advice. Warm up, train within
your ability, and stop if you feel pain or dizziness.

Privacy policy: https://repchamp.web.app/privacy
Delete your account: https://repchamp.web.app/delete-account
Support: arafathossain455@gmail.com
```

Roughly 1,900 characters — comfortably inside 4000, and short enough that
someone might finish it.

---

## Why the copy says what it says

**"AI" is used carefully.** The app does run a real pose-detection model
(MoveNet), so "AI rep counter" is accurate. What it avoids is implying the AI
partners are human — Play's fake-engagement policy and App Store 3.2.2 both
care about that, and the listing states plainly that they are labelled.

**The free/Pro split is stated exactly.** `FREE_EXERCISES` is `['push',
'squat']` and every other movement is Pro. Listing a Pro exercise as free is
the kind of mismatch that draws a refund complaint rather than a rejection,
which is worse.

**The privacy line is deliberately prominent.** A fitness app asking for camera
access is asking for a lot of trust, and the honest answer here is unusually
strong: nothing from the camera leaves the device. Burying that would waste the
best thing the app has to say.

**The disclaimer is not boilerplate.** It mirrors the in-app terms
(`app/modal/legal.tsx`) so the listing and the app cannot contradict each other.

---

## Assets still needed

Copy is only part of the listing. Play also requires:

- **App icon** — 512x512 PNG, 32-bit with alpha
- **Feature graphic** — 1024x500 PNG or JPEG, no transparency. Shown at the top
  of the listing; Play will not publish without it.
- **Phone screenshots** — 2 minimum, 8 maximum. 16:9 or 9:16, each side between
  320px and 3840px.

Worth capturing: a live session with the pose skeleton overlaid (the clearest
demonstration of what the app does), the duel HUD mid-race with both scores,
the home screen, and the profile with badges and league standing.

- **Tablet screenshots** — not required. `supportsTablet` is false, so the
  listing should stay phone-only rather than claim a layout that does not exist.

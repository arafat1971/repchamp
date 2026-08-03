# Play Store listing copy

Every claim below is checked against the code, not written from imagination.
Play rejects listings that describe features an app does not have, and a
reviewer opening the app is the one who notices.

Character limits are Play's: **app name 30**, **short description 80**, **full
description 4000**.

---

## How Play ranking actually works

Worth stating before the copy, because it changes what the copy is for.

Play indexes three fields for search: **app name**, **short description**, and
**full description**, weighted in that order. There is no keyword field like
the App Store has. But keyword presence is only half of it — Play weights
**install-per-impression conversion** and **retention** heavily, so a listing
stuffed with terms that draws browsers who bounce ranks *worse* than a clean
one that converts.

So the strategy is: put the terms someone would actually type into the
high-weight fields once or twice each, naturally, then spend the rest of the
description on conversion.

### Keywords targeted

Terms a person searching for this app would plausibly type, in rough priority:

| Keyword | Where it lands |
| --- | --- |
| rep counter | name, short desc, full desc |
| push up counter | full desc (first 170 chars) |
| squat counter | full desc |
| workout challenge / fitness challenge | short desc, full desc |
| AI personal trainer | full desc |
| home workout no equipment | full desc |
| workout with friends | short desc, full desc |
| couples workout | full desc heading |
| streak | short desc, full desc |

Deliberately **not** chased: "gym", "weight loss", "calorie", "diet",
"six pack". The app does none of those. Ranking for them draws installs that
uninstall inside a day, which drags the whole listing down.

---

## App name (30 max)

```
Fitness Duel: AI Rep Counter
```
27 characters.

This is the single highest-weight ranking field, and the current name spends
11 of its 30 characters on "RepChamp" — a brand nobody is searching for yet.
Swapping the subtitle to the literal thing people type ("rep counter") buys
real search surface at the cost of brand repetition the icon already carries.

### Alternatives

```
Fitness Duel: RepChamp
```
22 characters. The current name — keeps brand, wins no search terms. Correct
choice only if you already have brand recognition to protect, which at launch
you do not.

```
RepChamp: AI Rep Counter Duel
```
29 characters. Brand-first, still keyword-bearing. A middle path if you want
"RepChamp" to stay the leading word for direct-name searches later.

> Changing the store name does **not** require changing `expo.name` or the
> launcher label. They can differ. But keeping them close avoids confusing a
> user who installs "Fitness Duel: AI Rep Counter" and finds "RepChamp" on
> their home screen — so if you take the rename, consider matching the
> launcher label too.

---

## Short description (80 max)

Appears under the icon in search results, and is the second-highest ranking
field. It is also the only body text most people read.

```
AI rep counter for push-ups & squats. Challenge friends, keep a daily streak.
```
76 characters. Carries "AI rep counter", "push-ups", "squats", "challenge
friends", "daily streak" — five searchable terms in one readable sentence.

### Alternatives

```
Your camera counts every rep. Duel friends, train with your partner, streak.
```
75 characters — stronger hook, fewer indexed terms.

```
Rep counter + workout challenge. Count push-ups, duel friends, build streaks.
```
76 characters — most keyword-dense, reads slightly more like a list.

---

## Full description (4000 max)

The first ~170 characters show before the "read more" fold. Everything that
matters for both search and conversion goes there.

```
Turn your phone camera into an AI rep counter. Count push-ups and squats
automatically, challenge friends to live workout duels, and build a daily
streak that actually sticks.

No equipment. No wearable. No manual tapping. Just prop up your phone and
train.

COUNTED, NOT ESTIMATED
Pose detection runs entirely on your phone. Step back and start — the app
tracks your joints in real time, counts each rep, and scores your depth and
alignment so you know which reps actually counted. A real push-up counter and
squat counter, not a timer you tap.

DUEL A RIVAL — LIVE
Challenge a friend to a timed workout challenge and watch both scores climb in
real time. Most reps before the clock runs out takes it. No friends online yet?
An AI workout partner is always ready to race — clearly labelled, never
pretending to be someone it isn't.

COUPLES WORKOUT MODE
Pair with your partner and share one streak. It survives only if you both show
up, which turns out to be far harder to abandon than a streak of your own.
Nudge them when they're falling behind. Couple mode is free, always.

CLIMB THE LEAGUES
Bronze, Silver, Gold and Platinum, reset weekly. Earn XP for every set, hold
your streak, and take badges for your first duel win, a 100-rep session, and
perfect form. A fitness leaderboard that resets often enough to stay winnable.

HOME WORKOUT, NO EQUIPMENT
Every exercise is bodyweight. No gym, no dumbbells, no subscription box — your
phone, some floor space, and a few minutes.

WHAT YOU GET FREE
Push-ups and squats, unlimited. Duels, couples mode, leaderboards, streaks and
badges — all included, no trial timer.

REPCHAMP PRO
Unlocks the full exercise library: lunges, sit-ups, glute bridges, pike
push-ups, high knees, jumping jacks, shoulder rolls and full-body stretches.

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

Roughly 2,300 characters — inside 4000, and short enough that someone might
finish it.

---

## Why the copy says what it says

**"AI" is used carefully.** The app does run a real pose-detection model
(MoveNet), so "AI rep counter" is accurate. What it avoids is implying the AI
partners are human — Play's fake-engagement policy and App Store 3.2.2 both
care about that, and the listing states plainly that they are labelled.

**The free/Pro split is stated exactly.** `FREE_EXERCISES` in
`src/domain/pro.ts` is `['push', 'squat']` and every other movement is Pro.
Listing a Pro exercise as free is the kind of mismatch that draws a refund
complaint rather than a rejection, which is worse.

**Couple mode is named as free** because `src/domain/pro.ts` documents it as
permanently free. That is a genuine differentiator and it belongs above the
paywall section, not buried under it.

**The privacy line is deliberately prominent.** A fitness app asking for camera
access is asking for a lot of trust, and the honest answer here is unusually
strong: nothing from the camera leaves the device. Burying that would waste the
best thing the app has to say.

**The disclaimer is not boilerplate.** It mirrors the in-app terms
(`app/modal/legal.tsx`) so the listing and the app cannot contradict each other.

**Keyword repetition is capped at 2–3 per term.** Play's spam filters and its
metadata policy both act on repetition, and past a couple of mentions there is
no ranking gain anyway.

---

## Filling in the Play Console form

Fields in order, as they appear under **Store presence → Store listings →
Default store listing**.

| Field | Value |
| --- | --- |
| App name (30) | `Fitness Duel: AI Rep Counter` |
| Short description (80) | `AI rep counter for push-ups & squats. Challenge friends, keep a daily streak.` |
| Full description (4000) | The block above |
| App icon | 512×512 PNG, 32-bit with alpha |
| Feature graphic | 1024×500 PNG/JPEG, no transparency |
| Phone screenshots | 2 min, 8 max — see below |
| Video (optional) | YouTube URL, leave blank if none |

Elsewhere in the console, but part of how the listing ranks and converts:

- **Store settings → App category:** `Health & Fitness`. Not `Sports`, not
  `Social` — Health & Fitness is where the competing rep counters sit, and
  category is a browse surface in its own right.
- **Store settings → Tags:** pick up to 5. `Exercise & fitness`,
  `Workout tracking`, and any social/competition tag Play offers. Tags feed
  the "similar apps" recommendation surface, which is a real install source
  and costs nothing.
- **Contact details:** email is required and public. `arafathossain455@gmail.com`
  matches the listing. A website URL is optional but adds a trust signal —
  `https://repchamp.web.app` already exists.
- **Privacy policy URL:** `https://repchamp.web.app/privacy`. Required, and
  Play checks that it loads.

---

## Assets still needed

Copy is only part of the listing, and for conversion the screenshots outrank
every word above.

- **App icon** — 512×512 PNG, 32-bit with alpha
- **Feature graphic** — 1024×500 PNG or JPEG, no transparency. Shown at the top
  of the listing; Play will not publish without it.
- **Phone screenshots** — 2 minimum, 8 maximum. 16:9 or 9:16, each side between
  320px and 3840px.

### Screenshot order that converts

The first two are what people see without swiping, so they carry the argument:

1. **Live session with the pose skeleton overlaid** — the clearest single
   image of what the app does. Caption: "Your camera counts every rep."
2. **Duel HUD mid-race, both scores climbing** — the differentiator. Caption:
   "Race a friend in real time."
3. **Couple mode / shared streak** — Caption: "Share one streak with your
   partner."
4. **Profile with badges and league standing** — Caption: "Climb Bronze to
   Platinum."
5. **Home screen** — orientation, shown late because it argues nothing.

Add short caption text baked into the image. Play does not index it, but
screenshots with captions convert measurably better than bare screen grabs,
and conversion is the ranking factor that actually moves.

- **Tablet screenshots** — not required. `supportsTablet` is false, so the
  listing should stay phone-only rather than claim a layout that does not exist.

---

## After publishing

Ranking is not set at submission. Two things to do once live:

- **Watch Store performance → conversion.** If install-per-view is under ~20%,
  the problem is the icon and first screenshot, not the keywords.
- **Run one field at a time through Store listing experiments** (Play's
  built-in A/B test). Short description and first screenshot are the two worth
  testing first. Changing everything at once teaches you nothing.

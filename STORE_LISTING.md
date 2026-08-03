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
| rep counter | short desc, full desc |
| push up counter | full desc (first 170 chars) |
| squat counter | full desc |
| workout challenge / fitness challenge | short desc, full desc |
| AI personal trainer | full desc |
| home workout no equipment | full desc |
| workout with friends | short desc, full desc |
| couples workout | full desc heading |
| streak | short desc, full desc |
| fitness duel (brand) | **name** |

Note the name row: with the brand title kept, the highest-weighted field
carries no generic search term. That puts unusual load on the short
description, which is why the recommended one below packs five terms into 76
characters rather than reading more elegantly.

Deliberately **not** chased: "gym", "weight loss", "calorie", "diet",
"six pack". The app does none of those. Ranking for them draws installs that
uninstall inside a day, which drags the whole listing down.

---

## App name (30 max)

```
Fitness Duel: RepChamp
```
22 characters. Matches `expo.name`, the Android launcher label, and the iOS
permission strings — one name everywhere, which is the point.

**Decided 2026-08-03: keep the brand name.** A keyword-bearing title
(`Fitness Duel: AI Rep Counter`, 27 chars) would win search surface in Play's
highest-weighted field, but it costs brand consistency across the launcher and
the permission prompts, and it needs a native rebuild to keep them in sync.
The trade was considered and declined.

What that decision costs, so it can be revisited with open eyes: "rep counter"
is the highest-intent phrase for this app, and the title carries roughly three
times the ranking weight of the full description. The short description now
does that work alone.

> Worth knowing for later: the store name and `expo.name` are allowed to
> differ. If you ever want to test a keyword title, it can be changed in the
> Console alone — no rebuild — and reverted just as fast. Play's store listing
> experiments (below) are the safe way to try it.

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
| App name (30) | `Fitness Duel: RepChamp` |
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

## Assets

Copy is only part of the listing, and for conversion the screenshots outrank
every word above.

- ✅ **App icon** — `store/icon-512.png`, 512×512, 32-bit with alpha
- ✅ **Feature graphic** — `store/feature-graphic.png`, 1024×500, no
  transparency. Play will not publish without it.
- ⬜ **Phone screenshots** — 2 minimum, 8 maximum. 16:9 or 9:16, each side
  between 320px and 3840px. **Still needed — requires a device.**

The first two are generated by `scripts/make-store-graphics.py` from
`assets/icon.png` and the brand tokens, so they stay in sync with the app.
Re-run it after any icon or colour change:

```bash
/usr/bin/python3 scripts/make-store-graphics.py
```

Full capture guide for the screenshots: `STORE_SCREENSHOTS.md`.

**Tablet screenshots** — not required. `supportsTablet` is false, so the
listing should stay phone-only rather than claim a layout that does not exist.

---

## After publishing

Ranking is not set at submission. Three things to do once live:

- **Watch Store performance → conversion.** If install-per-view is under ~20%,
  the problem is the icon and first screenshot, not the keywords.
- **Test the short description first.** With the brand title kept, it is the
  only high-weight field carrying generic search terms, so it is where a
  change has the most room to move. Play's **Store listing experiments** run
  the A/B test for you.
- **Change one field at a time.** Running the short description and the
  screenshots together teaches you nothing about either.

If after a month the app ranks for "fitness duel" but not "rep counter", that
is the title decision showing up in the data — and the title can be changed in
the Console alone, without a rebuild.

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
AI push-up & squat counter. Duel friends, share a streak with your partner.
```
75 characters (rewritten 2026-10-07 after competitor research: front-loads "AI push-up & squat counter", which matches how people search for this category). Carries "push-up counter", "squat counter", "duel friends", "streak" — five searchable terms in one readable sentence.

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
Count push-ups and squats with your phone camera: no wearable, no tapping. RepChamp is an AI rep counter that turns every workout into a live duel with friends or a shared streak with your partner.

Prop up your phone, step back and start. On-device pose detection tracks your joints in real time, counts every rep and scores your depth and alignment, so you know which reps actually count. A real push-up counter and squat counter, not a timer you tap.

Duel friends in real time
Challenge a friend to a timed workout challenge and watch both scores climb live. Most reps before the clock runs out wins the XP. Nobody online yet? Race an AI training partner, always clearly labelled as AI.

Couples workout and shared streak
Pair with your partner and keep one streak together. It only survives if you both show up, which makes it much harder to quit than a streak of your own. Nudge each other when one of you falls behind. Couple mode is free, always.

Drink water with your panda
Log a glass in one tap (250, 500 or 750 ml) and watch your panda fill its bottle, with your partner's panda right beside it. Send a hug, a high five or a cheer, and add the Android home-screen widget to log water without opening the app.

A plan that sticks
Choose Strength, Yoga, Mind or Together. Follow the 4-week programme that builds you toward 50 push-ups, join the weekly challenge, and see your week at a glance. Guided yoga flows with voice cues and breathing exercises (box breathing, 4-7-8 for sleep) are built in.

Climb the leagues
Bronze, Silver, Gold and Platinum, reset weekly. Earn XP for every set, hold your streak and collect badges for your first duel win, a 100-rep session and perfect form. A fitness leaderboard that resets often enough to stay winnable.

Home workout, no equipment
Every exercise is bodyweight: push-ups, squats, lunges, sit-ups, glute bridges, pike push-ups, high knees, jumping jacks, shoulder rolls and a full-body stretch. No gym, no dumbbells, just your phone and some floor space.

Free and Pro
Try it free: your first 50 reps, no card needed. Couple mode is free, always.
RepChamp Pro is an auto-renewing subscription (price shown in the app and Google Play before you pay; cancel any time in Google Play). It keeps you training past the free reps and unlocks the full exercise library and detailed form reports.

Your video never leaves your phone
Pose detection runs on your device. Your camera feed is never recorded, never uploaded and never shared, in any mode, including live duels. The only photo we store is the profile picture you choose yourself.

Train hard. Train honestly.

---
Rep counts and form scores are estimates from on-device pose detection and can be wrong. RepChamp is a fitness tool, not medical advice. Warm up, train within your ability, and stop if you feel pain or dizziness.

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
| Short description (80) | `AI push-up & squat counter. Duel friends, share a streak with your partner.` |
| Full description (4000) | The block above |
| App icon | `store/icon-512.png` |
| Feature graphic | `store/feature-graphic.png` |
| Phone screenshots | `store/screenshots/*.png` — upload in filename order |
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
- ✅ **Phone screenshots** — four in `store/screenshots/` (Train, Arena,
  Friends, Home), captured 2026-10-07 on the emulator from the current release
  build and composited to 1080×1920. Clears Play's two-shot minimum.
  Two more are still worth capturing, and both need a second person in
  frame: a live session with the pose skeleton, and a couple streak. The
  session shot is the clearest single image of what the app does and should
  lead the listing once it exists.

> Upload the composited files, not the raw captures. Play also enforces a
> rule it does not state on the upload form: the long side may be at most
> twice the short side. A raw 1080×2400 phone grab is 2.22× and is rejected.

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

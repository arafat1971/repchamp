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
| step counter / step tracker | **name** (recommended), short desc, full desc |
| fitness duel (brand) | full desc |

Note the name row: the recommended name carries "step counter" in the
highest-weighted field. Kept on the brand-only name, that field carries no
search term and the short description has to do all of the work.

Deliberately **not** chased: "gym", "weight loss", "diet", "six pack". The
app does none of those. Ranking for them draws installs that uninstall inside
a day, which drags the whole listing down.

---

## App name (30 max)

**Recommended (2026-10-28): put the search term in the name.**

```
RepChamp: Rep & Step Counter
```
28 characters. The name is Play's highest-weighted search field, and the
current name (`Fitness Duel: RepChamp`) carries no term anyone searches for.
"Step counter" is one of the most searched phrases in Health & Fitness, and
the Steps tab is free, so it brings in people who would never search "rep
counter" and then meet the duels and streaks inside.

This changes the 2026-08-03 decision to keep the brand name, for reach. It
needs **no rebuild**: the store name may differ from the launcher label and
`expo.name`, and it can be reverted in the Console in a minute. Safest is to
run it as a **Store listing experiment** against the current name first.

Alternatives:

```
RepChamp: AI Rep Counter
```
24 characters. Narrower and higher intent: only rep-counting searches.

```
Fitness Duel: RepChamp
```
22 characters. The current name, brand only.

Never add "free", "best", "#1", "top" or emoji to the name. Play's metadata
policy rejects them in the title.

---

## Short description (80 max)

Shown under the icon in search, the second-highest ranking field, and the only
body text most people read.

```
AI push-up & squat counter + step tracker. Duel friends and keep a streak going.
```
80 characters (2026-10-28). Adds "step tracker" to the earlier line, so the
listing ranks for the free Steps tab as well as rep counting.

Previous (2026-10-07), for an A/B test:

```
AI push-up & squat counter. Duel friends, share a streak with your partner.
```

---

## Full description (4000 max)

The first ~170 characters show before "read more". The opening sentence names
both halves of the app (reps and steps) and the duel, so search and the first
glance agree.

```
Your camera counts every push-up and squat, and your phone counts every step. RepChamp is an AI rep counter and step tracker that turns each workout into a live duel with friends.

No wearable, no tapping, no gym. Prop up your phone, step back and move. On-device pose detection tracks your joints in real time, counts each clean rep and scores your depth and form, so you know which reps really count.

★ Duel friends live
Send a challenge, start the clock and watch both scores climb. Most reps wins the XP. Nobody online? Race an AI training partner, always clearly labelled as AI.

★ Step counter and walk tracker
See today's steps against a daily goal you set, with distance, calories and active minutes. Tap Walk now to track a walk live with pace, and add the Steps widget to your home screen. Background step counting keeps your daily total complete, with a small notification you can switch off in Settings.

★ Couples workout and a shared streak
Pair with your partner, walk and train together, and keep one streak that only survives if you both show up. Race each other's steps, share one team goal and nudge each other off the sofa.

★ Streaks that forgive a bad day
Every 7-day run earns a streak freeze that saves your streak on a missed day. Hit a streak milestone, beat your personal best or post your biggest day, and RepChamp tells you.

★ A plan that sticks
Pick Strength, Yoga, Mind or Together. Follow the 4-week programme that builds you to 50 push-ups, join the weekly challenge and get a weekly recap you can share. Guided yoga with voice cues and breathing exercises (box breathing, 4-7-8 for sleep) are built in.

★ Climb the leagues
Bronze, Silver, Gold and Platinum, reset every week, so the leaderboard stays winnable. Earn XP for every set and collect badges for your first duel win, a 100-rep session and perfect form.

★ Drink water with your panda
Log a glass in one tap and watch your panda fill its bottle beside your partner's. Send a hug or a high five, and log water from the home-screen widget.

★ Home workout, no equipment
Push-ups, squats, lunges, sit-ups, glute bridges, pike push-ups, high knees, jumping jacks, shoulder rolls and a full-body stretch. Just your phone and a bit of floor.

RepChamp Pro
RepChamp is free to download, and the step counter is free to use. Counting reps needs RepChamp Pro, an auto-renewing subscription (weekly, monthly or yearly; the price is shown in the app and on Google Play before you pay, and you can cancel any time in Google Play). Pro covers solo training, live duels and couple mode, plus the full exercise library, detailed form reports and extra streak freezes. Each partner needs their own subscription for couple mode. Water logging is free for your first glass and part of Pro after that. The first time you pair with a partner, you both get 10 free reps to train together.

Your video never leaves your phone
Pose detection runs on your device. Your camera feed is never recorded, uploaded or shared, in any mode, including live duels. The only photo we store is the profile picture you choose.

Train hard. Train honestly.

---
Rep counts, step counts and form scores are estimates and can be wrong. RepChamp is a fitness tool, not medical advice. Warm up, train within your ability, and stop if you feel pain or dizziness.

Privacy policy: https://repchamp.web.app/privacy
Delete your account: https://repchamp.web.app/delete-account
Support: arafathossain455@gmail.com
```

About 3,462 characters, inside 4000. Each search term appears 1–3
times except "streak" and "duel", which are the product itself.

The near-miss "reps to beat your best" moment (PR #53) is left out until it
ships in a release. Add a line under "Streaks that forgive a bad day" when it
does.

---

## Why the copy says what it says

**"AI" is used carefully.** The app does run a real pose-detection model
(MoveNet), so "AI rep counter" is accurate. What it avoids is implying the AI
partners are human — Play's fake-engagement policy and App Store 3.2.2 both
care about that, and the listing states plainly that they are labelled.

**The Pro section says exactly what the wall does.** `FREE_REP_LIMIT` in
`src/domain/hardPaywall.ts` is 0 and there is no free trial, so the listing
promises no free reps. `COUPLE_WALL_ENABLED` is on (2026-10-26), so couple mode
is described as Pro, per partner. Water is walled after `FREE_WATER_LOGS` (1)
glass, so the listing says so. The only free training is the one-time pairing
bonus of `PAIRING_BONUS_REPS` (10) reps, both in the same file. Promising
something free that the app then walls is the kind of mismatch that draws a
refund complaint rather than a rejection, which is worse. If any of those
constants change, change this section with them.

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
| App name (30) | `RepChamp: Rep & Step Counter` (or keep `Fitness Duel: RepChamp`) |
| Short description (80) | `AI push-up & squat counter + step tracker. Duel friends and keep a streak going.` |
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

## Reaching a much bigger audience

Copy gets the listing found. These decide how many people it reaches, roughly
in order of impact:

1. **Translated listings.** Play shows each country its own language, and an
   English-only listing ranks poorly in every other one. Add translations under
   **Store listings → Manage translations** for the biggest fitness markets:
   Spanish (es-419 and es-ES), Portuguese (pt-BR), Hindi, Indonesian, German,
   French, Turkish, Arabic, Japanese and Korean. Translate the name too
   ("contador de pasos", "contador de flexiones" in Spanish). Do not machine
   translate blindly: have a native speaker read the name and short
   description. The app itself stays English, so say so: add "App in English."
   as the last line of each translated description.
2. **First two screenshots.** Most people decide on the icon and the first two
   screenshots without opening the description. Lead with the live pose
   skeleton counting a push-up (caption: "Your camera counts every rep"), then
   the Steps ring (caption: "Steps, counted all day"), then a live duel
   ("Duel friends live"). Big caption text, one idea per shot. See
   `STORE_SCREENSHOTS.md`.
3. **Promo video.** A 30-second YouTube clip of a rep being counted is the
   clearest proof the AI works. It plays above the screenshots.
4. **Ratings.** Ranking and conversion both fall off sharply below 4.0 stars.
   The in-app review prompt (`src/domain/reviewPrompt.ts`) asks after good
   moments only. Keep it that way, and reply to every 1–2 star review in
   Play Console.
5. **Custom store listings.** Play lets you show a different listing to a
   country or to traffic from a specific ad or link, for example a
   steps-first listing for walkers, a duel-first one for friends' invite links.

---

## After publishing

Ranking is not set at submission. Three things to do once live:

- **Watch Store performance → conversion.** If install-per-view is under ~20%,
  the problem is the icon and first screenshot, not the keywords.
- **Test the name first, then the short description.** They are the two
  highest-weight fields, so they have the most room to move. Play's **Store listing experiments** run
  the A/B test for you.
- **Change one field at a time.** Running the short description and the
  screenshots together teaches you nothing about either.

If after a month the app ranks for "fitness duel" but not "rep counter", that
is the title decision showing up in the data — and the title can be changed in
the Console alone, without a rebuild.

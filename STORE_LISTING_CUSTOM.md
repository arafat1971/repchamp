# Custom store listing: Steps-first (high-volume)

A second Play listing aimed at the biggest search audience in Health & Fitness:
people looking for a **step counter / pedometer / walking tracker**. The
default listing sells rep counting and duels; this one leads with the Steps
tab, which is free, and lets people meet the duels and streaks inside.

Every claim is checked against `origin/claude/release-2026-10-28`
(`app/steps.tsx`, `plugins/withStepCounter.js`, `src/domain/hardPaywall.ts`).
Only publish it while the live build has the Steps tab.

Limits: name 30, short description 80, full description 4000.

---

## Play Console fields

**Grow users → Store presence → Custom store listings → Create listing**

| Field | Value |
| --- | --- |
| Listing name (internal) | `Steps-first – high volume` |
| App name (30) | `Step Counter & Walk: RepChamp` (29) |
| Short description (80) | `Step counter & walk tracker. Race your partner's steps and keep a streak alive.` (79) |
| Full description | Block below |
| Icon / feature graphic | Same as default (`store/icon-512.png`, `store/feature-graphic.png`) |
| Screenshots | Lead with Home (step ring), then Train, Arena, Friends |
| Targeting | See "Who sees it" below |

No "free", "best", "#1" or emoji in the name: Play's metadata policy rejects
them there.

### Full description

```
Count every step, every walk and every push-up. RepChamp is a step counter and walking tracker with a daily goal, a live Walk now mode and an AI rep counter for home workouts.

★ Step counter and pedometer
See today's steps against a daily goal you set, with distance, calories and active minutes. Background step counting keeps your daily total complete, with a small notification you can switch off in Settings. The step counter is free to use.

★ Walk now: a live walking tracker
Tap Walk now to track a walk as it happens, with your pace and steps. Check the last seven days, keep a step streak and earn badges for your biggest days.

★ Steps widget
Add the Steps widget to your home screen and see your count without opening the app.

★ Walk together
Pair with your partner, race each other's steps live and share one team goal. Nudge each other out the door when one of you falls behind.

★ Streaks that forgive a bad day
Every 7-day run earns a streak freeze that saves your streak on a missed day. Hit a milestone or beat your personal best and RepChamp tells you.

★ AI rep counter for home workouts
Prop up your phone and your camera counts push-ups and squats for you. On-device pose detection tracks your joints in real time and scores your depth and form. Duel friends live, or race an AI training partner, always clearly labelled as AI.

★ A plan that sticks
Pick Strength, Yoga, Mind or Together. Follow the 4-week programme that builds you to 50 push-ups, join the weekly challenge, get a weekly recap you can share, and climb leagues that reset every week. Guided yoga and breathing exercises are built in.

RepChamp Pro
RepChamp is free to download, and the step counter is free to use. Counting reps needs RepChamp Pro, an auto-renewing subscription (weekly, monthly or yearly; the price is shown in the app and on Google Play before you pay, and you can cancel any time in Google Play). Pro covers solo training, live duels and couple mode, plus the full exercise library, detailed form reports and extra streak freezes. Each partner needs their own subscription for couple mode. Water logging is free for your first glass and part of Pro after that. The first time you pair with a partner, you both get 10 free reps to train together.

Your video never leaves your phone
Pose detection runs on your device. Your camera feed is never recorded, uploaded or shared.

---
Step counts, distance, calories, rep counts and form scores are estimates and can be wrong. RepChamp is a fitness tool, not medical advice. Warm up, train within your ability, and stop if you feel pain or dizziness.

Privacy policy: https://repchamp.web.app/privacy
Delete your account: https://repchamp.web.app/delete-account
Support: arafathossain455@gmail.com
```

---

## Status in Play Console (2026-10-28)

`steps_search custom listing` was **sent for review** on 2026-10-28 (Play says
reviews usually take up to 7 days). It was duplicated from the default listing,
so it has the same icon, feature graphic and 5 screenshots, and the same AI
asset label. The live `repchamp_search` listing moved to priority 2. That has no
effect, because no keyword is in both listings.

- **Audience:** search keyword, all 177 countries, 50% rollout (the other half
  keep seeing the default listing, which makes the two comparable). Play says
  the rollout can't be lowered after publishing.
- **Keywords (50):** step counter, pedometer, step tracker, steps counter,
  steps tracker, step counter app, pedometer app, step tracker app, step
  counter free, pedometer free, free pedometer, walking tracker, walk tracker,
  walking tracker app, walking app, walk app, steps app, daily steps, daily
  step counter, daily step tracker, step goal, daily step goal, step counter
  widget, pedometer widget, steps widget, walk counter, walking counter,
  footstep counter, foot step counter, distance walked tracker, walk distance
  tracker, step counter calories, pedometer step counter, pedometer and step
  counter, step counter pedometer, 10000 steps, 10000 steps a day, 10k steps,
  10k steps a day, step streak, walking streak, brisk walk tracker, power
  walking tracker, live walk tracker, walk pace tracker, step history, steps
  history, step counter for android, pedometer for android, step counting app.
  None overlap the 356 in the live `repchamp_search custom listing`
  (reps, duels, couples, social steps).

### What a keyword listing does and doesn't do

It changes what someone sees **after** Play has decided to show RepChamp for
that search. It doesn't make Play rank the app for the search. Today nearly all
of keyword-listing traffic is people typing "repchamp" by name, and Play
has no data for "step counter" on this app. Ranking for generic terms comes
from the default listing's name and short description, plus install rate.
Putting "Step Counter" in the default listing's name
(`RepChamp: Rep & Step Counter`, per `STORE_LISTING.md` on
`claude/store-listing-reach`) is what gets the app shown for those searches.
This listing then converts that traffic.

## Tags (Store settings → Tags, up to 5)

Changed 2026-10-28 from Activity tracker, Health & fitness, Weight loss,
Workout to **Activity tracker, Health & fitness, Meditation, Workout, Yoga**.
Weight loss came out because the app doesn't do it, and `STORE_LISTING.md`
deliberately avoids that audience. Yoga and Meditation match the guided yoga and
breathing in the Mind plan. Play has no pedometer/step tag. Play notes that tag
changes can take up to 60 days to take effect.

## Measuring it

Compare the custom listing's store-listing-visitor → install conversion with
the default after 2 weeks (Statistics → filter by custom store listing). If it
converts worse, retire it; it costs nothing to keep or remove.

## Default listing rename (2026-10-28, in review)

- Name: `Fitness Duel: RepChamp` → `RepChamp: Rep & Step Counter`
- Short description → `AI push-up & squat counter + step tracker. Duel friends and keep a streak going.`
- `repchamp_search` inherits the name from the default listing, so its name
  changes too. Its own short description is unchanged.

**Still open: the default full description is stale.** The live full
description still says "Try it free: your first 50 reps, no card needed" and
"Couple mode is free, always". The app has `FREE_REP_LIMIT = 0`, and
`COUPLE_WALL_ENABLED` has been on since 2026-10-26. It also doesn't mention
steps. The owner chose to send only the name and short description for now. The
verified replacement is the full description in `STORE_LISTING.md` on
`claude/store-listing-reach`.

Gotcha: saving the default listing opens a "could affect 1 listing" dialog that
must be confirmed. If it's dismissed, nothing is saved.

---

# Custom store listing: Couples-first (problem → solution)

Draft `couples_search custom listing`, saved 2026-10-28, **not sent for review**.
Duplicated from the default listing (same visuals), search-keyword audience, all
countries, 50% rollout.

It's written around the problem couple mode solves. Training alone is easy to
skip, so the copy leads with that problem, then shows how the app solves it:
live together sets, a shared streak, couple levels ("grow as a couple"), the
daily ritual, nudges and long distance.

Claims checked against `origin/claude/release-2026-10-28`:
- Together sets: a cooperative duel on two phones with live counts and one
  team score (`train.tsx`, `TogetherHud`).
- The couple streak only advances on days both trained
  (`calculateCoupleStreak`), and a 7-day both-trained run earns a freeze.
- Couple tiers New Duo → Training Partners → In Step → Power Couple →
  Unstoppable → Legends (`COUPLE_TIERS`), plus badges One Week Strong, Monthly
  Duo and Thousand Club.
- Ritual: 6 habits, live presence (`hereAt`) and pokes (`domain/ritual.ts`).
- Nudges reach a closed app (Expo Push). The partner dashboard has share
  switches, and there's an Android partner widget.
- Pro: couple mode is walled for each partner, there are 10 free reps on first
  pairing, water is free for 1 glass, and steps are free.

| Field | Value |
| --- | --- |
| App name | `Couple Workout Live: RepChamp` (29) |
| Short description | `Train together live, even miles apart. One shared streak. Grow as a couple.` (75) |

### Full description (2,901 chars)

```
Working out alone is easy to skip. Working out with your partner is not. RepChamp is a couple workout app where you train together live, keep one shared streak and grow as a couple, on two phones, in the same room or miles apart.

★ The problem: motivation fades when you train alone
One of you skips a day, then the other, and the plan quietly dies. RepChamp makes your partner part of every workout, so showing up becomes something you do for each other.

★ Train together live
Start a together set and you each film yourself on your own phone. On-device AI counts every push-up and squat, and you watch both counts climb live, adding up to one team score. Prefer a challenge? Race each other head to head instead.

★ One shared streak
Your couple streak only grows on days you both train. Miss a day and your partner feels it, which is exactly what keeps you both going. Every 7-day run earns a streak freeze that saves the streak on a bad day.

★ Grow as a couple
Every rep you do together earns couple points. Level up from New Duo to Training Partners, In Step, Power Couple, Unstoppable and Legends, and unlock badges like One Week Strong, Monthly Duo and Thousand Club.

★ A daily ritual for two
Pick your daily habits together: water, a walk, moving, stretching, eating greens and rest. See when your partner is in the app, tick habits off side by side and send a live poke.

★ Nudge, cheer and stay close
Falling behind? Send a nudge that reaches your partner even when their app is closed. See today head to head, with reps, steps and water, and choose exactly what you share.

★ Long distance? Still together
Pair once with a code, QR or link, and train together from different homes, cities or countries. Add the Android home-screen widget to see your partner's day at a glance.

★ Steps and water, side by side
Race each other's steps, share one team goal and log water with your pandas.

RepChamp Pro
RepChamp is free to download. Couple mode, counting reps and live sets need RepChamp Pro, an auto-renewing subscription (weekly, monthly or yearly; the price is shown in the app and on Google Play before you pay, and you can cancel any time in Google Play). Each partner needs their own subscription. Water logging is free for your first glass and part of Pro after that. The first time you pair, you both get 10 free reps to train together. The step counter is free.

Your video never leaves your phone
Pose detection runs on your device. Your camera feed is never recorded, uploaded or shared, including in live sets with your partner.

---
Rep counts, step counts and form scores are estimates and can be wrong. RepChamp is a fitness tool, not medical advice. Warm up, train within your ability, and stop if you feel pain or dizziness.

Privacy policy: https://repchamp.web.app/privacy
Delete your account: https://repchamp.web.app/delete-account
Support: arafathossain455@gmail.com
```

### Keywords (74, no overlap with repchamp_search or steps_search)

couple workout, couples workout, couple workout app, couples workout app, couple workout live, live couple workout, couples workout at home, couple workout at home, partner workout, partner workout app, workout with partner, workout with my partner, workout with girlfriend, workout with boyfriend, workout with husband, workout with wife, couple fitness, couples fitness, couple fitness app, couples fitness app, couple exercise, couple exercise app, couples exercise, couple challenge app, couples challenge app, couple fitness challenge, couple streak, couples streak, shared streak, shared streak app, couple habit tracker, couples habit tracker, couple daily habits, couple app, couples app, app for couples, couple goals app, power couple, power couple app, grow together app, couple level up, couple growth, couple growth app, long distance couple app, long distance workout, long distance couple workout, long distance fitness, train together, train together app, workout together, workout together app, workout together apart, live workout with partner, virtual workout partner, virtual workout buddy, workout buddy app, couple accountability app, partner accountability app, couple nudge app, couple health tracker, couple water tracker, couple step tracker, couple steps challenge, couple widget, partner widget, couple home screen widget, couple ritual app, couples ritual, two player workout, 2 player workout, workout for two, exercise for two, couple squat challenge, couple push up challenge

The live `repchamp_search` listing already targets ~40 couple phrases (for
example "couple fitness tracker", "fitness duo", "apps for couples", "ldr app").
Those keep showing the rep-first copy. If this listing converts better after 2
weeks, move those phrases over here.

Screenshot to add later: `store/mockups/partner-reps-mockup.png` would make a
stronger first screenshot for this listing than the inherited Home shot.

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

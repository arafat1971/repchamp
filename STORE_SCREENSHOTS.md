# Play Store screenshots — capture guide

Play needs **2 minimum, 8 maximum** phone screenshots, 16:9 or 9:16, each side
between 320px and 3840px. A Pixel 7a screenshot (1080×2400) qualifies as-is.

These have to be captured on a real device running the app — nobody can
generate them from the repo, because the whole point is showing the pose
overlay working on a real body. Budget 20 minutes and a friend.

Screenshots move install conversion more than any words in the listing, and
conversion is what Play's ranking actually weights. This is the highest-value
remaining task.

---

## Capture setup

Run a release-quality build on the Pixel 7a (see `PUBLISH_RUNBOOK.md` §1):

```bash
eas build --platform android --profile preview
```

Before capturing:

- **Sign in as a real-looking account.** Set a display name, pick an avatar.
  A screenshot of "Athlete" with a grey placeholder sells nothing.
- **Get real numbers on screen.** Do a few sessions first so streaks, XP and
  league standing are non-zero. Empty states photograph badly.
- **Turn on Do Not Disturb.** A notification banner in a store screenshot is
  an instant amateur signal.
- **Full battery, clean status bar.** Or crop the status bar off entirely —
  Play allows it and it looks deliberate.

Capture with power + volume-down, then pull them off:

```bash
adb pull /sdcard/Pictures/Screenshots ./store/screenshots-raw
```

---

## The five to capture, in listing order

The first two show without swiping in search results, so they carry the whole
argument. Order matters more than count — four strong beats eight padded.

### 1. Live session, pose skeleton overlaid — `app/(tabs)/train.tsx`

The single clearest image of what the app does. Someone mid-push-up, skeleton
drawn over the body, rep count visible and non-zero.

Caption: **"Your camera counts every rep"**

Get the rep counter reading something like 12, not 1. Mid-rep beats top-of-rep
— the bent-arm position reads as effort.

### 2. Duel HUD mid-race, both scores climbing — `app/duel/[id].tsx`

The differentiator, and the reason someone picks this over any other rep
counter. Both athletes' scores visible, clock running, scores close together.

Caption: **"Race a friend in real time"**

A close score (14–13) sells the tension. A blowout does not. Worth staging
this one deliberately with the friend you test duels with.

### 3. Couple mode / shared streak — `app/modal/couple-card.tsx`

The emotional hook, and a genuine differentiator: couple mode is permanently
free.

Caption: **"Share one streak with your partner"**

Needs a streak of at least ~5 days to be persuasive.

### 4. Profile — badges and league standing — `app/(tabs)/profile.tsx`

Progression and reason to return. Badges earned, league tier visible, XP bar
part-filled.

Caption: **"Climb Bronze to Platinum"**

A part-filled XP bar reads better than a full or empty one — it implies
momentum.

### 5. Arena / leaderboard — `app/(tabs)/arena.tsx`

Social proof and competition.

Caption: **"Weekly leaderboards that reset"**

If the leaderboard is thin pre-launch, skip this one. A leaderboard with three
names on it argues against you. Four strong screenshots beat five where one is
embarrassing.

---

## Captions

Bake short caption text into the image above the screen content — Play does
not index caption text, but captioned screenshots convert measurably better
than bare grabs.

Keep it consistent:

- Same font, size and position on every image
- Brand green `#22C55E` or `#16A34A` background band, white text
- Six words maximum per caption
- Never cover the UI element the caption is describing

The tokens are in `src/theme/tokens.ts` if you want exact brand colours.

---

## What not to do

- **No fake data.** A staged leaderboard of invented names is the same
  fake-engagement problem the app deliberately avoids, and a reviewer who
  installs the app will see the mismatch.
- **No device frames** that imply an iPhone. The Play listing is Android.
- **No claims the app does not deliver.** Every screenshot is a promise; a
  refund complaint costs more than an install is worth.
- **No tablet screenshots.** `supportsTablet` is false, so the listing stays
  phone-only rather than claiming a layout that does not exist.

---

## Where to put them

Drop the finished, captioned images in `store/screenshots/` so the listing
assets live together with `store/feature-graphic.png` and `store/icon-512.png`.

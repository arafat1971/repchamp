# Play Store — Data Safety form answers

Fill the Play Console → App content → Data safety form with these answers. They're
derived from an audit of what the code **actually** collects — accurate declarations
avoid rejection. Re-check if you add features (e.g. real analytics, ads, location).

Key fact to get right: **the camera/video feed is processed entirely on-device and is
never uploaded or recorded as video.** The avatar photo the user picks, workout stats,
and — as of the duel/together photo-share feature — one still action shot per live
duel/together set (shown only to that set's opponent/partner) leave the device.
Declare accordingly.

---

## 1. Does your app collect or share any of the required user data types?
**Yes** — it collects some data (for account sync, leaderboards, couple mode).

## 2. Is all of the user data encrypted in transit?
**Yes.** All traffic goes to Firebase (Firestore/Auth/Storage) and PostHog/Sentry over HTTPS/TLS.

## 3. Do you provide a way for users to request that their data is deleted?
**Yes.** In-app: Settings → Your Data → **Delete my account**. It erases the profile,
leaderboard row, matchmaking ticket, friend and block lists, push token, the shared couple
record, the avatar, and the athlete's own duel/together action shots. Also provide the
support email arafathossain455@gmail.com for requests.

Two things worth knowing if you are asked to substantiate this:
- The deletion **reports failure** rather than silently claiming success — if any erasure is
  rejected it throws, names what survived, and the athlete can retry.
- The opponent's action shot in a shared duel is deliberately **not** deleted: it is their
  photograph, not the deleting athlete's.

---

## Data types collected — declare each as follows

For each: **Collected = Yes**, **Shared = No** (you don't sell/share with third parties;
Firebase/PostHog/Sentry are processors, not "sharing" under Play's definition), and set
purpose + optionality as noted.

### Personal info
| Data | Collected | Purpose | Optional? |
|---|---|---|---|
| **Name** (username / display name) | Yes | App functionality, account | Required |
| **Email address** | Yes | Account management (only if the user signs up with email; anonymous users have none) | Optional |
| **User IDs** (auth uid) | Yes | App functionality, analytics, account | Required |

> Do NOT declare: physical address, phone number, race/ethnicity, political/religious
> beliefs, sexual orientation — none are collected.

### Photos and videos
| Data | Collected | Purpose | Optional? |
|---|---|---|---|
| **Photos** (profile avatar the user picks; one action-shot still per live duel/together set, shown only to that set's opponent/partner) | Yes | App functionality (profile picture; shared result card in duel/together modes) | Optional (solo/practice sessions never upload a photo) |
| **Videos** | **No** | The camera feed is processed on-device for rep counting and is never uploaded or recorded as video | — |

> Still answer **No** to collecting videos — that hasn't changed. But the Photos row now
> also covers the duel/together action shot, so it can no longer be scoped to "avatar only."
> In the app's Data-safety narrative and store listing, state clearly: "Workout video is
> processed on your device and never leaves your phone. In live duels and together sessions,
> one still photo per set is shared with your opponent or partner on the result card."

### App activity / app info and performance
| Data | Collected | Purpose | Optional? |
|---|---|---|---|
| **App interactions** (screens used, workouts, reps, wins — product analytics via PostHog) | Yes | Analytics, app functionality | Required |
| **Crash logs** (Sentry, when enabled) | Yes | Crash prevention / diagnostics | Required |
| **Diagnostics** (performance) | Yes (if Sentry enabled) | App performance | Required |

### Financial info
| Data | Collected | Purpose | Optional? |
|---|---|---|---|
| **Purchase history** | Handled by Google Play / RevenueCat, not stored by the app directly | Account (subscription state) | — |

> Subscriptions are processed by Google Play + RevenueCat. The app reads entitlement
> state, it does not store card/payment data. If Play flags it, declare "Purchase history:
> Yes, purpose Account management" and note it's handled by the billing provider.

### Data types you must answer NO to (not collected)
- **Location** (approximate or precise) — No
- **Contacts** — No
- **Calendar** — No
- **Health and fitness** — ⚠️ Judgement call: you track *reps/workouts*, which is activity
  data, but you do NOT collect medical/health-record data. Declare rep counts under **App
  activity**, and answer **No** to Play's "Health and fitness → Health info" (that category
  is for medical/clinical data). If unsure, Play's category is narrow — rep counts are app
  activity, not health records.
- **Financial → payment info / credit score** — No (billing provider handles payment)
- **Messages / audio / files / web browsing** — No

---

## Data collection details (per Play's follow-up questions)
- **Is this data processed ephemerally?** No — profile/stats persist to sync across devices.
- **Is data collection required or can users choose?** Core account data is required to use
  cloud features; email and avatar are optional; the app is usable in a local-only mode.
- **Who do you share data with?** No third-party sharing. Processors: Google Firebase
  (auth, database, storage), PostHog (anonymous product analytics), Sentry (crash
  diagnostics), Google Play + RevenueCat (billing). List these as processors, not recipients.

---

## Privacy policy URL (required field)
`https://repchamp.web.app/privacy`

## Companion narrative for the store listing (recommended)
> RepChamp counts your reps using pose detection that runs entirely on your device. Your
> camera feed is never recorded as video or uploaded. In live duels and together sessions,
> one still action photo per set is shared with your opponent or partner on the result
> card — solo and practice sets never share a photo. We store your profile, workout stats,
> and (if you pair) your shared couple data to sync across devices and power leaderboards.
> You can export or delete all of it anytime in Settings.

---

## Field-by-field answers (2026-08-01)

Verified against the code, not from memory. Every claim below traces to a specific call site.

| Play Console field | Answer | Why |
|---|---|---|
| Does your app collect or share user data? | **Yes** | Firestore profile + leaderboard sync |
| Is data encrypted in transit? | **Yes** | All traffic is HTTPS/TLS to Firebase, PostHog, Sentry |
| Can users request deletion? | **Yes** | Settings → Your Data → Delete my account |
| Name | Collected, **not** shared. Required. App functionality | `displayName` on the profile doc |
| Email address | Collected, **not** shared. Optional | Only for Google sign-in; anonymous accounts have none |
| User IDs | Collected, **not** shared. Required. App functionality + Analytics | Auth uid; PostHog ties events to it |
| **Photos** | Collected, **not** shared. Optional | Two paths only: the avatar the user picks (`avatars/{uid}.jpg`) and one action shot per live duel/together set (`duelPhotos/{duelId}/{seat}.jpg`) |
| **Videos** | **Not collected** | The camera feed is analysed on-device by MoveNet and never recorded or uploaded. Still true — the action shot is a single frame, not video |
| App interactions | Collected, **not** shared. Required. Analytics | 37 `track()` call sites; event names only, no free text |
| Crash logs / diagnostics | Collected, **not** shared. Required | Sentry |
| Purchase history | Collected, **not** shared. Required | RevenueCat entitlement state |
| Location, contacts, calendar, health records, financial info, messages | **Not collected** | No such API is called anywhere |

### The two answers that most often get flagged

**Photos = Yes.** It is tempting to answer No because the app is a rep counter, but a real
photograph of the athlete leaves the device in duel and together modes. Answering No here
while shipping that feature is the kind of mismatch Play rejects for.

**Videos = No** is still correct and should not be changed. The distinction that matters: the
camera *stream* is processed frame-by-frame on-device and discarded; only one still frame is
ever uploaded, and only in multiplayer modes.

### Data sharing

Answer **No** to sharing throughout. Firebase, PostHog, Sentry, Google Play and RevenueCat are
processors acting on your instructions, which is not "sharing" under Play's definition. Nothing
is sold, and no advertising SDK is present.

---

## ⚠️ Keep this accurate
This reflects the code as of the audit. If you later add: real-time analytics with more PII,
ads/ad SDKs, location, health-record features, or server-side video — you MUST update this
form before the next release, or Play will flag a mismatch.

# Play Store — Data Safety form answers

Fill the Play Console → App content → Data safety form with these answers. They're
derived from an audit of what the code **actually** collects — accurate declarations
avoid rejection. Re-check if you add features (e.g. real analytics, ads, location).

Key fact to get right: **the camera/video feed is processed entirely on-device and is
never uploaded or recorded.** Only the avatar photo the user picks, plus workout stats,
leave the device. Declare accordingly.

---

## 1. Does your app collect or share any of the required user data types?
**Yes** — it collects some data (for account sync, leaderboards, couple mode).

## 2. Is all of the user data encrypted in transit?
**Yes.** All traffic goes to Firebase (Firestore/Auth/Storage) and PostHog/Sentry over HTTPS/TLS.

## 3. Do you provide a way for users to request that their data is deleted?
**Yes.** In-app: Settings → Your Data → **Delete my account** (erases profile, leaderboard,
matchmaking, shared couple record, and avatar). Also provide the support email
`support@peachtraders.xyz` for requests.

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
| **Photos** (profile avatar the user picks) | Yes | App functionality (profile picture) | Optional |
| **Videos** | **No** | The camera feed is processed on-device for rep counting and is never uploaded or recorded | — |

> This is the important one: answer **No** to collecting videos. In the app's Data-safety
> narrative and store listing, state clearly: "Workout video is processed on your device and
> never leaves your phone."

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
> camera feed is never recorded or uploaded. We store your profile, workout stats, and (if
> you pair) your shared couple data to sync across devices and power leaderboards. You can
> export or delete all of it anytime in Settings.

---

## ⚠️ Keep this accurate
This reflects the code as of the audit. If you later add: real-time analytics with more PII,
ads/ad SDKs, location, health-record features, or server-side video — you MUST update this
form before the next release, or Play will flag a mismatch.

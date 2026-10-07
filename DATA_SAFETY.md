# Play Store — Data Safety form answers

Fill the Play Console → App content → Data safety form with these answers.

> **Audit 2026-10-07:** the form live on Play declared only *Approximate location*. Everything
> below except that row was missing. Code audit also corrected the Health and fitness answer
> (steps, water and reps are Fitness info). Sentry and PostHog are declared as collected; they
> only run when `EXPO_PUBLIC_SENTRY_DSN` / `EXPO_PUBLIC_POSTHOG_KEY` are set in the build —
> remove those rows if neither is ever set.

They're derived from an audit of what the code **actually** collects — accurate declarations
avoid rejection. Re-check if you add features (e.g. real analytics, ads, location).

Key fact to get right: **the camera/video feed is processed entirely on-device and is
never uploaded or recorded as video.** The only image that leaves the device is the
avatar photo the user picks; workout stats leave too. Declare accordingly.

The duel/together action-shot share was **removed** — no session frame is uploaded any
more. Photos still answers **Yes** because of the avatar.

---

## 1. Does your app collect or share any of the required user data types?
**Yes** — it collects some data (for account sync, leaderboards, couple mode).

## 2. Is all of the user data encrypted in transit?
**Yes.** All traffic goes to Firebase (Firestore/Auth) and PostHog/Sentry over HTTPS/TLS.

## 3. Do you provide a way for users to request that their data is deleted?
**Yes.** In-app: Settings → Your Data → **Delete my account**. It erases the profile,
leaderboard row, matchmaking ticket, friend and block lists, push token, and the shared
couple record. The avatar is a field on the profile document, so deleting the profile
deletes the photo with it. Also provide the
support email arafathossain455@gmail.com for requests.

Worth knowing if you are asked to substantiate this: the deletion **reports failure**
rather than silently claiming success — if any erasure is rejected it throws, names what
survived, and the athlete can retry.

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
| **Photos** (profile avatar the user picks) | Yes | App functionality (profile picture) | Optional (no session ever uploads a camera frame) |
| **Videos** | **No** | The camera feed is processed on-device for rep counting and is never uploaded or recorded as video | — |

> Answer **No** to collecting videos. The Photos row is scoped to the avatar only — the
> duel/together action shot was removed, so no camera frame is uploaded in any mode. In
> the store listing, state clearly: "Workout video is processed on your device and never
> leaves your phone."

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

### Location
| Data | Collected | Shared | Purpose | Optional? |
|---|---|---|---|---|
| **Approximate location** | Yes | **Yes** — Open-Meteo (third party, not a processor) | App functionality (widget weather) | Optional: only when "Real weather" is switched on; coordinates rounded to ~10 km before leaving the phone (`src/services/weather.ts`) |

### Health and fitness  *(added 2026-10-07 after a code audit)*
| Data | Collected | Purpose | Optional? |
|---|---|---|---|
| **Fitness info** — reps and sets, daily steps (pedometer), water intake | Yes | App functionality, analytics | Steps and water are shared with the paired partner by default (`DEFAULT_SHARING` in `src/domain/partnerSharing.ts` is `{ steps: true, water: true }`), each with its own switch; rep counts sync for leaderboards and history |
| **Health info** (medical / clinical) | No | — | — |

Steps and water used to be answered "No / app activity". They are not: they leave the
device, are stored, and are shown to another user, so Play's *Fitness info* applies.

### Device or other IDs  *(added 2026-10-07)*
| Data | Collected | Purpose | Optional? |
|---|---|---|---|
| **Device or other IDs** — Expo push token, Firebase installation / App Check identifiers | Yes | App functionality (push notifications, abuse protection), account | Push token only after the notification permission is granted |

### Financial info *(confirm)*
| Data | Collected | Purpose | Optional? |
|---|---|---|---|
| **Purchase history** | Yes — subscription state held by RevenueCat against the user ID | App functionality, account | Only for subscribers |

### Data types you must answer NO to (not collected)
- **Precise location** — No (`ACCESS_FINE_LOCATION` and background location are blocked in the manifest). Approximate location is **Yes**; see the Location table.
- **Contacts** — No
- **Calendar** — No
- **Health and fitness → Health info** — No (no medical or clinical data). See the
  **Fitness info** row above, which is Yes.
- **Financial → payment info / credit score** — No (billing provider handles payment)
- **Messages / audio / files / web browsing** — No

> **Audio is No, and the manifest now agrees.** VisionCamera merges
> `RECORD_AUDIO` in for its optional video-with-audio path, which this app never
> uses — `expo-audio` only plays sounds, and nothing anywhere asks for the mic.
> A microphone permission you cannot explain invites a review question and drags
> the Audio category into this form for a capability the app does not have, so
> `android.blockedPermissions` in `app.json` strips it (along with
> `SYSTEM_ALERT_WINDOW`, a dev-client overlay with no place in a release build).
>
> Confirmed against the *merged* release manifest — the one that ships — not
> just the source manifest:
>
> ```bash
> cd android && ANDROID_HOME=~/Library/Android/sdk SENTRY_DISABLE_AUTO_UPLOAD=true \
>   ./gradlew :app:processReleaseManifest
> grep -oE 'android:name="android\.permission\.[A-Z_]+"' \
>   app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml | sort -u
> ```
>
> `CAMERA` must still be present; `RECORD_AUDIO` and `SYSTEM_ALERT_WINDOW` must not.

---

## Data collection details (per Play's follow-up questions)
- **Is this data processed ephemerally?** No — profile/stats persist to sync across devices.
- **Is data collection required or can users choose?** Core account data is required to use
  cloud features; email and avatar are optional; the app is usable in a local-only mode.
- **Who do you share data with?** No third-party sharing. Processors: Google Firebase
  (auth, database, storage), PostHog (anonymous product analytics), Sentry (crash
  diagnostics), Google Play + RevenueCat (billing). List these as processors, not recipients.

---

## Advertising ID — answer **No**

Play Console → **App content → Advertising ID**.

Answering yes here (the defensive instinct) produces a release-blocking error,
because the declaration then disagrees with the manifest:

> Your advertising ID declaration says that your app uses advertising ID. A
> manifest file in one of your active artifacts doesn't include the
> `com.google.android.gms.permission.AD_ID` permission.

**No** is also the truthful answer. Checked 2026-08-06 against the shipping
bundle, not from memory:

- No AdMob, Facebook SDK, AppsFlyer or Adjust in `package.json`
- No `firebase-analytics`, which is the usual way `AD_ID` arrives without
  anyone choosing it
- PostHog identifies athletes by their Firebase auth uid (`src/lib/analytics.ts`),
  never a device advertising identifier
- Sentry is crash reporting and does not request it
- `AndroidManifest.xml` inside the built AAB contains no `AD_ID` at all

Do **not** fix this by adding the permission. That would request access to an
identifier the app never reads, and it contradicts the "no advertising or
marketing" answers above.

Same warning also notes release-blocking errors were switched off. Turn them
back on once the declaration is corrected — they exist to catch precisely this
kind of mismatch before a release ships rather than after.

---

## Privacy policy URL (required field)
`https://repchamp.web.app/privacy`

## Companion narrative for the store listing (recommended)
> RepChamp counts your reps using pose detection that runs entirely on your device. Your
> camera feed is never recorded, uploaded, or shared — in any mode. The only photo that
> leaves your device is the profile picture you choose. We store your profile, workout stats,
> and (if you pair) your shared couple data to sync across devices and power leaderboards.
> You can export or delete all of it anytime in Settings.

---

## Change log

**2026-08-01 — duel/together action-shot share removed.** The app no longer captures or
uploads any camera frame. Photos remains **Yes** (the avatar), but its scope narrowed to
the avatar alone. **Re-submit the Data safety form** if the previous, broader answer was
already filed.

**2026-08-06 — Firebase Storage removed entirely.** The avatar moved to a base64 data URI
on the profile document (`0ccf6dd`) and the Storage SDK was dropped from the build
(`c5e813b`); `storage.rules` and the `duelPhotos/` sweep are gone with it. Nothing about
the *declarations* changes — Photos is still **Yes** (the avatar still leaves the device,
now as a Firestore field) and Videos is still **No**. What changes is the substantiation:
there is no separate image host, and deleting the profile document deletes the photo.

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
| **Photos** | Collected, **not** shared. Optional | The avatar the user picks, downscaled to 192x192 and stored as a base64 field on `users/{uid}`. No Firebase Storage, no separate image host — deleting the profile deletes the photo |
| **Videos** | **Not collected** | The camera feed is analysed on-device by MoveNet and never recorded or uploaded |
| App interactions | Collected, **not** shared. Required. Analytics | 37 `track()` call sites; event names only, no free text |
| Crash logs / diagnostics | Collected, **not** shared. Required | Sentry |
| Purchase history | Collected, **not** shared. Required | RevenueCat entitlement state |
| Contacts, calendar, health records, financial info, messages | **Not collected** | No such API is called anywhere |
| Approximate location | **Collected & shared, optional** | Real-weather widget → Open-Meteo, rounded to ~10 km, never stored |
| Steps (Health and fitness → Fitness info) | **Collected, optional** | Pedometer; leaves the device only if shared with a partner via the couple record |

### The two answers that most often get flagged

**Photos = Yes**, still — the avatar the user picks leaves the device (stored as a base64
field on the profile document, not in Firebase Storage). Answering No because "it's just an
avatar", or because it is a Firestore field rather than a file in a bucket, is the kind of
mismatch Play rejects for: what matters is that a user-supplied photograph is transmitted
and retained, not the storage mechanism. What changed is the *scope*: no camera frame is
uploaded in any mode now that the action-shot share is gone.

**Videos = No** is correct and unchanged: the camera stream is processed frame-by-frame
on-device and discarded.

### Data sharing

Answer **No** to sharing throughout. Firebase, PostHog, Sentry, Google Play and RevenueCat are
processors acting on your instructions, which is not "sharing" under Play's definition. Nothing
is sold, and no advertising SDK is present.

---

## ⚠️ Keep this accurate
This reflects the code as of the audit. If you later add: real-time analytics with more PII,
ads/ad SDKs, location, health-record features, or server-side video — you MUST update this
form before the next release, or Play will flag a mismatch.

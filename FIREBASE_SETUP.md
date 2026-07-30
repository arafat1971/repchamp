# Firebase setup — RepChamp

The app ships with a **Firebase backend layer already wired in** (Auth, Firestore,
Storage). Until you provision a real project it runs in **local-only mode**: bot
opponents, hardcoded leaderboard, on-device data — exactly as before. Drop in real
credentials and rebuild, and the same code paths go live. No app code changes needed.

The switch is automatic: `src/lib/firebase.ts → isFirebaseConfigured()` returns
`false` while the placeholder credential files are in place, and every service in
`src/services/*` falls back to the local simulation.

---

## What I built

| File | Purpose |
|---|---|
| `src/lib/firebase.ts` | Init + `isFirebaseConfigured()` guard |
| `src/services/auth.ts` | Anonymous / email / Google sign-in, account linking |
| `src/services/userService.ts` | Firestore profile CRUD, avatar upload, score publish |
| `src/services/leaderboardService.ts` | Real leaderboard + friend graph (falls back to local) |
| `src/state/authStore.ts` | Auth state + two-way cloud sync of the profile |
| `firestore.rules`, `storage.rules` | Security rules (owner-only writes, validated) |
| `firestore.indexes.json`, `firebase.json` | Composite index + CLI config |
| `google-services.json`, `GoogleService-Info.plist` | **Placeholders — replace these** |

---

## Provisioning checklist (you do this — I can't log into your Google account)

### 1. Create the project
1. Go to <https://console.firebase.google.com> → **Add project** → name it `RepChamp`.
2. Enable **Authentication** → Sign-in methods → turn on **Anonymous**, **Email/Password**, and **Google**.
3. Enable **Firestore Database** (production mode) and **Storage**.

### 2. Register the apps (bundle id `gg.repchamp.app` for both)
- **Android** app → package `gg.repchamp.app` → download `google-services.json` → replace the placeholder at the project root.
- **iOS** app → bundle `gg.repchamp.app` → download `GoogleService-Info.plist` → replace the placeholder at the project root.

### 3. Google Sign-In client id
- In the console, **Authentication → Sign-in method → Google**, copy the **Web client ID** (OAuth 2.0).
- Put it in an env value and pass it to `signInWithGoogle(webClientId)` — e.g. add to `app.json → extra.googleWebClientId` and read via `expo-constants`.

### 4. Deploy rules & indexes
```bash
npm i -g firebase-tools
firebase login
firebase use --add           # pick your new project
firebase deploy --only firestore:rules,firestore:indexes,storage
```
This deploys every collection's rules and indexes in one shot — including the
`matchmaking` queue and the new `couples` rules. Confirm the `matchmaking`
composite index finishes building in the console before testing open matchmaking,
or `tryPair`'s query will fail (and degrade to "nobody waiting"). No Cloud
Functions are deployed — nudges use Expo Push (step 5).

 _(No Blaze / Cloud Functions needed. Cross-device nudges go through **Expo Push**,
which is free — see step 5.)_

### 5. Cross-device nudges via Expo Push (free — no Blaze)

Couple nudges reach a *backgrounded* partner through **Expo's push service** (the
sender's app posts to it directly; no Cloud Function, no billing). Expo push
tokens are scoped to an EAS project, so link one — it's free:

```bash
npx eas-cli login          # create a free Expo account if you don't have one
npx eas-cli init           # creates/links an EAS project, writes extra.eas.projectId
```

Then, so Expo can deliver on **Android**, give it your FCM credentials once:

- Firebase console → project `repchamp-14f78` → ⚙️ **Project settings → Cloud
  Messaging** → under *Cloud Messaging API (V1)* note the **Sender ID**, and create
  a service-account key (**Manage Service Accounts → generate key**, JSON).
- Expo dashboard → your project → **Credentials → Android → FCM V1** → upload that
  service-account JSON. (Expo's docs: "Add Android FCM credentials".)

For **iOS**, `eas credentials` walks you through the APNs key (or upload a `.p8`
from Apple Developer → Keys).

The client captures its Expo push token on sign-in (`registerForPushNudges` in
`src/lib/notifications.ts`) and stores it on `users/{uid}/private/push` (owner-only).
When paired, the same token is also written onto that athlete's couple-member
slice so the partner can nudge without reading a world-readable profile field.

### 6. Rebuild the dev client (config changed)
`eas init` writes the real `extra.eas.projectId`, which is baked in at build time:
```bash
npx expo prebuild --clean
npm run android      # or: npm run ios
```

That's it. On next launch `isFirebaseConfigured()` flips to `true`, an anonymous
account is created automatically, the profile + leaderboard start syncing, and
couple nudges push across devices via Expo — all on the free plan.

### Verify the nudge end to end
1. Pair two devices (share the code from **Couple mode → Invite my partner**).
2. Background the app on device B.
3. On device A, open **Couple mode → 👋 Nudge**.
4. Device B should get a push within a second or two. If not, check in order:
   - Device B has a token on their couple member (`members[].expoPushToken`)
     starting with `ExponentPushToken[...]` (empty = permission denied, no EAS
     id, or token not yet synced after pairing).
   - Android delivery: the FCM service-account JSON is uploaded in the Expo
     dashboard (step 5) — without it Expo accepts the push but can't deliver it.
   - Paste device B's token into <https://expo.dev/notifications> and send a test;
     if that lands, the token/credentials are fine and the issue is in-app.

---

## Data model

```
users/{uid}
  uid, username (lowercased, for friend lookup), displayName,
  avatarUrl, weeklyGoal, totalXp, personalBests{push,squat,shoulder,stretch}, updatedAt

users/{uid}/private/push   # owner-only
  expoPushToken, pushUpdatedAt

users/{uid}/friends/{friendUid}   # owner-managed only
  displayName, avatarUrl, level, addedAt

leaderboard/{uid}        # flat, query-cheap
  uid, displayName, avatarUrl, weeklyXp, totalXp, level, league, weekKey, updatedAt

couples/{coupleId}       # doc id IS the 6-char pair code
  id, memberUids[2], pending,
  members[] { uid, displayName, avatarUrl, trainedDays[], totalReps, expoPushToken? },
  nudge { fromUid, at }, createdAt, pairedAt
```

## Live duels — end to end

- **Duels** sync through a single Firestore doc (`duels/{id}`). The pure core is
  `src/domain/duel.ts`; the I/O layer is `src/services/duelService.ts`
  (`createDuel` / `joinDuel` / `pushLiveState` / `finishDuel` / `watchDuel` /
  `cancelDuel`).
- **Matchmaking lobby**: `app/duel/[id].tsx` is the waiting room. A host reaches
  it from the **Challenge** button on a real RepChamp friend (`friends.tsx`) —
  it calls `createDuel` and shows a shareable duel code while it waits. A guest
  reaches it by pasting that code into **Join a duel** on the Add Friends screen
  (`add-friend.tsx`), which calls `joinDuel`. When the doc flips to `active` with
  both seats filled, both clients route into `/session?duel=<id>` together.
- The session screen then streams reps live via `src/state/useLiveDuel.ts` and
  drives the opponent from the remote seat; with no `duel` param it runs the bot
  pacer (`src/domain/opponent.ts`) exactly as before.
- **Async challenge inbox**: a challenge from the **Challenge** button is addressed
  to that friend via the duel's `targetUid`. `fetchIncomingDuels(uid)` returns the
  `pending`, still-open duels aimed at an athlete, newest first, and the
  Notifications modal (`app/modal/notifications.tsx`) renders each as an **Accept**
  card that drops the recipient into the waiting room as guest — so a duel can be
  taken up later without a live code. Unconfigured, the inbox is empty and the
  screen falls back to the local demo bot invite. Needs the composite index in
  `firestore.indexes.json` (`targetUid` + `status` + `createdAt`).
- Security rules for `duels/{id}` are in `firestore.rules` (participants-*and the
  target*-only read; seat-scoped writes, no re-seating, host-only delete; a
  targeted duel is joinable only by its target; an open-match duel may be born
  `active` by either seated athlete). Deploy with the rest.
- **Open matchmaking (quick match)**: the **Find an opponent** card on Home opens
  `app/duel/queue.tsx`. It drops a ticket in `matchmaking/{uid}` (`enqueue`) and
  polls `tryPair`, which scans for the oldest other `waiting` ticket and, in one
  transaction, mints an `active` `duels/{id}` seating both athletes and flips both
  tickets to `matched` with that duelId. Each client also `watchTicket`s its own
  ticket, so whether you paired someone or someone paired you, you follow the same
  `duelId` into `/session?duel=<id>`. Pure core: `src/domain/matchmaking.ts`
  (`canPair` / `pickOpponent` / `buildMatchDuel`); I/O:
  `src/services/matchmakingService.ts`. Needs the `matchmaking` composite index
  (`status` + `enqueuedAt`). Unconfigured, it degrades to the bot duel.
  - **Caveat**: pairing is a cross-user write (the seeker claims another athlete's
    ticket). The client rules permit exactly the `waiting → matched` flip as a demo
    concession, but production should move `tryPair` into a Cloud Function and lock
    ticket writes to owner-only. See the note at the top of `firestore.rules`.

Live duels require Firebase. Unconfigured, `createDuel`/`joinDuel` return null and
the waiting room shows a friendly "duels go live once the backend is set up" state
with a one-tap bot-duel fallback — the flow is never dead-ended.

**Possible next steps:** move open-match pairing into a Cloud Function (trusted
pairing + server-minted duels); a scheduled function to prune abandoned `pending`
duels and stale `waiting` tickets older than N minutes.

## Couple mode

Two athletes pair by sharing a 6-character code (the `couples` document id), then
each films **themselves on their own phone**. A together set rides the existing
duel transport with `cooperative: true`, so both devices stream reps through the
same seats a duel uses — only the scoring differs (combined total, no winner, so
`finishDuel` leaves `winnerUid` null). The shared streak advances only on days
**both** partners trained: `calculateCoupleStreak` in `src/domain/couple.ts`.

**Partner nudges — three layers, each honest about its reach:**

- ✅ **In-app** (`useCouple` → `presentNudge`): the partner sees the poke the
  moment their `couples` subscription receives it, while the app is open.
- ✅ **Local streak reminder** (`src/lib/notifications.ts`): a daily
  streak-at-risk reminder this device schedules for its own owner. No server.
- ✅ **Cross-device push (Expo Push, free)**: on a nudge, the *sender's* app reads
  the recipient's `expoPushToken` off the couple member object and POSTs to Expo's
  push service (`nudgePartner` in `src/services/coupleService.ts`), which delivers
  even when the recipient's app is **closed**. When the recipient's app is
  foregrounded the push is suppressed (`installForegroundNudgeSuppressor` + the
  notification handler tag) so the in-app nudge doesn't double. **No Cloud
  Function, no Blaze plan** — the only server is Expo's, which is free. Requires
  the EAS project + FCM-key-to-Expo setup in step 5.

There is intentionally **no Cloud Function** in this repo. The sender is a trusted
enough actor to push to their own partner, and Expo holds the FCM credential (via
the dashboard upload) so no secret ever ships in the app.

## App Check (wired in code — finish it in the console)

App Check makes Firestore reject writes that don't come from your genuine app, so
a script holding the public config can't inject scores. The **client side is done**:
`src/lib/appCheck.ts` initialises the Play Integrity (Android) / App Attest (iOS)
provider, called once from `app/_layout.tsx`, and the `@react-native-firebase/app-check`
Expo plugin is in `app.json`. It no-ops when Firebase is unconfigured, like every
other service.

Two things remain, both in the Firebase console — and the order matters so you never
lock out live users:

1. **Register the provider.** Firebase console → App Check → your Android app →
   register **Play Integrity**; your iOS app → register **App Attest** (or
   DeviceCheck). This makes tokens *valid*; it does not yet *require* them.
2. **Watch the metrics, then enforce.** With the provider registered, real installs
   start sending tokens. In App Check → APIs, watch the "verified vs unverified"
   split for **Cloud Firestore** and **Storage** fill in over a day or two of real
   traffic. Only once verified traffic is healthy, flip **Enforce** on each. Until
   you do, un-attested requests still succeed — so shipping the client change is
   zero-risk; enforcement is the deliberate, reversible switch.

⚠️ App Check is a **native module** — after pulling this change, `npx expo prebuild
--clean && npm run android` (a full rebuild) is required for it to load on device.

## Recommended next (scale hardening)

- A scheduled Cloud Function to roll over `weekKey` and prune stale leaderboard rows.
- Server-side anti-cheat on `weeklyXp`/couple reps (the client ceilings in rules are a
  stopgap; App Check above raises the bar but the real fix is a trusted-context write).

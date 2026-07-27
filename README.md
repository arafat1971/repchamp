# RepChamp

Bodyweight training app with **on-device AI rep counting**. Push-ups and squats are
counted by a pose model running in a camera frame processor — no video ever leaves
the phone. **Couple mode** pairs you with a partner: you each film yourselves on your
own phone and train together live, with a combined total and a shared streak.

Built from the design prototype in [`design/prototype.html`](design/prototype.html).

---

## Requirements

- Node 20+
- **A development build.** Expo Go cannot host camera frame processors, so
  `npx expo start` alone will not run this app. See [Running](#running).
- Xcode 15+ (iOS) or Android Studio (Android)

## Setup

```bash
npm install
npm run fetch-model
```

`fetch-model` downloads MoveNet SinglePose Lightning (~3 MB) into
`assets/models/movenet.tflite`. The model is **not committed** — the Metro bundler
will fail without it, because `src/vision/usePoseSession.ts` requires it directly.

One phone tracks one athlete — in couple mode each partner films themselves on their
own device — so a single-person model is all this app needs.

Pass `thunder` for the slower, more accurate variant (remember to update
`MODEL_INPUT_SIZE` in `src/vision/poseDetector.ts` to 256):

```bash
npm run fetch-model thunder
```

## Running

```bash
npm run ios
```

```bash
npm run android
```

Both run `expo run:*`, which prebuilds native projects and installs a dev build.
After the first build, `npm start` attaches to it.

<details>
<summary>If CocoaPods fails with <code>Unicode Normalization not appropriate for ASCII-8BIT</code></summary>

CocoaPods needs a UTF-8 locale and inherits whatever the shell has:

```bash
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
```

</details>

> **Note on `react-native-vision-camera` v5**: unlike v4, it ships **no Expo
> config plugin**. Listing it under `plugins` in `app.json` makes Expo load the
> package's main entry as a plugin and prebuild crashes. The camera permission
> strings live directly in `ios.infoPlist` and `android.permissions` instead.

### Hardware acceleration

The pose model runs on Core ML (iOS) or the GPU delegate (Android). Both are
opt-in at build time via the `react-native-fast-tflite` plugin in `app.json`:

```json
["react-native-fast-tflite", {
  "enableCoreMLDelegate": true,
  "enableAndroidGpuLibraries": true
}]
```

Delegates do **not** degrade gracefully — without the flag, `loadTensorflowModel`
throws `The CoreML Delegate ("core-ml") is not enabled!` and no reps are counted.
Because a slow model beats no rep counting, `useAcceleratedModel` catches that
and retries on CPU, logging a warning in dev. If you change the flag, re-run
`npx expo prebuild` and `pod install` — editing `app.json` alone is not enough.

> The camera and pose model do not work in the iOS Simulator. The session flow
> still runs there — calibration falls back to a timed ramp so the whole
> countdown → duel → result flow is testable without a device — but reps will
> not be counted. Use a physical device to test rep detection.

## Verifying

```bash
npm run typecheck && npm test
```

---

## Architecture

```
app/                    expo-router routes
  (tabs)/               Home, Arena, Train, Friends, Profile
  session/              calibrate → countdown → duel → result → form report
  modal/                leaderboard, settings, achievements, friends, …
  onboarding.tsx        12-step first-run flow
src/
  vision/               pose model, rep detection, form scoring
  domain/               XP, levels, leagues, streaks, achievements, opponents
  state/                zustand stores (profile, session, settings)
  components/           design-system primitives + session UI
  theme/                design tokens and typography
  lib/                  storage, audio, haptics, speech
scripts/                model download, sound generation
```

### How rep counting works

1. **Camera** streams frames at 192×192 RGB — `useFrameOutput` resizes and
   converts in the native pipeline, so there is no JS resize step.
2. **MoveNet** runs in the frame processor worklet and emits 17 keypoints as
   `(y, x, score)`.
3. Only the decoded pose crosses to JS. The rep state machine stays on the JS
   thread as plain TypeScript, so it is unit-testable without a camera.
4. **`exercises.ts`** turns keypoints into a single `depth` value in 0..1 —
   elbow flexion for push-ups (165°→75°), knee flexion for squats (172°→70°) —
   plus an alignment channel for the form report.
5. **`OneEuroFilter`** smooths depth adaptively: heavy smoothing at rest, light
   smoothing during fast movement. A fixed low-pass either jitters at the top of
   a rep or lags the bottom enough to miscount.
6. **`RepCounter`** applies hysteresis — depth must cross *down* past 0.70 and
   back *up* past 0.30 before a rep is booked. A single threshold double-counts
   every time the signal dithers at the bottom, which is where it is noisiest.
   Reps faster than the exercise minimum are rejected as bounces.
7. Each rep records its peak depth, duration and alignment, which is what the
   **form report** charts — the green/amber bars are real per-rep data.

Both the filter and the state machine are covered by tests that replay synthetic
rep cycles: see `src/vision/__tests__/repCounter.test.ts`.

### Tuning rep detection

Thresholds live on each exercise in `src/vision/exercises.ts`:

| Field | Meaning |
| --- | --- |
| `downThreshold` | Depth at which the descent counts as committed |
| `upThreshold` | Depth the athlete must return above to close the rep |
| `fullDepthThreshold` | Peak depth graded "full depth" rather than "partial" |
| `minRepDurationMs` | Anything faster is a bounce artefact, not a rep |

Raise `downThreshold` to demand deeper reps; widen the gap to `upThreshold` if
you see double-counting.

---

## Not yet built

Honest status — these are stubbed or absent, not silently faked:

- **No backend.** Duels run against `OpponentPacer`, a deterministic local bot
  with a fixed reps-per-minute per rival. Friends, the leaderboard and the
  notification feed use fixed local data. Replace `src/domain/leaderboard.ts`
  and `OpponentPacer` with server calls; nothing in the UI needs to change.
- **No auth.** Onboarding's Google/Apple buttons advance the flow without
  authenticating. Profiles are local to the device (MMKV).
- **No billing.** The paywall selects a plan but takes no payment and says so.
- **No push notifications.** `expo-notifications` is installed but not wired.
- **Crash reporting** is a `console.error` in `ErrorBoundary` — swap in Sentry
  before shipping.

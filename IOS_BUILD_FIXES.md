# iOS build — required local fixes

The iOS app builds and runs, but four fixes live in **gitignored** directories
(`/ios`, `node_modules/`). They are wiped by `npm install` or `expo prebuild`,
so they are recorded here. Re-apply after either command.

Symptom if you skip them: the build fails on a Skia header, or the app installs
and then crashes instantly at launch.

---

## 1. react-native-skia podspec (build fails to compile)

**Error:** `'third_party/base64.h' file not found`, then
`'include/core/SkRefCnt.h' file not found`.

**Cause:** `@shopify/react-native-skia@2.6.2` ships a malformed
`HEADER_SEARCH_PATHS` — a stray `/**` glob corrupts the path list and drops the
roots the sources actually include from.

**Fix:** in `node_modules/@shopify/react-native-skia/react-native-skia.podspec`,
replace the `HEADER_SEARCH_PATHS` line with:

```ruby
"HEADER_SEARCH_PATHS" => '"$(PODS_TARGET_SRCROOT)/cpp" "$(PODS_TARGET_SRCROOT)/cpp/api" "$(PODS_TARGET_SRCROOT)/cpp/skia" "$(PODS_TARGET_SRCROOT)/cpp/jsi2" "$(PODS_TARGET_SRCROOT)/cpp/rnwgpu" "$(PODS_TARGET_SRCROOT)/cpp/rnwgpu/api" "$(PODS_TARGET_SRCROOT)/cpp/rnwgpu/api/descriptors" "$(PODS_TARGET_SRCROOT)/cpp/rnwgpu/async" "$(PODS_TARGET_SRCROOT)/cpp/dawn/include"'
```

Then `cd ios && pod install`.

> Worth making permanent with `patch-package` if this keeps recurring.

## 2. Sentry blocks the JS bundle phase

**Error:** `An organization ID or slug is required (provide with --org)` during
"Bundle React Native code and images".

**Cause:** the Sentry CLI attempts a source-map upload; no org/project/token is
configured (the DSN is still a placeholder).

**Fix:** add to `ios/.xcode.env.local`:

```sh
export SENTRY_DISABLE_AUTO_UPLOAD=true
```

## 3. React.framework not embedded (app crashes at launch)

**Crash:** `Library not loaded: @rpath/React.framework/React`.

**Cause:** with `EXPO_USE_PRECOMPILED_MODULES` + `ios.useFrameworks: static`,
React core ships as a prebuilt xcframework that does not get copied into the
app bundle, while the app still links it dynamically.

**Fix:** after building, copy it in and re-sign:

```bash
APP=<path-to>/RepChamp.app
cp -R ios/Pods/React-Core-prebuilt/React.xcframework/ios-arm64_x86_64-simulator/React.framework "$APP/Frameworks/"
codesign --force --sign - --timestamp=none "$APP/Frameworks/React.framework"
codesign --force --deep --sign - --timestamp=none "$APP"
```

## 4. expo-app-metrics crashes on launch

**Crash:** `unrecognized selector sent to instance … DelegateProxy
setFetcher:forTask:` (SIGABRT).

**Cause:** `expo-app-metrics` (pulled in transitively by `expo-observe`) swizzles
`NSURLSession` delegates and collides with Sentry/Firebase doing the same.

**Fix:** already committed in `package.json` — both modules are excluded from
autolinking. Only needs a `pod install` to take effect:

```json
"expo": { "autolinking": { "exclude": ["expo-app-metrics", "expo-observe"] } }
```

---

## CocoaPods encoding error

If `pod install` fails with `Unicode Normalization not appropriate for
ASCII-8BIT`, set a UTF-8 locale first:

```bash
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
```

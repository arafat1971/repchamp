#!/usr/bin/env bash
# Build a local debug APK without the New Architecture autolinking.h race.
# Usage: from repo root → bash scripts/android-debug.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$ANDROID_HOME/platform-tools:$PATH"

cd "$ROOT/android"
rm -rf app/.cxx app/build/intermediates/cxx
./gradlew \
  :app:generateAutolinkingNewArchitectureFiles \
  :app:assembleDebug \
  -x lint -x test \
  -PreactNativeArchitectures=arm64-v8a \
  --no-configure-on-demand

APK="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
echo "Built: $APK"
if adb get-state >/dev/null 2>&1; then
  echo "Installing on device (debug keystore — may need uninstall of EAS builds first)…"
  adb install -r "$APK" || {
    echo "Signature mismatch? Uninstalling store/EAS build then retrying…"
    adb uninstall gg.repchamp.app || true
    adb install "$APK"
  }
  adb reverse tcp:8081 tcp:8081 || true
  echo "Done. Start Metro with: npx expo start --dev-client"
fi

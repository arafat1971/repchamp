#!/usr/bin/env bash
#
# Run the Firestore security-rules suites against the local emulator.
#
# The emulator is a Java process and firebase-tools requires JDK 21+. That is
# often *not* the JDK a React Native machine has on its PATH — this repo's
# Android toolchain wants 17 — so rather than making the developer re-point
# their system Java, this script finds a 21+ runtime and exports JAVA_HOME for
# the emulator only. Nothing outside this command is affected.

set -euo pipefail

java_major() {
  "$1" -version 2>&1 | head -1 | sed -E 's/.*version "([0-9]+).*/\1/'
}

find_jdk21() {
  # Already good?
  if [[ -n "${JAVA_HOME:-}" && -x "${JAVA_HOME}/bin/java" ]]; then
    if [[ "$(java_major "${JAVA_HOME}/bin/java")" -ge 21 ]]; then
      echo "${JAVA_HOME}"; return 0
    fi
  fi

  # macOS: ask the system for a 21+ VM.
  #
  # `java_home -v 21+` cannot be taken at its word: on a machine whose only
  # registered VMs are older it happily returns the newest it has (JDK 17 here)
  # rather than failing, so the answer is re-checked against the real version.
  if [[ -x /usr/libexec/java_home ]]; then
    if home="$(/usr/libexec/java_home -v 21+ 2>/dev/null)"; then
      if [[ -x "${home}/bin/java" ]] && [[ "$(java_major "${home}/bin/java")" -ge 21 ]]; then
        echo "${home}"; return 0
      fi
    fi
  fi

  # Homebrew keg-only installs are not symlinked and java_home misses them.
  for candidate in \
    /opt/homebrew/opt/openjdk@21 \
    /opt/homebrew/opt/openjdk \
    /usr/local/opt/openjdk@21 \
    /usr/local/opt/openjdk; do
    if [[ -x "${candidate}/bin/java" ]] && [[ "$(java_major "${candidate}/bin/java")" -ge 21 ]]; then
      echo "${candidate}"; return 0
    fi
  done

  # Whatever is on PATH, if it happens to be new enough.
  if command -v java >/dev/null 2>&1 && [[ "$(java_major java)" -ge 21 ]]; then
    echo ""; return 0
  fi

  return 1
}

if jdk="$(find_jdk21)"; then
  if [[ -n "${jdk}" ]]; then
    export JAVA_HOME="${jdk}"
    export PATH="${JAVA_HOME}/bin:${PATH}"
  fi
else
  cat >&2 <<'EOF'
[repchamp] The Firestore emulator needs JDK 21 or newer and none was found.

  brew install openjdk@21

The Android build's JDK 17 is unaffected — this script only points the
emulator at a newer runtime for the duration of the test run.
EOF
  exit 1
fi

# firebase-tools is normally a global install here rather than a dependency of
# this package, so prefer the binary on PATH and only fall back to npx.
if command -v firebase >/dev/null 2>&1; then
  firebase_bin=(firebase)
else
  firebase_bin=(npx --yes firebase-tools)
fi

exec "${firebase_bin[@]}" emulators:exec \
  --only firestore \
  --project repchamp-rules-test \
  "npx jest --config jest.rules.config.js $*"

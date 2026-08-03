#!/usr/bin/env bash
#
# Check that the certificate signing a build is registered in Firebase.
#
# Google Sign-In fails at *runtime* when a build's SHA-1 is missing from
# google-services.json — the app shows "Google Sign-In isn't set up for this
# build" and there is nothing in a log to explain which fingerprint it wanted.
# This turns that into an answer you can get in a second, before shipping.
#
# Usage:
#   scripts/check-signing.sh                 # check the local debug keystores
#   scripts/check-signing.sh app.apk         # check what actually signed an APK
#
# Exit codes: 0 = every fingerprint found is registered, 1 = at least one is not.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GS="$ROOT/google-services.json"

if [[ ! -f "$GS" ]]; then
  echo "no google-services.json at $GS" >&2
  exit 1
fi

# Registered hashes, uppercased and stripped of colons for comparison.
registered=$(/usr/bin/python3 - "$GS" <<'PY'
import json, sys
with open(sys.argv[1]) as fh:
    data = json.load(fh)
for client in data.get("client", []):
    for oauth in client.get("oauth_client", []):
        info = oauth.get("android_info")
        if info and info.get("certificate_hash"):
            print(info["certificate_hash"].upper().replace(":", ""))
PY
)

if [[ -z "$registered" ]]; then
  echo "google-services.json has no Android fingerprints at all." >&2
  echo "Google Sign-In cannot work on any build until one is added." >&2
  exit 1
fi

fail=0

# Compare one fingerprint against the registered set.
check() {
  local label="$1" sha="$2"
  local norm pretty
  norm=$(echo "$sha" | tr -d ':' | tr '[:lower:]' '[:upper:]')
  # apksigner prints a bare lowercase digest; Firebase's field wants the
  # colon-separated uppercase form, so normalise before showing it — this is
  # the string the user has to paste, and retyping it by hand invites a typo.
  pretty=$(sed 's/../&:/g; s/:$//' <<<"$norm")
  if grep -qx "$norm" <<<"$registered"; then
    printf '  ok      %-38s %s\n' "$label" "$pretty"
  else
    printf '  MISSING %-38s %s\n' "$label" "$pretty"
    fail=1
  fi
}

echo "Registered in google-services.json: $(wc -l <<<"$registered" | tr -d ' ')"
echo

if [[ $# -ge 1 ]]; then
  apk="$1"
  [[ -f "$apk" ]] || { echo "no such file: $apk" >&2; exit 1; }

  # A v2/v3-only APK has no META-INF certificate, so keytool cannot read it —
  # apksigner is the tool that understands the newer signature blocks. This is
  # exactly the case for EAS builds.
  signer=$(ls "$HOME"/Library/Android/sdk/build-tools/*/apksigner 2>/dev/null | tail -1)
  if [[ -z "$signer" ]]; then
    echo "apksigner not found under the Android SDK build-tools." >&2
    exit 1
  fi
  sha=$("$signer" verify --print-certs "$apk" 2>/dev/null \
        | awk '/Signer #1 certificate SHA-1/ { print $NF }')
  [[ -n "$sha" ]] || { echo "could not read a signature from $apk" >&2; exit 1; }
  check "$(basename "$apk")" "$sha"
else
  # Default: the debug keystores a local build would use.
  for ks in "$HOME/.android/debug.keystore" "$ROOT/android/app/debug.keystore"; do
    [[ -f "$ks" ]] || continue
    sha=$(keytool -list -v -keystore "$ks" -storepass android -alias androiddebugkey 2>/dev/null \
          | awk '/SHA1:/ { print $2; exit }')
    [[ -n "$sha" ]] && check "${ks/#$HOME/~}" "$sha"
  done
fi

echo
if [[ $fail -eq 0 ]]; then
  echo "All checked fingerprints are registered."
else
  cat <<'MSG'
Add the MISSING fingerprint in Firebase, then replace google-services.json:

  Console -> Project settings -> Your apps -> gg.repchamp.app -> Add fingerprint
  https://console.firebase.google.com/project/repchamp-14f78/settings/general

The file is read at build time, so an existing build will not pick it up --
add the fingerprint first, download the fresh file, then rebuild.
MSG
fi

exit $fail

# Signing a local AAB with the real upload key

Only needed for a **Play upload**. A sideload APK is signed with the debug key
and needs none of this.

Building locally means supplying the upload key here — Play rejects an upload
signed with anything else, because it identifies your app by that certificate.

The key lives in this repo under `credentials/`. EAS holds a *different* key
that Play does not accept; see §1 before reaching for `eas credentials`.

`keystore.properties` and `*.jks` are both gitignored. Keep the passwords out
of commits and out of chat transcripts.

> **2026-08-15:** the upload-key passwords were exposed to an assistant during a
> signing incident (see §1). The key still works and Play still trusts it, but
> if you want that property back, rotate via Play Console → **App integrity →
> upload key reset** at a calm moment — not mid-review.

---

## 1. The credentials are already in the repo — do NOT run `eas credentials`

Everything needed is in **`credentials.json`** (gitignored), pointing at
**`credentials/android/keystore.jks`**:

| Field | Value |
|---|---|
| Keystore file | `credentials/android/keystore.jks` |
| Key alias | `3e7bb9df23c7fb6546ff176fef108633` |
| SHA-256 | `99:11:67:1B:C8:C5:9B:79:…:07:13:AA:BA` |
| Keystore password | in `credentials.json` |
| Key password | in `credentials.json` (**different** from the keystore one) |

That SHA-256 is what Play has registered as the upload key. Nothing else is
accepted.

**Do not run `npx eas credentials` to "get" the passwords.** On 2026-08-15 that
download **overwrote** the repo-root `@aro765__repchamp.jks` with a *different*
key (alias `276f3693…`, SHA-256 `06:ED:39:B2:…`) which is **not** registered
with Play. It cost an hour and a wasted 56-minute build signed with the wrong
key. The EAS-held key is not the upload key; ignore EAS for local signing.

Three fingerprints are in play and they are easy to confuse:

| SHA-256 | What it is |
|---|---|
| `99:11:67:1B:…` | **Upload key** — signs the AAB. In `credentials/android/keystore.jks`. |
| `53:F5:3E:B1:…` | Google's **app signing key** — re-signs for users; goes in `assetlinks.json`. |
| `06:ED:39:B2:…` | EAS's key — **unused**, not registered with Play. Ignore. |

> The `@aro765__repchamp*.jks` files at the repo root are leftovers, including
> `_OLD_N` rotations from past `eas-cli` downloads. Since 2026-08-15 the
> repo-root `@aro765__repchamp.jks` holds the **wrong** (EAS) key. Do not sign
> with any of them. The authoritative keystore is under `credentials/`.

**The key password is not the same as the keystore password.** Assuming they
match cost an hour on 2026-08-14: Gradle only touches the key password at the
signing step, so a wrong one fails *after* the full native build.

## 2. Write them where Gradle looks

Create `android/keystore.properties`:

Generate it from `credentials.json` so the passwords are never retyped, pasted,
or echoed to a terminal:

```bash
python3 -c "
import json,os
c=json.load(open('credentials.json'))['android']['keystore']
open('android/keystore.properties','w').write(
  'storeFile=%s\nstorePassword=%s\nkeyAlias=%s\nkeyPassword=%s\n' %
  (os.path.abspath('credentials/android/keystore.jks'),
   c['keystorePassword'], c['keyAlias'], c['keyPassword']))
os.chmod('android/keystore.properties',0o600)
"
```

The resulting file:

```properties
storeFile=/Users/arafathossain/repchamapp/credentials/android/keystore.jks
storePassword=…
keyAlias=3e7bb9df23c7fb6546ff176fef108633
keyPassword=…
```

Use an **absolute** `storeFile` path. A relative one resolves from
`android/app/`, which is a reliable source of silent mistakes.

This file is gitignored. Do not commit it, and do not paste its contents into
a chat — including to me.

**Validate both passwords before building** — this takes a second and saves an
hour, because a bad key password only surfaces at the very end:

```bash
python3 -c "
import json,subprocess
c=json.load(open('credentials.json'))['android']['keystore']
p=subprocess.run(['keytool','-certreq','-alias',c['keyAlias'],
  '-keystore','credentials/android/keystore.jks',
  '-storepass',c['keystorePassword'],'-keypass',c['keyPassword']],
  capture_output=True)
print('BOTH PASSWORDS OK' if p.returncode==0 else 'FAILED')
"
```

A bare `keytool -list` prompting for the password also works, but typing it at
a prompt puts it in your shell history if you get it wrong and retry inline.

Gradle also needs `android/local.properties` (gitignored, absent on fresh
checkouts) or it fails with *"SDK location not found"*:

```properties
sdk.dir=/Users/arafathossain/Library/Android/sdk
```

## 3. Build the bundle

```bash
cd android && SENTRY_DISABLE_AUTO_UPLOAD=true ./gradlew bundleRelease
```

**That environment variable is not optional.** `sentry.gradle` runs
`sentry-cli` while bundling JS, and with no Sentry organisation configured it
exits with *"An organization ID or slug is required"* — failing the build after
every native architecture has already compiled, roughly half an hour in. EAS
never hits this because all three profiles in `eas.json` set the same flag; a
local shell inherits nothing.

It has to be the environment variable specifically. `sentry.gradle` reads
`System.getenv` and ignores Gradle properties, so there is no way to bake this
into `gradle.properties` or a config plugin. Crash reporting is unaffected —
only source-map upload is skipped, which needs `SENTRY_ORG`, `SENTRY_PROJECT`
and an auth token that do not exist yet.

Output: `android/app/build/outputs/bundle/release/app-release.aab`

Expect it to be slow — 30–60 minutes on a cold cache. The time goes on
compiling TFLite, Skia and Nitro from C++ for all four CPU architectures.
Do **not** narrow that with `-PreactNativeArchitectures` for an upload: Play
splits the bundle per device, and dropping ABIs is what produced the "no longer
supports 17,612 devices" warning. Narrowing is only appropriate for a local
APK aimed at one known phone.

The `withUploadSigning` config plugin points the release build at these
credentials when the file exists, and falls back to the debug key when it does
not — so a checkout without the key still builds a working APK.

**That fallback is silent and it is the most dangerous trap here.** With no
`keystore.properties`, `bundleRelease` still reports success and still produces
an `app-release.aab` — debug-signed, and rejected by Play on upload. There is no
warning in the build log. Always run the §4 fingerprint check; never infer
signing from a green build.

## 4. Confirm it is signed with the key Play expects

`keytool -printcert -jarfile` does **not** work on an `.aab` (it prints nothing
useful). Extract the signature block instead:

```bash
cd /tmp && rm -rf aabsig && mkdir aabsig && cd aabsig && \
  unzip -o -q ~/repchamapp/android/app/build/outputs/bundle/release/app-release.aab "META-INF/*.RSA" && \
  keytool -printcert -file META-INF/*.RSA | grep "SHA256:"
```

Expect exactly:

```
SHA256: 99:11:67:1B:C8:C5:9B:79:02:CB:A0:81:2A:FA:AE:71:7E:CF:B0:A8:00:7D:69:E5:E7:CA:C2:61:07:13:AA:BA
```

Compare against Play Console → **Release → Setup → App integrity → App signing
→ Upload key certificate**. They must match, or the upload is refused. Read the
*upload key* row, not the *app signing key* row above it — they are different
certificates and confusing them wasted an hour on 2026-08-15.

Sanity-check the exit code lie too: `./gradlew … | tail` reports the exit status
of `tail`, not Gradle. Always confirm the `.aab` exists on disk and grep the log
for `BUILD SUCCESSFUL`.

---

## The App Links catch, worth reading before you test

Play **re-signs** your upload with the *app signing key*, which is usually not
this upload key. Android verifies `/duel/join`, `/couple/join` and `/@handle`
links against the certificate on the installed app — so the fingerprint that
matters is Play's app signing key, **not** the one above.

Play Console → **Setup → App signing** → copy the **SHA-256 of the app signing
key** and confirm it appears in `website/.well-known/assetlinks.json`. If it is
missing, add it and redeploy:

```bash
firebase deploy --only hosting
```

Verification is retried on install, so a corrected file means reinstalling the
app rather than waiting.

## versionCode

`app.json` pins `android.versionCode` — **23** as of 2026-09-01. EAS was
incrementing this remotely; a local build cannot see that counter, and Play
refuses anything less than or equal to a code already uploaded. Raise it by one
for each new upload.

Edit it in **`app.json` only**. `android/app/build.gradle` also contains a
`versionCode` line, but that file is generated — `npx expo prebuild` rewrites it
from `app.json`. Editing the gradle file directly is lost on the next prebuild;
worse, a *stale* `android/` directory keeps serving the old number to a local
build, which is how a "bumped" build can still emit the previous versionCode.
Confirm what actually got built:

```bash
grep -oE "gg\.repchamp\.app@[0-9.]+\+[0-9]+" /tmp/aab-build.log | head -1
```

> `eas.json` sets `"appVersionSource": "remote"`, so `eas build` uses its own
> server-side counter and ignores `app.json`. The two schemes do not share
> state. If you switch back to EAS builds, check the remote counter is ahead of
> the highest locally-uploaded code.

An upload key **is** registered (`99:11:67:1B:…`) and cannot be changed without
a reset request to Google.

## If `expo prebuild` wipes your config

`npx expo prebuild --platform android` deletes and regenerates `android/`,
destroying `keystore.properties`, `local.properties` and anything else
hand-placed there. Both are gitignored, so git will not bring them back.
Recreate them (§2) after every prebuild.

It also fails with `ENOTEMPTY … app/build/outputs` if stale build output is
present. `rm -rf android/app/build` first.

## If the build fails on a corrupted transform

> The contents of the immutable workspace '…/transforms/…' have been modified.

This is disk pressure, not a Gradle bug — it appeared at 98% full (13 GB free).
Clearing `fileHashes.bin` does **not** fix it; the transform data itself is
damaged. Delete the named transform directory (it regenerates from the `.aar`
already in `~/.gradle/caches/modules-2`) and, more importantly, free real disk
space. The build needs well over 13 GB of headroom; it succeeded at 40 GB free
in 1h 7m.

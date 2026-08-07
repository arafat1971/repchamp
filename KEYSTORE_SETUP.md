# Signing a local AAB with the real upload key

Only needed for a **Play upload**. A sideload APK is signed with the debug key
and needs none of this.

EAS held the upload key and signed on its servers. Building locally means
supplying it here instead — Play rejects an upload signed with anything else,
because it identifies your app by that certificate.

The passwords are yours and should stay that way: they are not in this repo,
not in any commit, and were never handed to an assistant. `keystore.properties`
and `*.jks` are both gitignored.

---

## 1. Get the credentials out of EAS

```bash
npx eas-cli credentials
```

Choose **Android → production → Keystore → Download / view**. You want four
values:

| Field | Looks like |
|---|---|
| Keystore password | a long random string |
| Key alias | often `@aro765__repchamp` |
| Key password | usually the same as the keystore password |

The keystore file itself is already at the repo root:
`@aro765__repchamp.jks`.

> If EAS shows a *different* keystore than that file, download the one EAS
> holds and use it — that is the one Play knows.

## 2. Write them where Gradle looks

Create `android/keystore.properties`:

```properties
storeFile=../../@aro765__repchamp.jks
storePassword=PASTE_KEYSTORE_PASSWORD
keyAlias=PASTE_KEY_ALIAS
keyPassword=PASTE_KEY_PASSWORD
```

`storeFile` is relative to `android/app/`, which is why it climbs two levels.

This file is gitignored. Do not commit it, and do not paste its contents into
a chat — including to me.

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

## 4. Confirm it is signed with the key Play expects

```bash
keytool -printcert -jarfile android/app/build/outputs/bundle/release/app-release.aab
```

Compare the **SHA-256** against Play Console → **Test and release → Setup →
App signing → Upload key certificate**. They must match, or the upload is
refused.

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

`app.json` now pins `android.versionCode` to **10**. EAS was incrementing this
remotely; a local build cannot see that counter, and Play refuses anything less
than or equal to a code already uploaded — 9 is taken. Raise it by one for each
new upload.

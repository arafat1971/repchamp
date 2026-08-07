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
cd android && ./gradlew bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

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

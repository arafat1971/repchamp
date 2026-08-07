/**
 * Wire the real upload key into the release build.
 *
 * `android/` is generated and gitignored, so `prebuild` throws away anything
 * edited there — including a signing config. This runs as part of prebuild
 * instead, so the setting survives every regeneration.
 *
 * Expo's default release build is signed with the *debug* keystore. That is
 * fine for an APK you sideload, and useless for Play: an upload signed with a
 * debug key is rejected, and even if it were not, App Links verification
 * compares the installed certificate against `assetlinks.json`.
 *
 * Credentials are read from `android/keystore.properties`, which is gitignored
 * and never committed. When that file is absent the config is left untouched,
 * so a plain `assembleRelease` still works for anyone without the key.
 *
 * Expected contents (see KEYSTORE_SETUP.md):
 *
 *   storeFile=../@aro765__repchamp.jks
 *   storePassword=…
 *   keyAlias=…
 *   keyPassword=…
 */

const { withAppBuildGradle } = require('@expo/config-plugins');

const LOADER = `
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
`;

const UPLOAD_CONFIG = `        upload {
            if (keystoreProperties['storeFile']) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
`;

const withUploadSigning = (config) =>
  withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;

    // Load the properties file once, before the android {} block reads it.
    if (!src.includes('keystorePropertiesFile')) {
      src = src.replace(/^android \{/m, `${LOADER}\nandroid {`);
    }

    // Add an `upload` signing config alongside the stock `debug` one.
    if (!src.includes('upload {')) {
      src = src.replace(/(signingConfigs \{\n)/, `$1${UPLOAD_CONFIG}`);
    }

    /* Point release at the upload key when the properties file is present, and
     * leave it on debug when it is not — so a checkout without the key still
     * produces a working sideload APK rather than failing to configure. */
    src = src.replace(
      /(release \{\n(?:.*\n)*?\s*)signingConfig signingConfigs\.debug/m,
      `$1signingConfig keystoreProperties['storeFile'] ? signingConfigs.upload : signingConfigs.debug`,
    );

    cfg.modResults.contents = src;
    return cfg;
  });

module.exports = withUploadSigning;

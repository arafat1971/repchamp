/**
 * Keep `android/app/build.gradle`'s versionCode in step with app.json.
 *
 * `android/` is generated and gitignored, so every `expo prebuild` rewrites
 * build.gradle from the template — and the template's versionCode is 1. That is
 * how a build meant to be 12 shipped as 1: app.json said 12, the regenerated
 * gradle said 1, and nothing reconciled them. Play then saw a versionCode 1
 * artifact it refused to roll out, and the phone had version 1 installed.
 *
 * Expo reads `android.versionCode` from app.json for EAS builds but does not
 * write it into build.gradle for a local one. This does.
 */
const { withAppBuildGradle } = require('@expo/config-plugins');

module.exports = function withVersionCode(config) {
  return withAppBuildGradle(config, (cfg) => {
    const code = config.android && config.android.versionCode;
    if (typeof code === 'number') {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /versionCode\s+\d+/,
        `versionCode ${code}`,
      );
    }
    return cfg;
  });
};

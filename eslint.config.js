// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // Node/Jest tooling that runs outside the app bundle. Without these
    // globals declared, `jest`, `Buffer` and `__dirname` were reported as
    // no-undef — 26 errors that buried the handful of real ones in the noise.
    files: ["jest.setup.js", "scripts/**/*.js"],
    languageOptions: {
      globals: {
        jest: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        require: "readonly",
        module: "writable",
        process: "readonly",
      },
    },
  },
]);

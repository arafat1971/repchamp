// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // `.claude/worktrees/` holds full checkouts that background agents work
    // in. Linting them reported every one of their problems as if it were
    // yours — 38 errors against this tree's 4 — and the file-scoped rules
    // below never applied, because those paths do not match `jest.setup.js`.
    // `design/support.js` is generated ("do not edit", rebuilt from
    // dc-runtime) and never enters the app bundle, so its two React-DOM
    // warnings are unfixable here and only crowd out real findings.
    ignores: ["dist/*", ".claude/**", "design/support.js"],
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

/**
 * Jest config for the Firestore security-rules suites.
 *
 * Deliberately separate from `jest.config.js`: those tests run under the
 * `jest-expo` preset in a React Native environment, while these drive the
 * Firestore emulator through the plain Node SDK. Sharing one config would mean
 * pushing `@firebase/rules-unit-testing` through the RN transform pipeline and
 * running emulator I/O inside an RN environment — neither of which it expects.
 *
 * Run via `npm run test:rules`, which wraps this in `firebase emulators:exec`
 * so the emulator is up for the duration and torn down afterwards.
 */

module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/firestore-rules/**/*.test.ts'],
  // Type-stripping plus ESM→CJS, and nothing else. These files run on the local
  // Node, which already speaks every syntax they use, so there is nothing for
  // `@babel/preset-env` to down-level — and pulling it in conflicts with the
  // pinned Expo Babel stack, hence the two narrow pieces instead of the preset.
  // `babel.config.js` is bypassed (`configFile: false`) because the app's preset
  // targets React Native, not Node.
  transform: {
    '^.+\\.ts$': [
      'babel-jest',
      {
        configFile: false,
        babelrc: false,
        presets: ['@babel/preset-typescript'],
        plugins: ['@babel/plugin-transform-modules-commonjs'],
      },
    ],
  },
  // Emulator round-trips are slower than a pure unit test, and the first call
  // pays for rule compilation.
  testTimeout: 20000,
  // One emulator, one dataset. Jest's default is a worker per suite, and every
  // suite calls `clearFirestore()` between tests — so in parallel they wipe each
  // other's fixtures mid-run and fail as though the *rules* rejected the write.
  // Serial execution is what makes these suites mean anything.
  maxWorkers: 1,
};

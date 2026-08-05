module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // Only *.test.* files are suites, so shared fixtures can live alongside them
  // in __tests__ without Jest complaining that they contain no tests.
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  // `.claude/worktrees/` holds full checkouts that background agents work in,
  // each with its own copy of this suite. Collecting them reported 84 of 142
  // suites from trees that are not this one — a green run there says nothing
  // about this branch, and a worktree parked on an older commit runs tests for
  // code that no longer exists. `modulePathIgnorePatterns` is needed alongside
  // the test ignore: without it haste sees each duplicated module twice.
  testPathIgnorePatterns: ['/node_modules/', '/.claude/'],
  modulePathIgnorePatterns: ['<rootDir>/.claude/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Metro turns a `require`d binary asset into a module id; Jest tries to
    // parse it as JavaScript and chokes. Anything importing the pose model was
    // therefore untestable, which is why its loader had no tests at all.
    '\\.(tflite|png|jpg|jpeg|gif|webp|mp4|wav|mp3)$': '<rootDir>/jest.assetStub.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|react-native-vision-camera|react-native-worklets|react-native-nitro-modules|zustand))',
  ],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
};

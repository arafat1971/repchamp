module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // Only *.test.* files are suites, so shared fixtures can live alongside them
  // in __tests__ without Jest complaining that they contain no tests.
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
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

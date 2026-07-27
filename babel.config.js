module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { reactCompiler: true }]],
    plugins: [
      // Must stay last: the worklets plugin rewrites `'worklet'`-annotated
      // functions (frame processors, Reanimated callbacks) and needs to see the
      // fully transformed output.
      'react-native-worklets/plugin',
    ],
  };
};

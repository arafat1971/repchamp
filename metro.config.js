const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// TFLite models are shipped as app assets and `require()`d by react-native-fast-tflite.
// Metro only bundles extensions it knows about, so register it explicitly.
config.resolver.assetExts.push('tflite');

module.exports = config;

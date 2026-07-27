/* eslint-env jest */

// Native modules that have no JS-only implementation. The vision pipeline is
// tested through its pure functions (geometry, rep counter, exercise analysis),
// so the camera and TFLite bindings only need to exist, not to work.
jest.mock('react-native-vision-camera', () => ({
  Camera: 'Camera',
  useCameraDevice: () => ({ id: 'mock-front', position: 'front' }),
  useCameraPermission: () => ({ hasPermission: true, requestPermission: jest.fn() }),
  useFrameOutput: () => ({}),
  usePreviewOutput: () => ({}),
}));

jest.mock('react-native-fast-tflite', () => ({
  useTensorflowModel: () => ({ state: 'loaded', model: undefined }),
  loadTensorflowModel: jest.fn(),
}));

jest.mock('react-native-mmkv', () => {
  const store = new Map();
  return {
    createMMKV: () => ({
      set: (key, value) => store.set(key, String(value)),
      getString: (key) => store.get(key),
      remove: (key) => store.delete(key),
      clearAll: () => store.clear(),
    }),
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn() }));

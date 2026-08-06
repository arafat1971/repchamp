/**
 * Pose model loading — delegate fallback, and the timeout that makes it work.
 *
 * The bug these cover: `android-gpu` on a Pixel 7a neither resolves nor
 * rejects. A plain `await` therefore waited forever, the CPU fallback never
 * ran, and the session screen sat on "Rep counting couldn't start" with
 * nothing in logcat after "Loading Tensorflow Lite Model". A rejecting
 * delegate was always handled; a hanging one was not.
 */

const state = {
  /** Per-call behaviour, keyed by the delegate name ('' for CPU). */
  behaviour: {} as Record<string, 'resolve' | 'reject' | 'hang'>,
  /** Delegate lists passed to the loader, in order. */
  calls: [] as string[],
  /** Sources the loader was handed, so the resolved shape can be asserted. */
  sources: [] as unknown[],
};

/*
 * Stands in for the asset resolver. The real one needs a native module; what
 * matters here is only that a numeric `require` id becomes a `file://` URL,
 * because passing the id through unchanged is the bug this guards against.
 */
jest.mock('expo-asset', () => ({
  Asset: {
    fromModule: () => ({
      downloadAsync: async () => undefined,
      localUri: 'file:///data/app/movenet.tflite',
      uri: 'file:///data/app/movenet.tflite',
    }),
  },
}));

jest.mock('react-native', () => ({
  Platform: { select: (o: Record<string, unknown>) => o.android },
}));

jest.mock('react-native-fast-tflite', () => ({
  loadTensorflowModel: jest.fn((source: unknown, delegates: string[]) => {
    const key = delegates[0] ?? '';
    state.calls.push(key);
    state.sources.push(source);
    const mode = state.behaviour[key] ?? 'resolve';
    if (mode === 'resolve') return Promise.resolve({ __model: key });
    if (mode === 'reject') return Promise.reject(new Error(`${key} unavailable`));
    // Hang: a promise that never settles, which is the real device behaviour.
    return new Promise(() => {});
  }),
}));

import { preloadPoseModel, resetPoseModelForTests } from '../modelCache';

const SOURCE = 0 as never;

beforeEach(() => {
  state.behaviour = {};
  state.calls = [];
  state.sources = [];
  resetPoseModelForTests();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('delegate fallback', () => {
  it('uses the hardware delegate when it loads', async () => {
    const result = await preloadPoseModel(SOURCE);
    expect(result.state).toBe('loaded');
    expect(state.calls).toEqual(['android-gpu']);
  });

  it('falls back to CPU when the delegate rejects', async () => {
    state.behaviour['android-gpu'] = 'reject';
    const result = await preloadPoseModel(SOURCE);
    expect(result.state).toBe('loaded');
    if (result.state === 'loaded') expect(result.delegate).toBe('cpu');
    expect(state.calls).toEqual(['android-gpu', '']);
  });

  /*
   * The case that shipped broken. Without a timeout this test would never
   * finish, which is exactly what the app did.
   */
  it('falls back to CPU when the delegate hangs instead of rejecting', async () => {
    state.behaviour['android-gpu'] = 'hang';
    const promise = preloadPoseModel(SOURCE);
    await jest.advanceTimersByTimeAsync(6000);
    const result = await promise;

    expect(result.state).toBe('loaded');
    if (result.state === 'loaded') expect(result.delegate).toBe('cpu');
    expect(state.calls).toEqual(['android-gpu', '']);
  });

  it('reports an error when every attempt fails', async () => {
    state.behaviour['android-gpu'] = 'reject';
    state.behaviour[''] = 'reject';
    const result = await preloadPoseModel(SOURCE);
    expect(result.state).toBe('error');
  });

  /*
   * CPU is the last resort and has nothing to fall back to, so it is given a
   * longer window: timing it out would fail the session outright, whereas
   * waiting only makes a slow device feel slow.
   */
  it('gives CPU a longer window than the hardware delegate', async () => {
    state.behaviour['android-gpu'] = 'hang';
    state.behaviour[''] = 'hang';
    const promise = preloadPoseModel(SOURCE);

    await jest.advanceTimersByTimeAsync(6000); // GPU gives up
    await jest.advanceTimersByTimeAsync(6000); // CPU still waiting
    expect(state.calls).toEqual(['android-gpu', '']);

    await jest.advanceTimersByTimeAsync(18_000); // CPU's full 24s elapses
    const result = await promise;
    expect(result.state).toBe('error');
  });
});

/*
 * The bug that actually broke rep counting on device, and the one the delegate
 * work above was chasing without finding.
 *
 * `loadTensorflowModel` resolves a `require`d asset through
 * `Image.resolveAssetSource`. In dev that yields a Metro URL and works; in a
 * release build it yields a bare Android resource name, and the native side —
 * which calls `new URL(...)` on it — threw:
 *
 *     java.net.MalformedURLException: no protocol: assets_models_movenet
 *
 * Every delegate failed identically, so it looked like a hardware problem
 * rather than a source-shape one. Resolving to a `file://` URL first is the
 * fix, and passing the raw numeric id through is the regression.
 */
describe('model source resolution', () => {
  it('hands the loader a file URL, never the raw require id', async () => {
    await preloadPoseModel(SOURCE);

    expect(state.sources.length).toBeGreaterThan(0);
    for (const source of state.sources) {
      expect(typeof source).not.toBe('number');
      expect(source).toEqual({ url: 'file:///data/app/movenet.tflite' });
    }
  });

  it('resolves once, not per delegate attempt', async () => {
    state.behaviour['android-gpu'] = 'reject';
    await preloadPoseModel(SOURCE);

    // Both attempts get the same resolved source object.
    expect(state.calls).toEqual(['android-gpu', '']);
    expect(state.sources[0]).toEqual(state.sources[1]);
  });
});

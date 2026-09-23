/**
 * Reading steps, and refusing to guess.
 *
 * The Android case is the one that matters. `getStepCountAsync` is iOS-only,
 * and `watchStepCount` — the Android alternative — counts from the moment you
 * subscribe, so the number it produces looks like a daily total and is not
 * one. A partial count is indistinguishable from a lazy day, so the refusal
 * is behaviour worth pinning rather than an implementation detail.
 */

/* `Platform.OS` is overridden in place rather than by mocking `react-native`
   wholesale: the `jest-expo` preset supplies a working react-native, and
   replacing it with a stub broke `expo-sensors`' own imports — which the
   catch in `readStepsToday` then swallowed into a generic 'error'. */
import { Platform } from 'react-native';

function setPlatform(os: 'ios' | 'android' | 'web') {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
}

/* Jest hoists `jest.mock` above every `const` in the file, so the factory
   cannot close over a plain local — it would capture an uninitialised
   binding, the import would fail, and `readStepsToday`'s catch would report
   every case as a generic 'error'. The jest fns are therefore created inside
   the factory and read back through the mocked module below, which is the
   same `mock`-prefix discipline `coupleService.test.ts` follows. */
jest.mock('expo-sensors', () => ({
  Pedometer: {
    isAvailableAsync: jest.fn(),
    requestPermissionsAsync: jest.fn(),
    getStepCountAsync: jest.fn(),
  },
}));

import { Pedometer } from 'expo-sensors';

import { MAX_DAILY_STEPS } from '@/domain/steps';
import { isPedometerSupported, readStepsToday } from '../pedometer';

const mockPedometer = Pedometer as unknown as {
  isAvailableAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
  getStepCountAsync: jest.Mock;
};

beforeEach(() => {
  setPlatform('ios');
  // Cleared, not just re-stubbed: several assertions below count calls.
  mockPedometer.isAvailableAsync.mockReset().mockResolvedValue(true);
  mockPedometer.requestPermissionsAsync.mockReset().mockResolvedValue({ granted: true });
  mockPedometer.getStepCountAsync.mockReset().mockResolvedValue({ steps: 8432 });
});

describe('reading today’s steps', () => {
  it('returns the count the phone reports', async () => {
    const state = await readStepsToday(8000);
    expect(state).toEqual({ status: 'ready', steps: 8432, goal: 8000 });
  });

  it('asks only for today, starting at local midnight', async () => {
    await readStepsToday(8000);
    const [start, end] = mockPedometer.getStepCountAsync.mock.calls[0] as [Date, Date];
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.toDateString()).toBe(end.toDateString());
  });

  /* Asked on every read, not cached: motion access can be revoked in Settings
     while the app is backgrounded, and a stale "granted" would turn that into
     a zero-step day rather than a prompt. */
  it('checks permission on every read', async () => {
    await readStepsToday(8000);
    await readStepsToday(8000);
    expect(mockPedometer.requestPermissionsAsync).toHaveBeenCalledTimes(2);
  });
});

describe('when there is no count to give', () => {
  /* The whole reason steps are iOS-only. Android can only count from app
     open, which reads as a daily total and silently undercounts. */
  it('refuses on Android rather than reporting a partial count', async () => {
    setPlatform('android');
    const state = await readStepsToday(8000);
    expect(state).toEqual({ status: 'unavailable', reason: 'unsupported' });
    expect(mockPedometer.getStepCountAsync).not.toHaveBeenCalled();
  });

  it('does not even load the sensor module on an unsupported platform', async () => {
    setPlatform('web');
    await readStepsToday(8000);
    expect(mockPedometer.isAvailableAsync).not.toHaveBeenCalled();
  });

  it('reports hardware with no step counter', async () => {
    mockPedometer.isAvailableAsync.mockResolvedValue(false);
    const state = await readStepsToday(8000);
    expect(state).toEqual({ status: 'unavailable', reason: 'no-sensor' });
  });

  it('reports a declined permission as fixable rather than as an error', async () => {
    mockPedometer.requestPermissionsAsync.mockResolvedValue({ granted: false });
    const state = await readStepsToday(8000);
    expect(state).toEqual({ status: 'unavailable', reason: 'denied' });
  });

  it('reports a failed read rather than throwing into the caller', async () => {
    mockPedometer.getStepCountAsync.mockRejectedValue(new Error('simulator'));
    const state = await readStepsToday(8000);
    expect(state).toEqual({ status: 'unavailable', reason: 'error' });
  });

  /* An implausible count is a broken sensor, not a marathon. Rendering it
     would put a five-digit lie on the partner's card. */
  it('refuses a count past any human day', async () => {
    mockPedometer.getStepCountAsync.mockResolvedValue({ steps: MAX_DAILY_STEPS + 1 });
    const state = await readStepsToday(8000);
    expect(state).toEqual({ status: 'unavailable', reason: 'error' });
  });

  it('refuses a garbage count', async () => {
    mockPedometer.getStepCountAsync.mockResolvedValue({ steps: Number.NaN });
    const state = await readStepsToday(8000);
    expect(state).toEqual({ status: 'unavailable', reason: 'error' });
  });
});

describe('support check', () => {
  it('is true only on iOS', () => {
    setPlatform('ios');
    expect(isPedometerSupported()).toBe(true);
    setPlatform('android');
    expect(isPedometerSupported()).toBe(false);
  });
});

/**
 * Reading steps, and refusing to guess.
 *
 * Two routes, because the platforms differ. iOS asks `getStepCountAsync` for a
 * date range directly. Android reads the hardware counter, which is cumulative
 * since boot, and subtracts a baseline — see `domain/stepBaseline` for that
 * arithmetic and this file for the wire around it.
 *
 * What both share, and what these tests actually pin, is the refusal to
 * fabricate: every failure resolves to a *named reason* rather than a zero,
 * because a zero is a claim that the athlete has not moved and a wrong number
 * in a health context is worse than an absent one.
 */

/* `Platform.OS` is overridden in place rather than by mocking `react-native`
   wholesale: the `jest-expo` preset supplies a working react-native, and
   replacing it with a stub broke `expo-sensors`' own imports — which the
   catch in `readStepsToday` then swallowed into a generic 'error'. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { NativeModules, Platform } from 'react-native';

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

/* MMKV is faked so the baseline round-trip is exercised for real rather than
   stubbed away — the persisted anchor is what turns a boot-relative reading
   into a daily total, so a test that skips it tests nothing interesting.
   
   `NativeModules` is NOT mocked as a module: replacing it wholesale broke
   react-native's own `SourceCode` turbo-module and the suite failed to load
   at all. The StepCounter entry is injected into the real registry below
   instead, which leaves everything else intact. */
const mockMmkv = new Map<string, string>();
jest.mock('@/lib/storage', () => ({
  storage: {
    getString: (k: string) => mockMmkv.get(k),
    set: (k: string, v: string) => {
      mockMmkv.set(k, v);
    },
    remove: (k: string) => {
      mockMmkv.delete(k);
    },
  },
  zustandStorage: {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  },
}));

import { Pedometer } from 'expo-sensors';

import { MAX_DAILY_STEPS } from '@/domain/steps';
import { dayKey as todayKey } from '@/domain/progression';
import { isPedometerSupported, readStepsToday, setStepServiceEnabled } from '../pedometer';

const mockPedometer = Pedometer as unknown as {
  isAvailableAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
  getStepCountAsync: jest.Mock;
};

/* The baseline lives in native SharedPreferences, shared with the foreground
   service. Faked with a real Map so the save-then-reload round trip is
   exercised, which is the mechanism: an anchor that did not persist would
   restart the count from zero on every launch. */
const nativePrefs = new Map<string, string>();
const mockStepCounter = {
  isAvailable: jest.fn(),
  hasPermissionAsync: jest.fn(),
  readAsync: jest.fn(),
  getBaseline: jest.fn(async () => nativePrefs.get('baseline') ?? null),
  setBaseline: jest.fn((json: string) => {
    nativePrefs.set('baseline', json);
  }),
  startService: jest.fn(async () => true),
  stopService: jest.fn(async () => true),
};
(NativeModules as unknown as Record<string, unknown>).StepCounter = mockStepCounter;

beforeEach(() => {
  setPlatform('ios');
  // Cleared, not just re-stubbed: several assertions below count calls.
  mockPedometer.isAvailableAsync.mockReset().mockResolvedValue(true);
  mockPedometer.requestPermissionsAsync.mockReset().mockResolvedValue({ granted: true });
  mockPedometer.getStepCountAsync.mockReset().mockResolvedValue({ steps: 8432 });

  mockMmkv.clear();
  nativePrefs.clear();
  mockStepCounter.setBaseline.mockClear();
  mockStepCounter.startService.mockClear();
  mockStepCounter.stopService.mockClear();
  mockStepCounter.isAvailable.mockReset().mockResolvedValue(true);
  mockStepCounter.hasPermissionAsync.mockReset().mockResolvedValue(true);
  mockStepCounter.readAsync.mockReset().mockResolvedValue(10_000);
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
  /* Android no longer refuses — it reads the hardware counter. What it must
     still never do is answer via the iOS pedometer, whose Android behaviour
     is the deltas-while-subscribed undercount this design exists to avoid. */
  it('never uses the iOS pedometer on Android', async () => {
    setPlatform('android');
    await readStepsToday(8000);
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

describe('Android reads the hardware counter', () => {
  beforeEach(() => setPlatform('android'));

  /* The first read of a day anchors it rather than producing a total. A 0
     here would read as "you have not moved today" when the truth is "we
     started measuring a moment ago". */
  it('anchors the day on the first read instead of claiming zero', async () => {
    const state = await readStepsToday(8000);
    expect(state).toEqual({ status: 'unavailable', reason: 'starting' });
  });

  it('counts from the anchor on subsequent reads', async () => {
    await readStepsToday(8000); // anchors at 10,000
    mockStepCounter.readAsync.mockResolvedValue(12_400);

    const state = await readStepsToday(8000);
    expect(state).toEqual({ status: 'ready', steps: 2_400, goal: 8000, partial: false });
  });

  /* The anchor has to survive across reads, which is the whole reason it is
     persisted — an in-memory baseline would reset every app launch and the
     count would restart from zero each time. */
  it('persists the anchor so a later read still measures from it', async () => {
    await readStepsToday(8000);
    expect(nativePrefs.get('baseline')).toBeDefined();

    mockStepCounter.readAsync.mockResolvedValue(11_000);
    const state = await readStepsToday(8000);
    expect(state).toMatchObject({ status: 'ready', steps: 1_000 });
  });

  /* A reading below the anchor is impossible within one boot, so the device
     restarted. The pre-reboot steps are gone; the figure is real but
     understates the day, and says so. */
  it('marks a post-reboot count as partial rather than a total', async () => {
    await readStepsToday(8000); // anchors at 10,000
    mockStepCounter.readAsync.mockResolvedValue(350); // counter reset

    const state = await readStepsToday(8000);
    expect(state).toEqual({ status: 'ready', steps: 350, goal: 8000, partial: true });
  });

  it('keeps counting upward after a reboot', async () => {
    await readStepsToday(8000);
    mockStepCounter.readAsync.mockResolvedValue(350);
    await readStepsToday(8000); // re-anchors at 0
    mockStepCounter.readAsync.mockResolvedValue(900);

    const state = await readStepsToday(8000);
    expect(state).toMatchObject({ status: 'ready', steps: 900 });
  });

  it('reports a device with no step sensor', async () => {
    mockStepCounter.isAvailable.mockResolvedValue(false);
    const state = await readStepsToday(8000);
    expect(state).toEqual({ status: 'unavailable', reason: 'no-sensor' });
  });

  /* Recoverable in-app on Android, so it must be distinguishable from the
     reasons that are not — the card only offers a button for this one. */
  it('reports a missing activity permission as denied', async () => {
    mockStepCounter.hasPermissionAsync.mockResolvedValue(false);
    const state = await readStepsToday(8000);
    expect(state).toEqual({ status: 'unavailable', reason: 'denied' });
  });

  it('reports a rejected read rather than throwing', async () => {
    mockStepCounter.readAsync.mockRejectedValue(new Error('E_TIMEOUT'));
    const state = await readStepsToday(8000);
    expect(state).toEqual({ status: 'unavailable', reason: 'error' });
  });

  /* An old build whose native side predates the plugin. Nothing the athlete
     can act on, so it is `unsupported` rather than an error. */
  it('reports an absent native module as unsupported', async () => {
    const saved = (NativeModules as unknown as Record<string, unknown>).StepCounter;
    delete (NativeModules as unknown as Record<string, unknown>).StepCounter;
    try {
      const state = await readStepsToday(8000);
      expect(state).toEqual({ status: 'unavailable', reason: 'unsupported' });
    } finally {
      (NativeModules as unknown as Record<string, unknown>).StepCounter = saved;
    }
  });
});

describe('sharing the baseline with the foreground service', () => {
  beforeEach(() => setPlatform('android'));

  /* The service writes a `boot` field the app does not model. Writing an
     unchanged baseline back would be harmless now, but not writing it is what
     keeps the two writers from racing over nothing. */
  it('does not rewrite a baseline that did not change', async () => {
    nativePrefs.set('baseline', JSON.stringify({ day: todayKey(), reading: 9_000, boot: 7 }));
    await readStepsToday(8000);
    expect(mockStepCounter.setBaseline).not.toHaveBeenCalled();
  });

  /* The service anchored the day at midnight while the app was closed; the
     app must count from that, not re-anchor at the moment it opened. */
  it('counts from a baseline the service wrote while the app was closed', async () => {
    nativePrefs.set('baseline', JSON.stringify({ day: todayKey(), reading: 4_000, boot: 7 }));
    const state = await readStepsToday(8000);
    expect(state).toMatchObject({ status: 'ready', steps: 6_000, partial: false });
  });

  it('reads a partial day the service flagged after a reboot', async () => {
    nativePrefs.set(
      'baseline',
      JSON.stringify({ day: todayKey(), reading: 0, partial: true, boot: 8 }),
    );
    const state = await readStepsToday(8000);
    expect(state).toMatchObject({ status: 'ready', steps: 10_000, partial: true });
  });

  it('turns the service on and off through the native module', async () => {
    await expect(setStepServiceEnabled(true)).resolves.toBe(true);
    expect(mockStepCounter.startService).toHaveBeenCalled();
    await expect(setStepServiceEnabled(false)).resolves.toBe(false);
    expect(mockStepCounter.stopService).toHaveBeenCalled();
  });

  it('never starts a service off Android', async () => {
    setPlatform('ios');
    await expect(setStepServiceEnabled(true)).resolves.toBe(false);
    expect(mockStepCounter.startService).not.toHaveBeenCalled();
  });
});

/* The Kotlin service and this app write the same JSON. A field renamed on one
   side reads as absent on the other — a partial day silently shown as whole —
   so assert the service writes exactly the fields `StepBaseline` declares. */
describe('the service writes the baseline shape the app reads', () => {
  const plugin = readFileSync(join(__dirname, '..', '..', '..', 'plugins', 'withStepCounter.js'), 'utf8');

  it.each(['day', 'reading', 'partial', 'boot'])('writes the %s field', (field) => {
    expect(plugin).toContain(`.put("${field}"`);
  });
});

/**
 * Reading today's steps off the phone.
 *
 * Core Motion via `expo-sensors`, not HealthKit. HealthKit would give history
 * and steps counted by a Watch, at the cost of a privacy entitlement and an
 * App Review conversation about why a rep counter reads health data. The
 * pedometer answers the one question this app asks — how many steps today —
 * and asks for much less.
 *
 * Android is deliberately unsupported rather than partially supported. See
 * `domain/steps.ts` for why a count that starts at zero on every app open is
 * worse than no count at all.
 *
 * Every failure is a reason, never a throw. The caller renders the reason.
 */

import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

import { dayKey } from '@/domain/progression';
import { sanitizeSteps, type StepsState } from '@/domain/steps';
import {
  displayableSteps,
  isPartialDay,
  stepsToday,
  type StepBaseline,
} from '@/domain/stepBaseline';
import { storage } from '@/lib/storage';

/**
 * The pedometer, loaded only when the platform can actually use it.
 *
 * `require` rather than a static `import`, and this is load-bearing rather
 * than style. A static import runs at module load, *before* the platform
 * guard below — so on a build whose native side predates `expo-sensors`, the
 * app died at startup with "Cannot find native module 'ExponentPedometer'"
 * and took Home down with it. The guard cannot protect a top-level import.
 *
 * `require` rather than a dynamic `import()` for the mirror-image reason:
 * `import()` throws under Jest without `--experimental-vm-modules`, and the
 * catch in `readStepsToday` swallowed that into a generic 'error', making
 * every branch here untestable.
 */
function pedometer(): typeof import('expo-sensors').Pedometer {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('expo-sensors') as typeof import('expo-sensors')).Pedometer;
}

/** Midnight local, the start of the athlete's day as `dayKey` understands it. */
function startOfToday(now: Date = new Date()): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
}

/**
 * Today's steps, or why there are none.
 *
 * The platform guard comes first, so the sensor module is never even loaded
 * on a platform that cannot answer — see `pedometer()` above for why that
 * ordering is the difference between a missing ring and a dead app.
 */
export async function readStepsToday(goal: number): Promise<StepsState> {
  /* Android reads the hardware counter directly — see `readAndroidSteps`.
     `expo-sensors` only exposes deltas-while-subscribed there, which is why
     this was iPhone-only at first. Whether the sensor counts while nothing is
     listening is unverified — see the caveat in `domain/steps.ts`. */
  if (Platform.OS === 'android') return readAndroidSteps(goal);

  if (Platform.OS !== 'ios') {
    return { status: 'unavailable', reason: 'unsupported' };
  }

  try {
    const Pedometer = pedometer();
    const available = await Pedometer.isAvailableAsync();
    if (!available) return { status: 'unavailable', reason: 'no-sensor' };

    /* Asked every read rather than once at startup: an athlete can revoke
       motion access in Settings while the app is backgrounded, and a cached
       "granted" would then read as a zero-step day. */
    const permission = await Pedometer.requestPermissionsAsync();
    if (!permission.granted) return { status: 'unavailable', reason: 'denied' };

    const { steps } = await Pedometer.getStepCountAsync(startOfToday(), new Date());
    const safe = sanitizeSteps(steps);
    if (safe == null) return { status: 'unavailable', reason: 'error' };

    return { status: 'ready', steps: safe, goal };
  } catch {
    /* Includes the simulator, where the pedometer resolves and then throws on
       read. A reason the athlete can act on is better than a crash. */
    return { status: 'unavailable', reason: 'error' };
  }
}

/** Whether this build can count steps at all, without asking for permission. */
export function isPedometerSupported(): boolean {
  return Platform.OS === 'ios';
}


/* ------------------------------------------------------------------ *
 * Android
 * ------------------------------------------------------------------ */

interface StepCounterNative {
  isAvailable(): Promise<boolean>;
  hasPermissionAsync(): Promise<boolean>;
  /** Steps since the device booted. Rejects with a code rather than faking 0. */
  readAsync(): Promise<number>;
}

function stepCounter(): StepCounterNative | null {
  return (NativeModules as { StepCounter?: StepCounterNative }).StepCounter ?? null;
}

/** True when this build ships the native step-counter module. */
export function isAndroidStepCounterAvailable(): boolean {
  return Platform.OS === 'android' && stepCounter() != null;
}

/** Ask for ACTIVITY_RECOGNITION. Returns whether it is granted afterwards. */
export async function requestAndroidStepPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION,
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

/**
 * Today's steps on Android.
 *
 * The sensor gives steps since boot, so the day's total is that minus a
 * baseline taken at the first reading of the day. All of that arithmetic —
 * including the reboot case, where the counter resets and the earlier steps
 * are unrecoverable — lives in `domain/stepBaseline`, tested without a device.
 *
 * This function is the wire: read, apply, persist the next baseline.
 */
async function readAndroidSteps(goal: number): Promise<StepsState> {
  const mod = stepCounter();
  /* An older build without the plugin. Reported as unsupported rather than an
     error, because there is nothing the athlete can do about it. */
  if (!mod) return { status: 'unavailable', reason: 'unsupported' };

  try {
    if (!(await mod.isAvailable())) {
      return { status: 'unavailable', reason: 'no-sensor' };
    }
    if (!(await mod.hasPermissionAsync())) {
      return { status: 'unavailable', reason: 'denied' };
    }

    const reading = await mod.readAsync();
    const today = dayKey();
    const { result, nextBaseline } = stepsToday(reading, loadBaseline(), today);
    saveBaseline(nextBaseline);

    const steps = displayableSteps(result);
    /* Null means the day has only just been anchored — there is no count to
       show yet, and a 0 would read as "you have not moved". */
    if (steps == null) return { status: 'unavailable', reason: 'starting' };

    const safe = sanitizeSteps(steps);
    if (safe == null) return { status: 'unavailable', reason: 'error' };

    return { status: 'ready', steps: safe, goal, partial: isPartialDay(result) };
  } catch {
    return { status: 'unavailable', reason: 'error' };
  }
}

const BASELINE_KEY = 'steps.baseline.v1';

function loadBaseline(): StepBaseline | null {
  try {
    const raw = storage.getString(BASELINE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StepBaseline;
    return typeof parsed?.day === 'string' && typeof parsed?.reading === 'number'
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function saveBaseline(baseline: StepBaseline): void {
  try {
    storage.set(BASELINE_KEY, JSON.stringify(baseline));
  } catch {
    /* Losing the baseline costs one day's count, not correctness: the next
       read re-anchors and reports `starting`. */
  }
}

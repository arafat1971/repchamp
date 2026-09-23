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

import { Platform } from 'react-native';

import { sanitizeSteps, type StepsState } from '@/domain/steps';

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

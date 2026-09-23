/**
 * Keeping the OS widget's snapshot current.
 *
 * The widget lives in the launcher's process and cannot read MMKV, hold a
 * Firestore listener, or run any of this app's JavaScript. So the app mirrors a
 * small flat payload into `SharedPreferences` whenever it has fresh state, and
 * the provider draws whatever it finds there.
 *
 * Follows the same no-op-when-unavailable pattern as every other service here:
 * the native module only exists on Android, and only in a build made since the
 * widget plugin was added. On iOS, on web, and in tests, every call is a quiet
 * no-op rather than a crash — so callers can wire this unconditionally.
 */

import { NativeModules, Platform } from 'react-native';

import type { DashboardSnapshot } from '@/domain/dashboardSnapshot';
import type { WidgetId, WidgetSnapshot } from '@/domain/widgetSnapshot';

/**
 * Anything a widget can be handed.
 *
 * A union of the concrete payloads rather than a loose record of primitives:
 * each widget answers a different question and has its own shape, and an
 * index signature would accept any object at all — including one missing the
 * `updatedAt` every widget needs to age itself. The union keeps each payload
 * checked against the one the matching native code actually decodes.
 *
 * Adding a widget means adding its type here, which is the intended friction:
 * the flat-primitives rule is enforced by each payload's own test.
 */
export type WidgetPayload = WidgetSnapshot | DashboardSnapshot;

interface PartnerWidgetNative {
  setSnapshot(widget: string, json: string): void;
  count(widget: string): Promise<number>;
}

function native(): PartnerWidgetNative | null {
  /* Android only, and deliberately so for now. The iOS dashboard widget's
     Swift exists and compiles, but there is no iOS native module to write the
     payload into the App Group suite — so every call here is a no-op on iOS,
     including the dashboard publish Home makes. `isWidgetSupported()` reports
     that truthfully, which is what keeps the setup screen from promising a
     widget that cannot be fed. See plugins/withDailyWidgetIOS.js. */
  if (Platform.OS !== 'android') return null;
  return (NativeModules as { PartnerWidget?: PartnerWidgetNative }).PartnerWidget ?? null;
}

/** True when this build can actually host the widget. */
export function isWidgetSupported(): boolean {
  return native() != null;
}

/**
 * Publish the latest snapshot and ask the launcher to redraw.
 *
 * Never throws. A widget failing to update is not worth interrupting a session
 * for, and the provider already draws a stale marker when its payload ages out.
 */
export function publishWidgetSnapshot(
  snapshot: WidgetPayload,
  widget: WidgetId = 'partner',
): void {
  const mod = native();
  if (!mod) return;
  try {
    mod.setSnapshot(widget, JSON.stringify(snapshot));
  } catch {
    // Best-effort.
  }
}

/**
 * How many instances the athlete has placed, or 0 when unknown.
 *
 * Used by the setup screen to tell "not added yet" from "added, here is what it
 * shows" — a screen that cannot tell the difference has to hedge, and hedged
 * instructions are what make a widget feel undiscoverable.
 */
export async function placedWidgetCount(widget: WidgetId = 'partner'): Promise<number> {
  const mod = native();
  if (!mod) return 0;
  try {
    return await mod.count(widget);
  } catch {
    return 0;
  }
}

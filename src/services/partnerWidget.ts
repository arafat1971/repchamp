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

import type { WidgetSnapshot } from '@/domain/widgetSnapshot';

interface PartnerWidgetNative {
  setSnapshot(json: string): void;
  count(): Promise<number>;
}

function native(): PartnerWidgetNative | null {
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
export function publishWidgetSnapshot(snapshot: WidgetSnapshot): void {
  const mod = native();
  if (!mod) return;
  try {
    mod.setSnapshot(JSON.stringify(snapshot));
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
export async function placedWidgetCount(): Promise<number> {
  const mod = native();
  if (!mod) return 0;
  try {
    return await mod.count();
  } catch {
    return 0;
  }
}

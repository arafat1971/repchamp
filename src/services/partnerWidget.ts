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
import type { WaterWidgetSnapshot } from '@/domain/waterWidget';
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
export type WidgetPayload = WidgetSnapshot | DashboardSnapshot | WaterWidgetSnapshot;

interface PartnerWidgetNative {
  setSnapshot(widget: string, json: string): void;
  count(widget: string): Promise<number>;
  /** Absent on builds made before pinning was added. */
  requestPin?(widget: string): Promise<boolean>;
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
  /* Home re-renders on every change to the couple document — a rep, a nudge,
     a streak tick — and most of them change nothing a widget shows. Skipping
     a payload identical but for its build time saves a disk write, a
     broadcast and a bitmap redraw in the launcher each time. */
  const { updatedAt: _at, ...content } = snapshot;
  const sig = JSON.stringify(content);
  if (lastSent.get(widget) === sig) return;
  try {
    mod.setSnapshot(widget, JSON.stringify(snapshot));
    lastSent.set(widget, sig);
  } catch {
    // Best-effort.
  }
}

/** What each widget was last handed, minus its build time. */
const lastSent = new Map<WidgetId, string>();

/**
 * Empty a widget — unpaired, or the partner stopped sharing — so it shows
 * its empty state instead of freezing on someone's last numbers.
 */
export function clearWidgetSnapshot(widget: WidgetId): void {
  const mod = native();
  if (!mod || lastSent.get(widget) === '') return;
  try {
    mod.setSnapshot(widget, '');
    lastSent.set(widget, '');
  } catch {
    // Best-effort.
  }
}

/** Forget what was sent — for tests. */
export function resetWidgetPublishMemo(): void {
  lastSent.clear();
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

/**
 * Ask the launcher to put a widget on the home screen — the system's own
 * "Add to home screen" sheet, so one tap instead of a hunt through the
 * widget picker.
 *
 * Resolves false where that is not possible (iOS, an older build, Android
 * before 8, or a launcher that opts out); callers then show the gesture.
 * True means the sheet was shown, not that it was accepted — confirm with
 * `placedWidgetCount`.
 */
export async function requestPinWidget(widget: WidgetId = 'water'): Promise<boolean> {
  const mod = native();
  if (!mod?.requestPin) return false;
  try {
    return await mod.requestPin(widget);
  } catch {
    return false;
  }
}

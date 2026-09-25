import { POKE_GAP_MS, type HabitId, type Poke } from '@/domain/ritual';
import { dayKey } from '@/domain/progression';
import { recordCoupleRitual } from '@/services/coupleService';
import { ritualChanged } from '@/services/hydrationSync';

/**
 * Publishing the ritual and the live moments on "Today, together".
 *
 * Every write goes into my own slice of the couple document, which the
 * partner is already watching live — so a tick, a heartbeat or a poke reaches
 * their screen within a second or two, with no push and no server of our own.
 * All best-effort: a dropped heartbeat just means "here" fades a beat early.
 */

let lastTicks: { day: string; key: string } | null = null;

export async function syncRitualNow(coupleId: string | null | undefined, uid: string | null | undefined, ticks: readonly HabitId[]): Promise<void> {
  if (!coupleId || !uid) return;
  const day = dayKey();
  const key = [...ticks].sort().join(',');
  if (lastTicks && lastTicks.day === day && lastTicks.key === key) return;
  try {
    await recordCoupleRitual(coupleId, uid, day, { habits: [...ticks] });
    const first = lastTicks === null;
    lastTicks = { day, key };
    // The first publish on open is a catch-up, not news for their widget.
    if (!first) ritualChanged(coupleId, uid);
  } catch {
    // The next tick, or the next open, publishes it.
  }
}

/** "I'm here" — sent on open and every `HERE_BEAT_MS` while the screen is focused. */
export async function beatHere(coupleId: string | null | undefined, uid: string | null | undefined): Promise<void> {
  if (!coupleId || !uid) return;
  try {
    await recordCoupleRitual(coupleId, uid, dayKey(), { hereAt: Date.now() });
  } catch {
    // A missed beat only shortens "here".
  }
}

let lastPokeAt = 0;

/**
 * Throw an emoji across to the partner's bear. Throttled on the phone so a
 * held finger cannot flood the document; returns false when throttled.
 */
export function sendPoke(coupleId: string | null | undefined, uid: string | null | undefined, e: Poke): boolean {
  if (!coupleId || !uid) return false;
  const now = Date.now();
  if (now - lastPokeAt < POKE_GAP_MS) return false;
  lastPokeAt = now;
  void recordCoupleRitual(coupleId, uid, dayKey(), { poke: { e, at: now } }).catch(() => {});
  return true;
}

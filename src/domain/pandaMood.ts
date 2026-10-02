import type { PaceStatus } from '@/domain/hydrationPace';

/**
 * How the hydration panda feels, from how the day's water is going.
 *
 * The panda holds a bottle of what is left of today's water, so its face and
 * its bottle tell one story: a full bottle at breakfast is fine, a full bottle
 * by mid-afternoon is a thirsty panda, and an empty bottle is a party.
 */

export type PandaOutfit = 'classic' | 'hoodie';
export type PandaMood = 'happy' | 'thirsty' | 'sleepy' | 'celebrate';

/** Behind pace by at least this much before the panda looks thirsty. */
export const THIRSTY_BEHIND_ML = 300;

export function pandaMood({
  met,
  pace,
  behindMl = 0,
  hour,
}: {
  met: boolean;
  pace: PaceStatus | null;
  behindMl?: number;
  /** Local hour, 0..23. */
  hour: number;
}): PandaMood {
  if (met) return 'celebrate';
  // Late at night the pace no longer matters; nagging then helps no one.
  if (hour >= 22 || hour < 6) return 'sleepy';
  if (pace === 'behind' && behindMl >= THIRSTY_BEHIND_ML) return 'thirsty';
  return 'happy';
}

/** What is left in the panda's bottle, 0..100, from today's water and goal. */
export function bottleRemaining(ml: number, goalMl: number): number {
  if (!(goalMl > 0)) return 100;
  return Math.round(Math.max(0, Math.min(100, 100 - (ml / goalMl) * 100)));
}

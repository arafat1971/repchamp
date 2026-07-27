/**
 * Opponent simulation for 1v1 duels.
 *
 * There is no multiplayer server yet, so a duel runs against a paced bot. The
 * prototype used `Math.random() < 0.72` per tick, which made rematches feel
 * arbitrary — the same rival could score 4 or 14. This model instead gives each
 * opponent a stable reps-per-minute and a small amount of jitter, so a rival
 * plays consistently and the athlete can learn to beat them.
 *
 * When a real backend lands, replace `OpponentPacer` with a stream of the
 * remote athlete's rep events; nothing else in the session needs to change.
 */

export interface Opponent {
  id: string;
  name: string;
  initial: string;
  /** Avatar background. */
  color: string;
  /** Avatar border used on the duel HUD. */
  borderColor: string;
  /** Rep count colour on the HUD. */
  repColor: string;
  level: number;
  online: boolean;
  /** Sustained pace, reps per minute. */
  repsPerMinute: number;
}

export const OPPONENTS: readonly Opponent[] = [
  {
    id: 'adrian',
    name: 'Adrian',
    initial: 'A',
    color: '#5b21b6',
    borderColor: '#a855f7',
    repColor: '#c4b5fd',
    level: 4,
    online: true,
    repsPerMinute: 58,
  },
  {
    id: 'zheng',
    name: 'Zheng',
    initial: 'Z',
    color: '#1e40af',
    borderColor: '#3b82f6',
    repColor: '#93c5fd',
    level: 6,
    online: true,
    repsPerMinute: 70,
  },
  {
    id: 'mia',
    name: 'Mia',
    initial: 'M',
    color: '#92400e',
    borderColor: '#f59e0b',
    repColor: '#fcd34d',
    level: 7,
    online: false,
    repsPerMinute: 76,
  },
];

export function getOpponent(id: string | null | undefined): Opponent {
  if (id) {
    // Check phantom opponents first (seeding system).
    const { getPhantomOpponent } = require('@/domain/phantomRoster');
    const phantom = getPhantomOpponent(id);
    if (phantom) return phantom;
  }
  return OPPONENTS.find((o) => o.id === id) ?? (OPPONENTS[0] as Opponent);
}

/**
 * Deterministic per-duel jitter.
 *
 * A seeded generator rather than `Math.random()` so a duel can be replayed
 * exactly in a test, and so the bot's pace cannot be re-rolled by the UI
 * re-rendering mid-set.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Converts an opponent's pace into rep counts over elapsed time.
 *
 * Ask it for `repsAt(elapsedSeconds)` — it is a pure function of elapsed time,
 * so a dropped frame or a paused clock can never desynchronise the score.
 */
export class OpponentPacer {
  private readonly intervals: number[] = [];

  constructor(opponent: Opponent, durationSec: number, seed = 1) {
    const random = mulberry32(seed);
    const meanInterval = 60 / opponent.repsPerMinute;

    // Pre-roll every rep time for the whole duel. Humans fade slightly, so the
    // interval drifts longer as the set progresses.
    let t = 0;
    while (t < durationSec) {
      const fatigue = 1 + 0.22 * (t / durationSec);
      // ±18% jitter keeps the pace human without making it unpredictable.
      const jitter = 0.82 + random() * 0.36;
      t += meanInterval * fatigue * jitter;
      if (t <= durationSec) this.intervals.push(t);
    }
  }

  /** Reps the opponent has completed by `elapsedSeconds`. */
  repsAt(elapsedSeconds: number): number {
    let count = 0;
    for (const time of this.intervals) {
      if (time <= elapsedSeconds) count += 1;
      else break;
    }
    return count;
  }

  /** Total reps the opponent finishes the duel with. */
  get finalReps(): number {
    return this.intervals.length;
  }
}

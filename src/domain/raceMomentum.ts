/**
 * Who has the momentum right now.
 *
 * `duelTension` says where the race stands: the margin, a lead change, the
 * closing seconds. What it cannot say is which way it is *moving*. Two athletes
 * level at 12 read "DEAD LEVEL" whether one has just banged out four reps in
 * five seconds or both have stalled, and those are completely different races
 * to be in. Momentum is the thing that makes a live race feel live: the
 * run you are on, or the one your rival is on.
 *
 * Measured over a short rolling window of rep timestamps, because momentum is
 * recent by definition. A run from thirty seconds ago is history.
 *
 * Pure: the HUD records when each rep landed and asks this what to show, so a
 * whole set's arc can be replayed in tests.
 */

/** How far back "recent" reaches. About three brisk reps' worth. */
export const HEAT_WINDOW_MS = 5_000;

/** Reps inside the window that count as a run. */
export const HEAT_MIN_REPS = 3;

export type Heat =
  /** I am on a run and out-pacing them. */
  | { kind: 'mine'; run: number }
  /** They are on a run and out-pacing me. */
  | { kind: 'theirs'; run: number }
  | { kind: 'none' };

function recent(times: readonly number[], now: number): number {
  let n = 0;
  for (let i = times.length - 1; i >= 0; i--) {
    const t = times[i] as number;
    if (now - t > HEAT_WINDOW_MS) break;
    if (t <= now) n++;
  }
  return n;
}

/**
 * How far ahead in the window a rival must be before it counts as *their*
 * momentum. Set from a real duel on the Pixel 7a: a normal human pace put 2
 * reps in the window while the AI partner's steady pace put 3–4. With a gap of
 * one, "SURGING" showed for the whole race — the rival's ordinary pace read as
 * a surge, and a warning that never goes away is wallpaper.
 */
export const RIVAL_SURGE_GAP = 2;

/**
 * The run worth calling out, or none.
 *
 * Deliberately lopsided. My run needs `HEAT_MIN_REPS` and to be ahead of their
 * pace, by any margin: celebrating should be easy to earn. Theirs needs the
 * same run *and* a clear `RIVAL_SURGE_GAP` over mine, so it shows while I have
 * stopped, not while I am working a rep behind a fast rival. Timestamps must be
 * ascending, which is how the HUD records them.
 */
export function readHeat(mine: readonly number[], theirs: readonly number[], now: number): Heat {
  const me = recent(mine, now);
  const them = recent(theirs, now);
  if (me >= HEAT_MIN_REPS && me > them) return { kind: 'mine', run: me };
  if (them >= HEAT_MIN_REPS && them >= me + RIVAL_SURGE_GAP) return { kind: 'theirs', run: them };
  return { kind: 'none' };
}

/** Copy for the chip. Short: it is read mid-rep. */
export function heatLabel(heat: Heat, rivalName: string): string {
  if (heat.kind === 'mine') return heat.run >= 5 ? `UNSTOPPABLE ×${heat.run}` : `ON FIRE ×${heat.run}`;
  if (heat.kind === 'theirs') return `${rivalName.toUpperCase()} IS SURGING`;
  return '';
}

/**
 * The closing seconds, when the screen itself should start to press.
 *
 * Deliberately separate from `isEndgame`, which also requires a contested race:
 * the edge pulse is about the clock, and a clock running out is urgent for
 * the leader too.
 */
export const FINAL_SECONDS = 10;

export function isFinalCountdown(timeLeft: number): boolean {
  return timeLeft > 0 && timeLeft <= FINAL_SECONDS;
}

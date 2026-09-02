/**
 * The state of the race, said out loud.
 *
 * The duel HUD showed two rep counts and a tug bar and left the athlete to do
 * the arithmetic themselves, mid-push-up: am I ahead, by how much, is it
 * slipping? A duel's whole tension lives in the margin, and the margin was the
 * one thing never stated.
 *
 * This turns the two counts into the three facts that actually drive the next
 * rep — the size of the gap, whether the lead just changed hands, and whether
 * the clock has made it urgent. A lead change is the single most galvanising
 * event in a race and previously passed in silence.
 *
 * Pure, so a whole duel can be replayed rep by rep in tests.
 */

export type RaceState =
  /** Clear lead, comfortable. */
  | 'ahead'
  /** Ahead, but by a single rep. */
  | 'narrow-lead'
  /** Dead level. */
  | 'tied'
  /** Behind by a single rep — catchable. */
  | 'narrow-deficit'
  /** Behind by more. */
  | 'behind';

export interface RaceRead {
  state: RaceState;
  /** Signed: positive when ahead, negative when behind. */
  margin: number;
  /** Copy for the HUD. Short enough to read mid-rep. */
  label: string;
  /** True when the race is close enough that the next rep matters. */
  contested: boolean;
}

/** Above this the race stops being a race and becomes a procession. */
const RUNAWAY = 6;

/**
 * Read the race from the two counts.
 *
 * "Contested" deliberately includes being a few behind rather than only when
 * level: someone two reps down is exactly who a HUD should be talking to, and
 * someone eight ahead does not need encouraging.
 */
export function readRace(myReps: number, theirReps: number): RaceRead {
  const margin = myReps - theirReps;
  const gap = Math.abs(margin);

  if (margin === 0) {
    return { state: 'tied', margin, label: 'DEAD LEVEL', contested: true };
  }
  if (margin > 0) {
    const state: RaceState = margin === 1 ? 'narrow-lead' : 'ahead';
    return {
      state,
      margin,
      label: margin === 1 ? 'AHEAD BY 1' : `AHEAD BY ${margin}`,
      contested: gap < RUNAWAY,
    };
  }
  const state: RaceState = gap === 1 ? 'narrow-deficit' : 'behind';
  return {
    state,
    margin,
    label: gap === 1 ? 'DOWN BY 1' : `DOWN BY ${gap}`,
    contested: gap < RUNAWAY,
  };
}

/**
 * Whether the lead just changed hands.
 *
 * The most galvanising event in a race, and it previously passed with nothing
 * but two numbers quietly swapping order. Only counts when a real lead is
 * taken or lost — drawing level is not an overtake, and is reported by
 * `readRace` as a tie in its own right.
 */
export function leadChanged(previousMargin: number, currentMargin: number): 'took' | 'lost' | null {
  if (previousMargin <= 0 && currentMargin > 0) return 'took';
  if (previousMargin >= 0 && currentMargin < 0) return 'lost';
  return null;
}

/**
 * Whether this is the closing stretch of a contested duel.
 *
 * Both halves matter: late in a runaway there is nothing to say, and a close
 * race with a minute left has not earned the urgency yet.
 */
export function isEndgame(timeLeft: number, race: RaceRead): boolean {
  return timeLeft > 0 && timeLeft <= 15 && race.contested;
}

/**
 * The line for the closing stretch, or empty.
 *
 * Phrased as an instruction rather than a status — at ten seconds down by two,
 * "DOWN BY 2" is a fact and "TWO REPS TO TIE IT" is a plan.
 */
export function endgameLabel(timeLeft: number, race: RaceRead): string {
  if (!isEndgame(timeLeft, race)) return '';
  if (race.margin === 0) return `${timeLeft}s — WHOEVER WANTS IT`;
  if (race.margin < 0) {
    const need = Math.abs(race.margin);
    return need === 1 ? `${timeLeft}s — ONE REP TO TIE IT` : `${timeLeft}s — ${need} TO TIE IT`;
  }
  return `${timeLeft}s — HOLD THE LEAD`;
}

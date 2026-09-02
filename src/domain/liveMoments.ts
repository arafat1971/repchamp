/**
 * What the camera screen should say, right now, to make the next rep happen.
 *
 * Between the first rep and the last, the live screen said nothing. A haptic
 * fired per rep and the number went up; there was no point at which the app
 * noticed the athlete was close to something. The set was a timer with a
 * counter on it.
 *
 * The strongest hooks are already in the data and were simply never read:
 *  - the **personal best** the athlete is about to beat, which the session
 *    screen did not even load,
 *  - the **round number** approaching,
 *  - the **target** they set themselves,
 *  - the **last few seconds**, where a sprint is still possible.
 *
 * Each returns a moment with a `weight`, so when several are true at once the
 * screen shows the one that matters most rather than stacking them. A cue that
 * fires constantly is wallpaper — these are deliberately sparse, and each fires
 * once per set.
 *
 * Pure, so the whole arc of a set can be replayed in tests.
 */

export type MomentKind =
  /** One rep away from their record. */
  | 'pb-close'
  /** Just beat it. */
  | 'pb-beaten'
  /** Approaching a round number. */
  | 'round-close'
  /** One rep from the target they chose. */
  | 'target-close'
  /** Target met. */
  | 'target-hit'
  /** Clock nearly out and reps still possible. */
  | 'final-push';

export interface LiveMoment {
  kind: MomentKind;
  /** Large text — read at a glance, mid-rep, from across a room. */
  headline: string;
  /** Optional second line. Empty when the headline says enough. */
  detail: string;
  /** Higher wins when several fire on the same rep. */
  weight: number;
  /** Celebration rather than encouragement — drives colour and haptics. */
  triumphant: boolean;
}

export interface LiveMomentInput {
  reps: number;
  /** Seconds left, or null when the set is untimed. */
  timeLeft: number | null;
  /** Their record for this exercise before this set. 0 when they have none. */
  personalBest: number;
  /** The target for this set, when there is one. */
  target: number | null;
}

/** Round numbers worth noticing. Sparse on purpose — every 10 is wallpaper. */
const ROUND_NUMBERS = [10, 25, 50, 75, 100, 150, 200] as const;

/**
 * The single moment to show for this rep, or null.
 *
 * Ordered by weight, not by check order, so adding a moment later cannot
 * silently outrank the personal best — which is the one that actually changes
 * whether someone does another rep.
 */
export function momentFor(input: LiveMomentInput): LiveMoment | null {
  const { reps, timeLeft, personalBest, target } = input;
  const moments: LiveMoment[] = [];

  /* Beating a record is the strongest hook the app has, and it was invisible:
     the session screen never loaded `personalBests` at all. */
  if (personalBest > 0) {
    if (reps === personalBest + 1) {
      moments.push({
        kind: 'pb-beaten',
        headline: 'NEW RECORD',
        detail: `${reps} beats your best of ${personalBest}`,
        weight: 100,
        triumphant: true,
      });
    } else if (reps === personalBest - 1) {
      moments.push({
        kind: 'pb-close',
        headline: 'ONE FROM YOUR RECORD',
        detail: `${personalBest} is the number to beat`,
        weight: 90,
        triumphant: false,
      });
    }
  }

  if (target && target > 0) {
    if (reps === target) {
      moments.push({
        kind: 'target-hit',
        headline: 'TARGET HIT',
        detail: 'Everything from here is extra',
        weight: 80,
        triumphant: true,
      });
    } else if (reps === target - 1) {
      moments.push({
        kind: 'target-close',
        headline: 'ONE TO GO',
        detail: '',
        weight: 70,
        triumphant: false,
      });
    }
  }

  /* Only *approaching* a round number. Announcing one already reached is a
     scoreboard, not a reason to keep moving. */
  const round = ROUND_NUMBERS.find((n) => n === reps + 1);
  if (round) {
    moments.push({
      kind: 'round-close',
      headline: `${round} IS ONE AWAY`,
      detail: '',
      weight: 40,
      triumphant: false,
    });
  }

  /* The last few seconds, where a sprint is still worth attempting. Not for an
     untimed set, and not before any reps — "final push" on zero reps is a
     taunt. */
  if (timeLeft !== null && timeLeft > 0 && timeLeft <= 10 && reps > 0) {
    moments.push({
      kind: 'final-push',
      headline: `${timeLeft}s — EVERYTHING YOU HAVE`,
      detail: '',
      weight: 30,
      triumphant: false,
    });
  }

  if (moments.length === 0) return null;
  return moments.reduce((a, b) => (b.weight > a.weight ? b : a));
}

/**
 * Whether a moment of this kind has already fired this set.
 *
 * The screen keeps the set of kinds it has shown and passes it here. Each kind
 * fires once: a "one from your record" that reappears every time the count
 * wobbles teaches the athlete to ignore it.
 *
 * `final-push` is the exception — it is tied to the clock rather than a rep
 * count, so it is allowed to update as the seconds run down.
 */
export function shouldShow(kind: MomentKind, alreadyShown: ReadonlySet<MomentKind>): boolean {
  if (kind === 'final-push') return true;
  return !alreadyShown.has(kind);
}

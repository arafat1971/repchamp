/**
 * The one ring on Home's Today card that is closest to closing, said as the
 * smallest next step ("2 glasses to go").
 *
 * People push hardest when the finish looks near (the goal-gradient effect),
 * so the card names the nearest open goal rather than an average percentage,
 * which says nothing about what to do. Ties go to the challenge, then water,
 * then steps: the challenge is what the app is for, and water is the easiest
 * win after it.
 */

export type NextToClose =
  | { kind: 'challenge' | 'water' | 'steps'; text: string }
  | { kind: 'perfect'; text: string };

const GLASS_ML = 250;

export function nextToClose(input: {
  challenge: { best: number; target: number; label: string };
  water: { ml: number; goalMl: number };
  /** Null when steps cannot be read; that ring then never counts as open. */
  steps: { steps: number; goal: number } | null;
}): NextToClose | null {
  const { challenge, water, steps } = input;
  const open: { kind: 'challenge' | 'water' | 'steps'; fraction: number; text: string }[] = [];

  if (challenge.target > 0 && challenge.best < challenge.target) {
    const left = challenge.target - challenge.best;
    const noun = challenge.label.toLowerCase();
    open.push({
      kind: 'challenge',
      fraction: challenge.best / challenge.target,
      text: `${left} ${left === 1 ? noun : `${noun}s`} to go`,
    });
  }
  if (water.goalMl > 0 && water.ml < water.goalMl) {
    const glasses = Math.ceil((water.goalMl - water.ml) / GLASS_ML);
    open.push({
      kind: 'water',
      fraction: water.ml / water.goalMl,
      text: `${glasses} ${glasses === 1 ? 'glass' : 'glasses'} of water to go`,
    });
  }
  if (steps && steps.goal > 0 && steps.steps < steps.goal) {
    open.push({
      kind: 'steps',
      fraction: steps.steps / steps.goal,
      text: `${compactSteps(steps.goal - steps.steps)} steps to go`,
    });
  }

  if (open.length === 0) {
    // Steps unreadable still allows a perfect day on the two that can close.
    return { kind: 'perfect', text: 'Perfect day — every ring closed' };
  }
  // Stable sort: equal fractions keep the challenge → water → steps order.
  open.sort((a, b) => b.fraction - a.fraction);
  const best = open[0]!;
  return { kind: best.kind, text: best.text };
}

function compactSteps(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(n);
}

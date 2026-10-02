/**
 * Copy for onboarding's "Better together" preview.
 *
 * The step lets someone tick a habit and see it land on a partner card. It is a
 * preview — no partner exists yet, and nothing here is sent anywhere — so the
 * words must say what *will* happen once they pair, never claim it already did.
 */

/** The line under the stage, reacting to how many habits have been ticked. */
export function previewLine(ticked: number, total: number): string {
  if (ticked <= 0) return 'Tap a habit to see how it reaches them.';
  if (ticked >= total) return 'A perfect day — and they would see it live.';
  if (ticked === 1) return 'That is how it would reach their screen, within seconds.';
  if (ticked < Math.ceil(total / 2)) return 'Small things, done every day, add up for two.';
  return 'Past halfway. Streaks are built on days like this.';
}

/** The CTA copy: asks for a promise once they have felt the loop at least once. */
export function previewCta(ticked: number): string {
  return ticked > 0 ? 'Start our streak' : 'Try one first';
}

/**
 * How far text is allowed to grow when the athlete turns up system text size.
 *
 * Both platforms let a reader scale text far past the design size — iOS's
 * accessibility sizes reach ~3.1x, Android's "largest" ~2.0x. Nothing in this
 * app capped that, and nothing measured it: 210 styles declare a fixed pixel
 * `height`, so at large sizes a 60pt button kept its 60pt while the label
 * inside it grew, and the label was clipped by its own button. The athlete who
 * most needs bigger text is the one who can no longer read the CTA.
 *
 * The fix is two-sided, and needs both halves:
 *
 *   1. Containers stop declaring a fixed `height` and declare `minHeight`
 *      instead, so a control can grow with its label. That is what makes the
 *      text visible at all.
 *   2. Text declares a *cap*, so growth stops before a single word occupies
 *      the screen and pushes the primary action out of reach. That is what
 *      keeps the layout usable.
 *
 * A cap is not a refusal to scale. Every cap here is >= 1.3, so the smallest
 * allowance is still a third larger than the design size — the range that
 * carries nearly all real-world accessibility text settings. What it refuses
 * is the far tail, where a 30pt screen title at 3.1x (93pt) would leave room
 * for about four characters per line.
 *
 * Caps are graded by the job the text does, because the failure mode differs:
 *
 *   - Body copy can afford to grow the most. It reflows down the screen, and
 *     the screen scrolls, so the cost of growth is scrolling — which is fine.
 *   - Labels inside a fixed-shape control (a button, a chip, a tab) can afford
 *     the least. They grow *across* a shape whose width is set by the layout,
 *     so past a point they wrap, then clip, and no amount of scrolling helps.
 *   - Big numerals are already display-sized. A 26pt stat at 2x is 52pt and
 *     collides with its neighbour in a row of three; it is also the text least
 *     in need of magnification, being the largest thing on screen already.
 *
 * These are multipliers for React Native's `maxFontSizeMultiplier`, which caps
 * the *system* scale factor — it does not scale anything on its own. At the
 * default text size every value here is inert, so adopting this changes
 * nothing about how the app looks today.
 */

/** The role a piece of text plays, which decides how far it may grow. */
export type TextRole =
  /** Paragraphs, captions, supporting copy. Reflows freely; scrolls. */
  | 'body'
  /** Screen and section headings. Reflow, but consume vertical space fast. */
  | 'heading'
  /** A label inside a control whose shape the layout fixes. */
  | 'control'
  /** Large numerals — stats, scores, counters. Already display-sized. */
  | 'display';

/**
 * The cap per role.
 *
 * Ordered deliberately: body grows most, display least. If you are tempted to
 * lower one, lower it toward 1.3 and not below — under that the cap starts
 * denying the ordinary large-text settings this exists to serve.
 */
export const MAX_FONT_SCALE: Readonly<Record<TextRole, number>> = {
  body: 2,
  heading: 1.6,
  control: 1.4,
  display: 1.3,
} as const;

/** The floor every cap respects, so no role can refuse ordinary large text. */
export const MIN_ALLOWED_CAP = 1.3;

/**
 * The cap for a role, for handing to a `<Text maxFontSizeMultiplier>`.
 *
 * Exists so call sites name the *role* rather than a number. A literal at the
 * call site is how the 956 hardcoded spacing values happened: the number gets
 * copied to the next component, then tuned, and two controls that should match
 * no longer do.
 */
export function maxFontScale(role: TextRole): number {
  return MAX_FONT_SCALE[role];
}

/**
 * The height a control must reserve for its label at the athlete's text size.
 *
 * A control styled `minHeight: reservedControlHeight(60, fontScale)` keeps its
 * designed 60pt at normal text size and grows only when the label actually
 * needs the room — which is what stops the clipping without changing today's
 * layout.
 *
 * `fontScale` is the live system scale (`useWindowDimensions().fontScale`),
 * and is clamped by the same cap the label's text uses, so the box and the
 * text inside it stop growing together. Without the shared clamp the box would
 * keep growing after the text had stopped, leaving a tall control wrapped
 * around small text.
 */
export function reservedControlHeight(
  designHeight: number,
  fontScale: number,
  role: TextRole = 'control',
): number {
  if (!Number.isFinite(fontScale) || fontScale <= 1) return designHeight;
  const capped = Math.min(fontScale, MAX_FONT_SCALE[role]);
  return Math.round(designHeight * capped);
}

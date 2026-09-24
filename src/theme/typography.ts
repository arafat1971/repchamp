import { StyleSheet, type TextStyle } from 'react-native';

import { maxFontScale, type TextRole } from './fontScale';
import { palette } from './tokens';

/**
 * Plus Jakarta Sans is loaded as static weights rather than a variable font so the
 * same file names work on both platforms. Keys match `useFonts` in the root layout.
 */
export const fontFamily = {
  regular: 'PlusJakartaSans-Regular',
  medium: 'PlusJakartaSans-Medium',
  semibold: 'PlusJakartaSans-SemiBold',
  bold: 'PlusJakartaSans-Bold',
  extrabold: 'PlusJakartaSans-ExtraBold',
} as const;

export type FontWeightName = keyof typeof fontFamily;

/**
 * The prototype uses CSS shorthand like `font:800 30px 'Plus Jakarta Sans'`.
 * Those map onto the named text styles below — `h1` is the 800/30px heading,
 * `section` the 800/13px section label, and so on.
 */
export const text = StyleSheet.create({
  /** Screen title — `font:800 30px`, tight tracking. */
  h1: {
    fontFamily: fontFamily.extrabold,
    fontSize: 30,
    letterSpacing: -0.6,
    color: palette.ink,
  },
  h2: {
    fontFamily: fontFamily.extrabold,
    fontSize: 24,
    letterSpacing: -0.4,
    color: palette.ink,
  },
  h3: {
    fontFamily: fontFamily.extrabold,
    fontSize: 19,
    color: palette.ink,
  },
  /** Uppercase-ish section heading above a list — `font:800 13px`, +0.04em. */
  section: {
    fontFamily: fontFamily.extrabold,
    fontSize: 13,
    letterSpacing: 0.52,
    color: palette.ink,
  },
  /** Small all-caps eyebrow — `font:800 11px`, +0.06em, muted. */
  eyebrow: {
    fontFamily: fontFamily.extrabold,
    fontSize: 11,
    letterSpacing: 0.66,
    color: palette.grey600,
  },
  cardTitle: {
    fontFamily: fontFamily.extrabold,
    fontSize: 15,
    color: palette.ink,
  },
  cardTitleLarge: {
    fontFamily: fontFamily.extrabold,
    fontSize: 17,
    color: palette.ink,
  },
  /** Supporting copy under a title — `font:600 11-12px`, muted. */
  caption: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    color: palette.grey600,
  },
  captionMd: {
    fontFamily: fontFamily.semibold,
    fontSize: 12,
    color: palette.grey600,
  },
  body: {
    fontFamily: fontFamily.semibold,
    fontSize: 14,
    color: palette.grey600,
  },
  bodyLg: {
    fontFamily: fontFamily.semibold,
    fontSize: 15,
    color: palette.grey600,
  },
  /** Big numeric readouts (stat tiles, scores). */
  stat: {
    fontFamily: fontFamily.extrabold,
    fontSize: 26,
    color: palette.ink,
  },
  statSm: {
    fontFamily: fontFamily.extrabold,
    fontSize: 22,
    color: palette.ink,
  },
  /** Primary button label. */
  button: {
    fontFamily: fontFamily.extrabold,
    fontSize: 17,
    color: palette.white,
  },
  buttonSm: {
    fontFamily: fontFamily.extrabold,
    fontSize: 14,
    color: palette.white,
  },
  /** Pill/badge label — `font:800 11-12px`. */
  badge: {
    fontFamily: fontFamily.extrabold,
    fontSize: 12,
  },
  badgeSm: {
    fontFamily: fontFamily.extrabold,
    fontSize: 11,
  },
  /** Tab bar label — `font:800 10px`. */
  tab: {
    fontFamily: fontFamily.extrabold,
    fontSize: 10,
  },
  /** The 150px rep counter and countdown digits. */
  hero: {
    fontFamily: fontFamily.extrabold,
    fontSize: 150,
    lineHeight: 150 * 0.82,
    color: palette.white,
  },
});

/**
 * How far each named style may grow when the athlete turns up system text size.
 *
 * Spread onto a `<Text>` as props, not styles — `maxFontSizeMultiplier` is a
 * prop, and a cap in a StyleSheet is silently ignored:
 *
 *   <Text style={text.button} {...scaleFor('button')}>
 *
 * The mapping is by the job the text does, which `@/theme/fontScale` explains
 * in full: copy that reflows and scrolls may grow most, a label trapped inside
 * a fixed-width control least. At the default text size every cap is inert.
 */
const ROLE_OF: Readonly<Record<keyof typeof text, TextRole>> = {
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  section: 'heading',
  eyebrow: 'heading',
  cardTitle: 'heading',
  cardTitleLarge: 'heading',
  caption: 'body',
  captionMd: 'body',
  body: 'body',
  bodyLg: 'body',
  stat: 'display',
  statSm: 'display',
  button: 'control',
  buttonSm: 'control',
  badge: 'control',
  badgeSm: 'control',
  tab: 'control',
  // The 150pt rep counter. It is the largest thing on any screen and sits in a
  // camera view sized to the device, so it is the one readout that must not
  // grow at all — hence `display`, the tightest cap.
  hero: 'display',
} as const;

/** Scaling props for a named text style. Spread onto the `<Text>`. */
export function scaleFor(style: keyof typeof text): { maxFontSizeMultiplier: number } {
  return { maxFontSizeMultiplier: maxFontScale(ROLE_OF[style]) };
}

/** Scaling props for a role directly, for text built with `font()`. */
export function scaleForRole(role: TextRole): { maxFontSizeMultiplier: number } {
  return { maxFontSizeMultiplier: maxFontScale(role) };
}

/**
 * Escape hatch for one-off sizes that don't deserve a named style.
 * Prefer a named style from `text` where one fits.
 */
export function font(
  weight: FontWeightName,
  size: number,
  extra?: Omit<TextStyle, 'fontFamily' | 'fontSize'>,
): TextStyle {
  return { fontFamily: fontFamily[weight], fontSize: size, ...extra };
}

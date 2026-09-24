import { Text as RNText, type TextProps } from 'react-native';

import { maxFontScale, type TextRole } from '@/theme/fontScale';

/**
 * Text with a growth cap already applied.
 *
 * `theme/fontScale` describes a two-sided fix for large text settings:
 * containers declare `minHeight` so they can grow, and text declares a cap so
 * growth stops before one word owns the screen. The first half shipped —
 * `reservedControlHeight` is used in 55 places — and the second half did not.
 * `scaleFor` existed but was called exactly once, in `PrimaryButton`.
 *
 * The reason is structural rather than an oversight: `font()` is the helper
 * almost every screen uses, and it returns a bare `TextStyle`. A style object
 * cannot carry `maxFontSizeMultiplier`, which is a *prop*. So every call site
 * that reached for `font()` silently opted out of the cap, and there was no
 * single place to fix it.
 *
 * This is that place. Swapping `Text` for `AppText` at a call site applies the
 * cap without touching its styles, so adoption is mechanical and reversible.
 *
 * Defaults to the `body` role — the most permissive cap — because an
 * uncapped-by-accident piece of text should land on the setting that denies
 * the athlete least. Controls and display numerals name their stricter role
 * explicitly, since those are the shapes that actually clip.
 *
 * The prop is `scale`, not `role`: React Native's own `TextProps` already
 * defines `role` as the ARIA accessibility role, and shadowing it here would
 * quietly take a real accessibility API away from every call site.
 */
export function AppText({
  scale = 'body',
  ...props
}: TextProps & { scale?: TextRole }) {
  return <RNText maxFontSizeMultiplier={maxFontScale(scale)} {...props} />;
}

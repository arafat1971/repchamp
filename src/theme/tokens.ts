/**
 * Design tokens extracted from the RepChamp design prototype (`design/prototype.html`).
 *
 * These are the single source of truth for colour, radius, spacing and elevation.
 * Nothing in the app should hard-code a hex value — if a colour is missing here,
 * add it here first.
 */

export const palette = {
  // Brand green
  green50: '#eafaf0',
  green100: '#d5efdf',
  green200: '#bbf7d0',
  green300: '#86efac',
  green400: '#4ade80',
  green500: '#22C55E',
  green600: '#16A34A',
  green700: '#15803D',
  green900: '#065f46',
  greenMid: '#8ee0ab',

  // Squats / secondary
  purple100: '#f3e8ff',
  purple200: '#e9d5ff',
  purple300: '#ddd6fe',
  purple400: '#c4b5fd',
  purple500: '#a855f7',
  purple600: '#7c3aed',
  purple900: '#5b21b6',

  // Accent amber / orange
  amber50: '#2A1F08',
  amber100: '#3A2B0C',
  amber200: '#fcd34d',
  /** Muted warm text for the dark league surface. */
  amber100Text: '#D8B879',
  amber300: '#fbbf24',
  amber400: '#fde047',
  amber500: '#F59E0B',
  amber600: '#f97316',
  amber800: '#b45309',
  amber900: '#92400e',

  // Info blue
  blue50: '#e0f2fe',
  blue100: '#bfdbfe',
  blue150: '#eef2ff',
  blue300: '#93c5fd',
  blue400: '#60a5fa',
  blue500: '#0ea5e9',
  blue600: '#2563eb',
  blue700: '#0369a1',
  blue800: '#1e40af',
  blue900: '#1e3a8a',

  // Danger
  red100: '#fee2e2',
  red400: '#f472b6',
  red500: '#EF4444',
  red600: '#be123c',
  rose100: '#fecdd3',

  // Neutrals
  ink: '#ECF1ED',
  inkSoft: '#C7D0CA',
  slate400: '#93A0A6',
  slate500: '#A3AFB5',
  slate600: '#B3BEC3',
  slate700: '#C3CDD1',
  slate800: '#D3DBDE',
  slate900: '#E3E9EB',
  slate200: '#2A332D',

  grey400: '#8A948D',
  grey450: '#98A29B',
  grey500: '#A7B1AA',
  grey550: '#9AA49D',
  grey600: '#A2ACA5',
  border: '#252D28',
  borderStrong: '#333C36',
  divider: '#1E2521',
  dividerSoft: '#1A211D',
  track: '#222A26',
  canvas: '#0B0F0D',
  white: '#161B18',
  black: '#000000',

  /*
   * Tinted card surfaces for the dark canvas.
   *
   * The Quick Start / challenge tiles used literal pastels ('#f0fdf4',
   * '#dcfce7', '#faf5ff', '#f3e8ff'). Those are near-white, so on a dark canvas
   * they blew out and took their own dark labels with them. These keep the same
   * hue at a luminance that belongs on this background.
   */
  tintGreenTop: '#12241A',
  tintGreenBottom: '#173021',
  tintPurpleTop: '#1B1626',
  tintPurpleBottom: '#241C33',
  tintDangerBg: '#2A1618',

  // Camera / duel surfaces
  camGreenTop: '#1c2a22',
  camGreenMid: '#0e1512',
  camGreenBottom: '#070a08',
  camPurpleTop: '#241c30',
  camPurpleMid: '#120e18',
  camPurpleBottom: '#070509',
} as const;

export const semantic = {
  background: palette.canvas,
  surface: palette.white,
  surfaceMuted: palette.divider,
  text: palette.ink,
  textMuted: palette.grey600,
  textFaint: palette.grey450,
  chevron: palette.grey400,
  border: palette.border,
  divider: palette.divider,

  primary: palette.green500,
  primaryDark: palette.green600,
  primaryDarker: palette.green700,
  primarySoft: palette.green50,

  push: palette.green500,
  squat: palette.purple500,

  warning: palette.amber500,
  danger: palette.red500,
  info: palette.blue500,
} as const;

/** Multi-stop gradients used across hero cards. Each entry is `[from, to]`. */
export const gradients = {
  brand: [palette.green600, palette.green500] as const,
  brandStrong: [palette.green500, palette.green700] as const,
  brandDeep: [palette.green600, palette.green900] as const,
  squat: [palette.purple500, palette.purple600] as const,
  amber: [palette.amber500, palette.amber600] as const,
  info: [palette.blue500, palette.blue700] as const,
  loss: [palette.slate700, palette.slate900] as const,
  lossFlat: [palette.slate600, palette.slate800] as const,
  ink: [palette.ink, palette.inkSoft] as const,
  promotion: [palette.amber500, palette.amber800] as const,
  gold: [palette.amber200, palette.amber500] as const,
} as const;

/**
 * Corner radius.
 *
 * The scale used to step by 2 at the top (14/16/18/20/22/24/26/28). Nobody can
 * see a 2pt difference, so authors picked whichever key sounded right and cards
 * drifted apart between screens — the single biggest reason the app read as
 * inconsistent. There were also ~120 hardcoded radii sitting alongside the
 * tokens, in every value from 3 to 22.
 *
 * Steps are now visibly distinct. Keys are kept so nothing breaks; the
 * near-duplicates collapse onto the step they were closest to, which is what
 * makes two cards styled by different authors finally match.
 */
export const radius = {
  /** Inline chips, badges, small tags. */
  xs: 4,
  /** Inputs, small controls. */
  sm: 8,
  /** Default control radius. */
  md: 12,
  /** Standard card. */
  lg: 16,
  xl: 16,
  /** Large surface — hero, sheet, modal. */
  '2xl': 20,
  '3xl': 20,
  /** Extra-large hero surface. */
  '4xl': 24,
  '5xl': 24,
  '6xl': 28,
  '7xl': 28,
  pill: 999,
} as const;

/**
 * Spacing — a true 4pt grid.
 *
 * Both Apple and Google lay out on multiples of 4, and the eye reads a broken
 * grid as sloppiness long before it can name the cause. The previous scale
 * stepped 4/6/8/10/12/14 — half of it off-grid, with 2pt gaps nothing can
 * distinguish — so nobody adopted it (it had zero imports) and 1121 spacing
 * values were hardcoded instead, 565 of them off the grid entirely.
 *
 * The keys are unchanged so existing call sites keep compiling; the values
 * snap to the nearest grid step. Prefer the semantic aliases below.
 */
export const spacing = {
  '0': 0,
  '1': 4,
  '2': 8,
  '3': 8,
  '4': 12,
  '5': 12,
  '6': 16,
  '7': 16,
  '8': 20,
  '9': 20,
  '10': 24,
  '11': 24,
  '12': 28,
  '14': 32,
  '16': 40,
} as const;

/**
 * Named steps, which is what call sites should reach for.
 *
 * A number in a stylesheet says nothing about intent; `space.card` says the
 * next person should not "improve" it to 18. Sized so adjacent steps are
 * actually tellable apart — the old scale's 2pt increments were not.
 */
export const space = {
  /** Hairline gap — icon to its label. */
  xs: 4,
  /** Tight — chips, inline rows. */
  sm: 8,
  /** Default gap between related elements. */
  md: 12,
  /** Standard card padding and screen gutter. */
  card: 16,
  /** Between cards in a list. */
  lg: 20,
  /** Between sections on a screen. */
  xl: 24,
  /** Major break — above a section heading. */
  '2xl': 32,
  /** Hero / empty-state breathing room. */
  '3xl': 40,
} as const;

/**
 * Cross-platform elevation. iOS reads the shadow* keys, Android reads `elevation`;
 * both are supplied so a card looks the same on either platform.
 */
export const shadow = {
  card: {
    shadowColor: 'rgba(15,30,20,1)',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  raised: {
    shadowColor: 'rgba(15,30,20,1)',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  brand: {
    shadowColor: palette.green500,
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  squat: {
    shadowColor: palette.purple500,
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  amber: {
    shadowColor: palette.amber500,
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  info: {
    shadowColor: palette.blue500,
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  danger: {
    shadowColor: palette.red500,
    shadowOpacity: 0.6,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  overlay: {
    shadowColor: palette.black,
    shadowOpacity: 0.5,
    shadowRadius: 34,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
} as const;

/** Motion durations (ms) and easing shorthands shared by Reanimated animations. */
export const motion = {
  fast: 120,
  base: 240,
  slow: 360,
  screenIn: 420,
  xpFill: 900,
  /** cubic-bezier(.2,.7,.2,1) — the prototype's standard ease-out. */
  easeOut: [0.2, 0.7, 0.2, 1] as const,
  /** cubic-bezier(.2,.7,.3,1.3) — overshoot used by nav icons and press states. */
  overshoot: [0.2, 0.7, 0.3, 1.3] as const,
} as const;

export type Palette = typeof palette;
export type Gradient = readonly [string, string];

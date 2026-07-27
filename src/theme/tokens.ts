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
  amber50: '#fef3c7',
  amber100: '#fde68a',
  amber200: '#fcd34d',
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
  ink: '#0F1512',
  inkSoft: '#1f2a24',
  slate400: '#94a3b8',
  slate500: '#64748b',
  slate600: '#475569',
  slate700: '#334155',
  slate800: '#1e293b',
  slate900: '#0f172a',
  slate200: '#e2e8f0',

  grey400: '#c3ccc5',
  grey450: '#b0b8b1',
  grey500: '#9aa39d',
  grey550: '#94a29a',
  grey600: '#8a938c',
  border: '#e6eae4',
  borderStrong: '#d4dad4',
  divider: '#f0f2ef',
  dividerSoft: '#eef1ee',
  track: '#eaeee9',
  canvas: '#F6F7F5',
  white: '#ffffff',
  black: '#000000',

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

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 14,
  xl: 16,
  '2xl': 18,
  '3xl': 20,
  '4xl': 22,
  '5xl': 24,
  '6xl': 26,
  '7xl': 28,
  pill: 999,
} as const;

export const spacing = {
  '0': 0,
  '1': 4,
  '2': 6,
  '3': 8,
  '4': 10,
  '5': 12,
  '6': 14,
  '7': 16,
  '8': 18,
  '9': 20,
  '10': 22,
  '11': 24,
  '12': 26,
  '14': 32,
  '16': 40,
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

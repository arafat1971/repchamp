/** Types for `pandaArt.js` — the vector panda shared by the app and the widget plugin. */

export interface Part {
  /** SVG path data, in the 200 x 260 drawing box. */
  d: string;
  /** A colour, `'none'`, or `'grad:<name>'` from `GRADIENTS`. */
  fill?: string;
  stroke?: string;
  width?: number;
  opacity?: number;
  /** Centre and radius (designer coordinates) for a shape-relative gradient. */
  box?: readonly [number, number, number];
}

export interface Gradient {
  type: 'radial' | 'linear';
  cx?: number;
  cy?: number;
  r?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  /** [offset, colour, opacity?] */
  stops: readonly (readonly [number, string, number?])[];
  /** Radial, placed on each shape's `box`. */
  relative?: boolean;
  /** With `relative`: centred on the box rather than lit from the upper left. */
  centred?: boolean;
}

export interface Eye {
  cx: number;
  cy: number;
  r: number;
  patch: readonly [number, number, number];
}

export interface Pose {
  cx: number;
  cy: number;
  angle: number;
}

export type Outfit = 'classic' | 'hoodie';
export type Look = 'open' | 'love' | 'sparkle';
export type LidKind = 'shut' | 'happy' | 'thirsty' | 'sleepy';
export type MouthKind = 'smile' | 'sip' | 'gulp' | 'thirsty' | 'o' | 'sleepy' | 'blep';

export const W: number;
export const H: number;
export const DY: number;
export const REST: Pose;
export const SIP: Pose;
export const GLASS: { x0: number; x1: number; top: number; bottom: number; r: number };
export const EYES: readonly Eye[];
export const GRADIENTS: Record<string, Gradient>;
export const COLORS: Record<string, string>;
export const EYE_LOOK: Record<Outfit, Look>;
export function gradientCircle(g: Gradient, box: readonly [number, number, number]): [number, number, number];
export function lerpPose(a: Pose, b: Pose, t: number): Pose;
export function backParts(outfit?: Outfit, opts?: { feet?: boolean }): Part[];
export function footParts(side: 0 | 1): Part[];
export const HIPS: readonly (readonly [number, number])[];
export function noseParts(): Part[];
export const NOSE: readonly [number, number];
export function blushParts(): Part[];
export function headParts(outfit?: Outfit, opts?: { ears?: boolean; nose?: boolean }): Part[];
export function earParts(side: 0 | 1): Part[];
export const EARS: readonly (readonly [number, number])[];
export function mouthParts(kind?: MouthKind): Part[];
export function eyeWhiteParts(eye: Eye): Part[];
export function irisParts(eye: Eye, look?: Look): Part[];
export function eyeParts(eye: Eye, look?: Look): Part[];
export function lidParts(eye: Eye, kind?: LidKind): Part[];
export function closedEyeParts(eye: Eye): Part[];
export function bottleBackParts(pose?: Pose): Part[];
export function bottleFrontParts(pose?: Pose): Part[];
export function armParts(outfit?: Outfit, pose?: Pose): Part[];
export function doodleParts(outfit?: Outfit): Part[];
export function sweatParts(): Part[];
export function waterPath(level: number, pose?: Pose, phase?: number, amp?: number, tilt?: number): string;
export function bottleAxis(t: number): [number, number];
export type FurKind = 'tuft' | 'curl';
export function crownFur(sway?: number, lift?: number, t?: number, kind?: FurKind): string;
export const FUR_KIND: Record<Outfit, FurKind>;

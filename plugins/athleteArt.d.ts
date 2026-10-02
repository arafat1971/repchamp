/** Types for `athleteArt.js` — the Reps widget's push-up athlete. */

export interface AthletePart {
  d: string;
  fill?: string;
  stroke?: string;
  width?: number;
  opacity?: number;
  /** A linear gradient in box coordinates. */
  gradient?: { x1: number; y1: number; x2: number; y2: number; stops: readonly (readonly [number, string])[] };
}

export const W: number;
export const H: number;
export function figure(sex?: 'male' | 'female', k?: number): AthletePart[];

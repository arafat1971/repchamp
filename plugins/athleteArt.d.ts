/** Types for `athleteArt.js` — the Reps widget's squatting athlete. */

export interface AthletePart {
  d: string;
  fill?: string;
  stroke?: string;
  width?: number;
  opacity?: number;
  box?: readonly [number, number, number];
}

export interface AthleteGradient {
  type: 'radial';
  cx?: number;
  cy?: number;
  r?: number;
  stops: readonly (readonly [number, string, number?])[];
  relative?: boolean;
}

export const W: number;
export const H: number;
export const GRADIENTS: Record<string, AthleteGradient>;
export function figure(sex?: 'male' | 'female', k?: number): AthletePart[];

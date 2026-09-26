import Svg, { Circle, Line } from 'react-native-svg';

import type { Figure } from '@/vision/yoga';

const BONES: readonly (readonly [keyof Figure, keyof Figure])[] = [
  ['ls', 'rs'],
  ['ls', 'le'],
  ['le', 'lw'],
  ['rs', 're'],
  ['re', 'rw'],
  ['ls', 'lh'],
  ['rs', 'rh'],
  ['lh', 'rh'],
  ['lh', 'lk'],
  ['lk', 'la'],
  ['rh', 'rk'],
  ['rk', 'ra'],
];

/** The shape to make: a reference stick figure for a yoga pose. */
export function PoseFigure({ figure, size, color, strokeWidth = 5 }: { figure: Figure; size: number; color: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="-6 -6 112 112">
      {BONES.map(([a, b]) => (
        <Line
          key={`${a}-${b}`}
          x1={figure[a][0]}
          y1={figure[a][1]}
          x2={figure[b][0]}
          y2={figure[b][1]}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      ))}
      <Circle cx={figure.head[0]} cy={figure.head[1]} r={6.5} fill={color} />
    </Svg>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import * as Athlete from '../../../plugins/athleteArt';

/** The push-up the widget plays, as depth per frame. */
const FRAMES = [0, 0, 0, 0.25, 0.55, 0.85, 1, 1, 0.85, 0.55, 0.25];

/**
 * The Reps widget's athlete, drawn in the app from the same art the widget
 * uses, doing push-ups on a loop (still under reduced motion).
 */
export function AthletePreview({ sex, size }: { sex: 'male' | 'female'; size: number }) {
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setI((n) => (n + 1) % FRAMES.length), 110);
    return () => clearInterval(id);
  }, [reduced]);
  const k = reduced ? 0 : (FRAMES[i] ?? 0);
  const parts = useMemo(() => Athlete.figure(sex, k), [sex, k]);
  const height = (size * Athlete.H) / Athlete.W;

  const defs: React.ReactNode[] = [];
  const paths = parts.map((p, n) => {
    let fill = p.fill ?? 'none';
    if (p.gradient) {
      const id = `ath-${sex}-${n}`;
      const g = p.gradient;
      defs.push(
        <LinearGradient key={id} id={id} gradientUnits="userSpaceOnUse" x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}>
          {g.stops.map(([o, c]) => (
            <Stop key={o} offset={o} stopColor={c} />
          ))}
        </LinearGradient>,
      );
      fill = `url(#${id})`;
    }
    return (
      <Path
        key={n}
        d={p.d}
        fill={fill}
        stroke={p.stroke}
        strokeWidth={p.width}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={p.opacity}
      />
    );
  });
  return (
    <Svg width={size} height={height} viewBox={`0 0 ${Athlete.W} ${Athlete.H}`}>
      <Defs>{defs}</Defs>
      {paths}
    </Svg>
  );
}

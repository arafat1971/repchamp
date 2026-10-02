import { useEffect, useMemo, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';
import Svg, { Defs, Path, RadialGradient, Stop } from 'react-native-svg';

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

  let gid = 0;
  const defs: React.ReactNode[] = [];
  const fillOf = (fill: string | undefined, box?: readonly [number, number, number]) => {
    if (!fill) return 'none';
    if (!fill.startsWith('grad:')) return fill;
    const g = Athlete.GRADIENTS[fill.slice(5)];
    if (!g) return 'none';
    const id = `ath-${sex}-${gid++}`;
    const [cx, cy, r] = g.relative && box ? [box[0] - box[2] * 0.3, box[1] - box[2] * 0.35, box[2] * 1.35] : [g.cx, g.cy, g.r];
    defs.push(
      <RadialGradient key={id} id={id} gradientUnits="userSpaceOnUse" cx={cx} cy={cy} r={r}>
        {g.stops.map(([o, c, a]) => (
          <Stop key={o} offset={o} stopColor={c} stopOpacity={a ?? 1} />
        ))}
      </RadialGradient>,
    );
    return `url(#${id})`;
  };
  const paths = parts.map((p, n) => (
    <Path
      key={n}
      d={p.d}
      fill={fillOf(p.fill, p.box)}
      stroke={p.stroke}
      strokeWidth={p.width}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={p.opacity}
    />
  ));
  return (
    <Svg width={size} height={height} viewBox={`0 0 ${Athlete.W} ${Athlete.H}`}>
      <Defs>{defs}</Defs>
      {paths}
    </Svg>
  );
}

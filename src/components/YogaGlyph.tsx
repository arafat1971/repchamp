import Svg, { Circle, Line, Path } from 'react-native-svg';

import type { PoseId } from '@/domain/mindful';

/**
 * A line-drawn figure for each yoga pose, in `ExerciseGlyph`'s joint-and-bone
 * idiom so a flow card and an exercise tile read as the same family. Each is
 * drawn at the pose's held shape — the thing the athlete is being asked to
 * find — on a 48-unit square with the floor at y = 40.
 */
export function YogaGlyph({ pose, size = 34, color }: { pose: PoseId; size?: number; color: string }) {
  const common = {
    stroke: color,
    strokeWidth: 2.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  };
  const floor = <Line x1={4} y1={40} x2={44} y2={40} {...common} strokeWidth={2} opacity={0.3} />;
  const head = (cx: number, cy: number) => <Circle cx={cx} cy={cy} r={3.6} fill={color} />;

  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      {pose === 'mountain' ? (
        <>
          {head(24, 9)}
          <Path d="M24 13 L24 27" {...common} />
          <Path d="M24 27 L21 40 M24 27 L27 40" {...common} />
          <Path d="M24 16 L19 27 M24 16 L29 27" {...common} />
        </>
      ) : pose === 'forward-fold' ? (
        <>
          {head(18, 35)}
          <Path d="M26 40 L26 22" {...common} />
          <Path d="M26 22 L20 31" {...common} />
          <Path d="M21 30 L22 40" {...common} />
          {floor}
        </>
      ) : pose === 'cat-cow' ? (
        <>
          {head(10, 28)}
          <Path d="M14 25 Q24 16 34 25" {...common} />
          <Path d="M14 25 L14 40 M34 25 L34 40 L42 40" {...common} />
          {floor}
        </>
      ) : pose === 'down-dog' ? (
        <>
          {head(16, 34)}
          <Path d="M9 40 L26 13 L39 40" {...common} />
          {floor}
        </>
      ) : pose === 'low-lunge' ? (
        <>
          {head(22, 12)}
          <Path d="M22 17 L22 30" {...common} />
          <Path d="M22 30 L33 30 L35 40" {...common} />
          <Path d="M22 30 L12 40 L4 40" {...common} />
          <Path d="M22 19 L17 7 M22 19 L27 7" {...common} />
          {floor}
        </>
      ) : pose === 'cobra' ? (
        <>
          {head(11, 23)}
          <Path d="M44 40 L25 40 L14 27" {...common} />
          <Path d="M16 29 L17 40" {...common} />
          {floor}
        </>
      ) : pose === 'child' ? (
        <>
          {head(17, 36)}
          <Path d="M28 40 L41 40" {...common} />
          <Path d="M40 35 Q31 26 21 35" {...common} />
          <Path d="M21 38 L6 39" {...common} />
          {floor}
        </>
      ) : pose === 'warrior-2' ? (
        <>
          {head(22, 10)}
          <Path d="M22 14 L22 27" {...common} />
          <Path d="M22 27 L8 40" {...common} />
          <Path d="M22 27 L33 28 L35 40" {...common} />
          <Path d="M8 18 L38 18" {...common} />
          {floor}
        </>
      ) : pose === 'tree' ? (
        <>
          {head(24, 11)}
          <Path d="M24 15 L24 27 L24 40" {...common} />
          <Path d="M24 27 L32 31 L25 34" {...common} />
          <Path d="M24 18 L17 6 M24 18 L31 6" {...common} />
        </>
      ) : pose === 'chair' ? (
        <>
          {head(26, 10)}
          <Path d="M24 40 L30 30 L18 27" {...common} />
          <Path d="M18 27 L24 14" {...common} />
          <Path d="M23 17 L31 5" {...common} />
          {floor}
        </>
      ) : pose === 'seated-twist' ? (
        <>
          {head(18, 17)}
          <Path d="M18 21 L18 38 L42 38" {...common} />
          <Path d="M18 38 L28 29 L31 38" {...common} />
          <Path d="M18 25 L28 29 M18 25 L10 36" {...common} />
          {floor}
        </>
      ) : pose === 'seated-fold' ? (
        <>
          {head(34, 29)}
          <Path d="M14 38 L42 38" {...common} />
          <Path d="M14 38 L30 31" {...common} />
          <Path d="M28 32 L40 36" {...common} />
          {floor}
        </>
      ) : pose === 'bridge' ? (
        <>
          {head(9, 34)}
          <Path d="M13 35 L26 25" {...common} />
          <Path d="M26 25 L34 28 L37 38" {...common} />
          <Path d="M13 37 L21 39" {...common} />
          {floor}
        </>
      ) : (
        <>
          {/* Savasana: flat on the back, arms a little away from the body. */}
          {head(9, 35)}
          <Path d="M13 36 L43 37" {...common} />
          <Path d="M17 36 L25 39" {...common} />
          {floor}
        </>
      )}
    </Svg>
  );
}

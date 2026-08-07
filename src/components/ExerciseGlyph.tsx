import Svg, { Circle, Line, Path } from 'react-native-svg';

/**
 * A line-drawn figure for each duel exercise.
 *
 * The picker previously showed `ic-pushup.png` and `ic-squat.png` for two
 * exercises and an emoji for the other four, so half the grid was artwork and
 * half was 🧘 ⭐ 🏃 🔥 — a meditation pose for sit-ups, an abstract star for
 * jumping jacks, a runner for lunges and a flame for high knees. Only the flame
 * was describing anything, and it described effort rather than movement.
 *
 * Emoji cannot be made consistent here: they render as the platform's own
 * full-colour cartoons, at a weight and style nothing else in the app shares.
 * These are drawn instead, in the joint-and-bone idiom the result card's pose
 * skeleton already uses, and they take `color` so each tile keeps the accent it
 * has today.
 *
 * Each figure is posed at the *bottom* of its rep — the position the counter is
 * actually looking for — so the icon doubles as a hint about the movement.
 */
export function ExerciseGlyph({
  exercise,
  size = 34,
  color,
}: {
  exercise: string;
  size?: number;
  color: string;
}) {
  const stroke = color;
  const sw = 2.4;
  const common = {
    stroke,
    strokeWidth: sw,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      {exercise === 'situp' ? (
        <>
          {/* Torso risen off the floor, knees tented — the top of a sit-up. */}
          <Circle cx={14} cy={22} r={3.6} fill={stroke} />
          <Path d="M17 24 L26 32" {...common} />
          <Path d="M26 32 L33 22 L40 33" {...common} />
          <Path d="M17 25 L25 30" {...common} />
          <Line x1={8} y1={34} x2={42} y2={34} {...common} strokeWidth={2} opacity={0.4} />
        </>
      ) : exercise === 'jumping-jack' ? (
        <>
          {/* Star position: arms up and out, legs apart. */}
          <Circle cx={24} cy={11} r={4} fill={stroke} />
          <Path d="M24 15 L24 28" {...common} />
          <Path d="M24 18 L14 10" {...common} />
          <Path d="M24 18 L34 10" {...common} />
          <Path d="M24 28 L16 40" {...common} />
          <Path d="M24 28 L32 40" {...common} />
        </>
      ) : exercise === 'lunge' ? (
        <>
          {/* A wide split: front foot forward, back knee dropped toward the
              floor. Drawn deliberately asymmetric so it cannot be mistaken for
              the squat, which an earlier pass of these very nearly was. */}
          <Circle cx={26} cy={11} r={3.6} fill={stroke} />
          <Path d="M26 15 L26 26" {...common} />
          <Path d="M26 26 L38 30 L38 40" {...common} />
          <Path d="M26 26 L14 34 L9 40" {...common} />
          <Line x1={6} y1={40} x2={42} y2={40} {...common} strokeWidth={2} opacity={0.35} />
        </>
      ) : exercise === 'high-knees' ? (
        <>
          {/* One thigh horizontal at hip height, arms pumping. */}
          <Circle cx={22} cy={10} r={3.6} fill={stroke} />
          <Path d="M22 14 L22 26" {...common} />
          <Path d="M22 26 L34 26 L34 35" {...common} />
          <Path d="M22 26 L21 40" {...common} />
          <Path d="M22 18 L14 22" {...common} />
          <Path d="M22 18 L30 13" {...common} />
        </>
      ) : exercise === 'squat' ? (
        <>
          {/* Symmetric and low: hips dropped, arms straight out for balance. */}
          <Circle cx={24} cy={12} r={3.6} fill={stroke} />
          <Path d="M24 16 L24 27" {...common} />
          <Path d="M24 27 L16 29 L16 40" {...common} />
          <Path d="M24 27 L32 29 L32 40" {...common} />
          <Path d="M24 19 L36 19" {...common} />
          <Line x1={10} y1={40} x2={38} y2={40} {...common} strokeWidth={2} opacity={0.35} />
        </>
      ) : (
        <>
          {/* Push-up: body in a plank, elbow bent at the bottom of the rep. */}
          <Circle cx={13} cy={20} r={4} fill={stroke} />
          <Path d="M17 22 L34 27" {...common} />
          <Path d="M34 27 L40 38" {...common} />
          <Path d="M17 23 L16 31 L20 38" {...common} />
          <Line x1={8} y1={40} x2={42} y2={40} {...common} strokeWidth={2} opacity={0.45} />
        </>
      )}
    </Svg>
  );
}

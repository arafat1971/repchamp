import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { PHANTOM_USERS } from '@/domain/phantomRoster';

/**
 * Drawn avatars for the app's AI characters — the training partners and the
 * form coach.
 *
 * Each one is a small piece of inspirational art rather than a face: a sunrise,
 * a winding path, a night star, a laurel and shield, a torch, a summit, a
 * compass. The picture says what the character stands for — start, steady,
 * reach, strength, fire, peak, direction — so the avatar means something at a
 * glance and looks like one polished set.
 *
 * Deliberately symbols, never people or robots: app-owned art cannot be
 * mistaken for a real athlete's photo, so the AI badge elsewhere in the UI
 * stays truthful.
 *
 * The art is a 100 x 100 square drawn full-bleed; the caller's `Avatar` frame
 * clips it to a circle or a rounded square.
 */

export type AiPersona =
  | 'ai_spark'
  | 'ai_pulse'
  | 'ai_nova'
  | 'ai_titan'
  | 'ai_blaze'
  | 'ai_apex'
  | 'ai_adrian'
  | 'ai_zheng'
  | 'ai_mia'
  | 'coach';

const PERSONAS: ReadonlySet<string> = new Set<AiPersona>([
  'ai_spark',
  'ai_pulse',
  'ai_nova',
  'ai_titan',
  'ai_blaze',
  'ai_apex',
  'ai_adrian',
  'ai_zheng',
  'ai_mia',
  'coach',
]);

/** The three built-in rivals, by their opponent id. */
const RIVAL_PERSONA: Record<string, AiPersona> = { adrian: 'ai_adrian', zheng: 'ai_zheng', mia: 'ai_mia' };

/** The persona for a partner id — a roster `ai_*` id or a built-in rival's id. */
export function aiPersonaForId(id: string | undefined): AiPersona | null {
  if (!id) return null;
  if (RIVAL_PERSONA[id]) return RIVAL_PERSONA[id];
  return PERSONAS.has(id) ? (id as AiPersona) : null;
}

/** The persona behind a roster emoji, or null when it is not one of ours. */
export function aiPersonaForEmoji(emoji: string | undefined): AiPersona | null {
  if (!emoji) return null;
  const hit = PHANTOM_USERS.find((u) => u.emoji === emoji);
  return hit && PERSONAS.has(hit.id) ? (hit.id as AiPersona) : null;
}

function Sky({ top, bottom }: { top: string; bottom: string }) {
  return (
    <>
      <Defs>
        <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={top} />
          <Stop offset="1" stopColor={bottom} />
        </LinearGradient>
        <LinearGradient id="sun" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FEF08A" />
          <Stop offset="1" stopColor="#FB923C" />
        </LinearGradient>
        <LinearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FDE68A" />
          <Stop offset="1" stopColor="#D97706" />
        </LinearGradient>
        <LinearGradient id="shield" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#A7F3D0" />
        </LinearGradient>
      </Defs>
      <Rect width={100} height={100} fill="url(#sky)" />
    </>
  );
}

/** Spark — a sunrise: every day starts here. */
function Sunrise() {
  const rays = Array.from({ length: 11 }, (_, i) => {
    const a = Math.PI + (Math.PI * (i + 0.5)) / 11;
    const [x1, y1] = [50 + Math.cos(a) * 27, 66 + Math.sin(a) * 27];
    const [x2, y2] = [50 + Math.cos(a) * (i % 2 ? 36 : 42), 66 + Math.sin(a) * (i % 2 ? 36 : 42)];
    return <Path key={i} d={`M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}`} stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" opacity={0.65} />;
  });
  return (
    <>
      <Sky top="#FB923C" bottom="#FEF3C7" />
      {rays}
      <Circle cx={50} cy={66} r={22} fill="url(#sun)" />
      <Path d="M0 70 Q28 60 56 68 T100 64 V100 H0 Z" fill="#C2410C" />
      <Path d="M0 82 Q40 72 100 84 V100 H0 Z" fill="#7C2D12" />
    </>
  );
}

/** Pulse — a steady path winding up the hills. */
function Path_() {
  return (
    <>
      <Sky top="#93C5FD" bottom="#E0F2FE" />
      <Circle cx={72} cy={26} r={9} fill="#FFFFFF" opacity={0.9} />
      <Path d="M0 62 Q25 46 50 58 T100 52 V100 H0 Z" fill="#93C5FD" />
      <Path d="M0 72 Q30 56 62 68 T100 64 V100 H0 Z" fill="#3B82F6" />
      <Path d="M0 84 Q40 70 100 80 V100 H0 Z" fill="#1E40AF" />
      <Path d="M34 100 C48 92 30 84 48 76 C56 72 50 69 55 65 L58.5 65 C55 69 61 72 54 77 C38 85 60 92 68 100 Z" fill="#E0F2FE" opacity={0.95} />
    </>
  );
}

/** Nova — a bright star in a night sky: reach. */
function NightStar() {
  const dots: [number, number, number][] = [
    [18, 22, 1.4],
    [82, 18, 1.2],
    [28, 48, 1],
    [76, 50, 1.5],
    [12, 62, 1],
    [90, 36, 1],
    [64, 14, 1.1],
    [40, 12, 0.9],
  ];
  return (
    <>
      <Sky top="#1E1B4B" bottom="#7C3AED" />
      {dots.map(([x, y, r], i) => (
        <Circle key={i} cx={x} cy={y} r={r} fill="#FFFFFF" opacity={0.85} />
      ))}
      <Path d="M18 22 L28 48 L50 40 L76 50 L90 36" fill="none" stroke="#C4B5FD" strokeWidth={0.8} opacity={0.55} />
      <Circle cx={50} cy={40} r={26} fill="#F0ABFC" opacity={0.18} />
      <Circle cx={50} cy={40} r={16} fill="#F0ABFC" opacity={0.22} />
      <Path d="M50 14 L54.4 35.6 L76 40 L54.4 44.4 L50 66 L45.6 44.4 L24 40 L45.6 35.6 Z" fill="#FFFFFF" />
      <Path d="M50 22 L52.4 37.6 L68 40 L52.4 42.4 L50 58 L47.6 42.4 L32 40 L47.6 37.6 Z" fill="#FDE68A" />
      <Path d="M0 86 Q30 76 60 84 T100 80 V100 H0 Z" fill="#1E1B4B" />
    </>
  );
}

/** Titan — a laurel around a shield: strength, earned. */
function Laurel() {
  const leaf = (side: 1 | -1, i: number) => {
    const t = i / 7;
    const a = ((105 + t * 120) * Math.PI) / 180;
    const x = 50 + side * Math.cos(a) * 31;
    const y = 52 + Math.sin(a) * 31;
    const rot = (a * 180) / Math.PI + (side === 1 ? 0 : 180) + 90;
    return (
      <Ellipse
        key={`${side}${i}`}
        cx={x}
        cy={y}
        rx={3.4}
        ry={7.2}
        fill={i % 2 ? '#A7F3D0' : '#D1FAE5'}
        transform={`rotate(${side === 1 ? rot : -rot + 180} ${x} ${y})`}
      />
    );
  };
  return (
    <>
      <Sky top="#10B981" bottom="#064E3B" />
      <Circle cx={50} cy={50} r={40} fill="#FFFFFF" opacity={0.08} />
      {Array.from({ length: 8 }, (_, i) => leaf(1, i))}
      {Array.from({ length: 8 }, (_, i) => leaf(-1, i))}
      <Path d="M50 30 L68 36 V52 Q68 68 50 76 Q32 68 32 52 V36 Z" fill="url(#shield)" />
      <Path d="M50 30 L68 36 V52 Q68 68 50 76 Z" fill="#6EE7B7" opacity={0.45} />
      <Path d="M38 54 L50 42 L62 54" fill="none" stroke="#059669" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M41 62 L50 53 L59 62" fill="none" stroke="#10B981" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
}

/** Blaze — a torch: carry the fire. */
function Torch() {
  return (
    <>
      <Sky top="#4C0519" bottom="#F43F5E" />
      <Circle cx={50} cy={42} r={34} fill="#FDBA74" opacity={0.28} />
      <Circle cx={50} cy={42} r={22} fill="#FDE047" opacity={0.2} />
      <Path d="M50 8 C60 22 70 30 66 44 C64 52 56 58 50 58 C44 58 36 52 34 44 C30 32 44 24 50 8 Z" fill="#FB923C" />
      <Path d="M50 20 C57 30 62 36 59 46 C57 52 54 55 50 55 C46 55 43 52 41 46 C39 38 46 32 50 20 Z" fill="#FDE047" />
      <Path d="M50 34 C53 40 55 44 53.5 49 C52.5 52 51.5 53 50 53 C48.5 53 47.5 52 46.5 49 C45 44 48 40 50 34 Z" fill="#FFFFFF" />
      <Path d="M36 58 H64 L60 70 H40 Z" fill="url(#gold)" />
      <Path d="M36 58 H64" stroke="#FEF3C7" strokeWidth={1.6} strokeLinecap="round" />
      <Path d="M43 70 H57 L54 100 H46 Z" fill="#92400E" />
      <Path d="M43 70 H50 L48 100 H46 Z" fill="#B45309" opacity={0.6} />
      <Circle cx={28} cy={28} r={1.6} fill="#FDE047" />
      <Circle cx={74} cy={20} r={1.3} fill="#FDBA74" />
      <Circle cx={70} cy={50} r={1.2} fill="#FDE047" />
      <Circle cx={22} cy={50} r={1.1} fill="#FDBA74" />
    </>
  );
}

/** Apex — a summit with a flag: the top. */
function Summit() {
  return (
    <>
      <Sky top="#0C4A6E" bottom="#38BDF8" />
      <Circle cx={74} cy={28} r={16} fill="#FDE68A" opacity={0.3} />
      <Circle cx={74} cy={28} r={8.5} fill="#FDE68A" />
      <Path d="M0 100 L30 56 L52 80 L76 52 L100 84 V100 Z" fill="#1E3A8A" opacity={0.75} />
      <Path d="M6 100 L46 30 L58 50 L66 42 L100 100 Z" fill="#0F2A5C" />
      <Path d="M46 30 L36 47 L42 45 L47 50 L52 45 L58 47 L56 44 Z" fill="#FFFFFF" />
      <Path d="M46 30 L56 44 L58 47 L52 45 Z" fill="#BAE6FD" />
      <Path d="M46 30 V15" stroke="#FEF3C7" strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M46.9 15 L58 18.8 L46.9 22.6 Z" fill="#FACC15" />
      <Path d="M0 92 Q35 84 100 92 V100 H0 Z" fill="#082F49" />
    </>
  );
}

/** Adrian — a rolling wave under a moon: rhythm, flow. */
function Wave() {
  return (
    <>
      <Sky top="#1E1B4B" bottom="#4F46E5" />
      <Circle cx={72} cy={26} r={11} fill="#E0E7FF" />
      <Circle cx={77} cy={22} r={10} fill="#3730A3" />
      <Circle cx={22} cy={20} r={1.3} fill="#FFFFFF" opacity={0.8} />
      <Circle cx={40} cy={12} r={1} fill="#FFFFFF" opacity={0.7} />
      <Circle cx={90} cy={50} r={1.2} fill="#FFFFFF" opacity={0.6} />
      <Path d="M0 64 Q25 52 50 62 T100 58 V100 H0 Z" fill="#6366F1" />
      <Path d="M0 82 C14 58 38 42 62 46 C80 49 90 62 82 76 C78 68 70 63 61 66 C50 70 54 82 68 86 L100 90 V100 H0 Z" fill="#C7D2FE" />
      <Path d="M0 88 C22 72 44 70 62 80 C76 88 88 86 100 80 V100 H0 Z" fill="#4338CA" />
      <Circle cx={66} cy={50} r={1.8} fill="#FFFFFF" opacity={0.9} />
      <Circle cx={58} cy={47} r={1.2} fill="#FFFFFF" opacity={0.8} />
    </>
  );
}

/** Zheng — wings in an open sky: lift. */
function Wings() {
  const wing = (
    <>
      <Path d="M50 70 C36 62 16 60 4 66 C18 66 34 70 50 74 Z" fill="#E0F2FE" opacity={0.7} />
      <Path d="M50 66 C36 56 18 52 6 56 C20 58 34 63 50 70 Z" fill="#F0F9FF" opacity={0.85} />
      <Path d="M50 62 C38 50 22 44 10 46 C24 50 36 57 50 66 Z" fill="#FFFFFF" />
    </>
  );
  return (
    <>
      <Sky top="#0369A1" bottom="#BAE6FD" />
      <Circle cx={50} cy={46} r={26} fill="#FFFFFF" opacity={0.16} />
      <Circle cx={50} cy={46} r={26} fill="none" stroke="#FFFFFF" strokeWidth={1.4} opacity={0.5} />
      <Circle cx={50} cy={46} r={9} fill="#FDE68A" />
      <G transform="rotate(16 50 72)">{wing}</G>
      <G transform="translate(100 0) scale(-1 1)">
        <G transform="rotate(16 50 72)">{wing}</G>
      </G>
      <Path d="M44 74 Q50 82 56 74 L53 66 H47 Z" fill="#FFFFFF" />
      <Path d="M0 90 Q40 80 100 92 V100 H0 Z" fill="#0EA5E9" opacity={0.5} />
    </>
  );
}

/** Mia — a bolt through the storm: speed, power. */
function Bolt() {
  return (
    <>
      <Sky top="#111827" bottom="#B45309" />
      <Circle cx={50} cy={50} r={34} fill="#FBBF24" opacity={0.18} />
      <Circle cx={50} cy={50} r={24} fill="#FBBF24" opacity={0.2} />
      <Circle cx={50} cy={50} r={36} fill="none" stroke="#FDE68A" strokeWidth={1.4} opacity={0.5} />
      <Path d="M60 10 L30 54 H47 L38 90 L74 42 H54 Z" fill="url(#gold)" />
      <Path d="M60 10 L30 54 H37 L58 22 Z" fill="#FFFBEB" opacity={0.5} />
      <Circle cx={20} cy={30} r={1.4} fill="#FDE68A" opacity={0.8} />
      <Circle cx={82} cy={24} r={1.2} fill="#FDE68A" opacity={0.7} />
      <Circle cx={86} cy={70} r={1.4} fill="#FDE68A" opacity={0.7} />
      <Circle cx={14} cy={72} r={1.1} fill="#FDE68A" opacity={0.6} />
    </>
  );
}

/** The form coach — a compass: direction. */
function Compass() {
  const ticks = [0, 90, 180, 270].map((deg) => {
    const a = (deg * Math.PI) / 180;
    return (
      <Path
        key={deg}
        d={`M${(50 + Math.sin(a) * 34).toFixed(1)} ${(50 - Math.cos(a) * 34).toFixed(1)} L${(50 + Math.sin(a) * 40).toFixed(1)} ${(50 - Math.cos(a) * 40).toFixed(1)}`}
        stroke="#FFFFFF"
        strokeWidth={3}
        strokeLinecap="round"
      />
    );
  });
  return (
    <>
      <Sky top="#34D399" bottom="#065F46" />
      <Circle cx={50} cy={50} r={32} fill="#FFFFFF" opacity={0.14} />
      <Circle cx={50} cy={50} r={32} fill="none" stroke="#FFFFFF" strokeWidth={2.6} opacity={0.9} />
      {ticks}
      <G transform="rotate(35 50 50)">
        <Path d="M50 20 L58 50 L50 46 L42 50 Z" fill="#FFFFFF" />
        <Path d="M50 80 L58 50 L50 54 L42 50 Z" fill="#6EE7B7" opacity={0.8} />
      </G>
      <Circle cx={50} cy={50} r={4} fill="#065F46" />
      <Circle cx={50} cy={50} r={1.8} fill="#FFFFFF" />
    </>
  );
}

const SCENES: Record<AiPersona, () => React.JSX.Element> = {
  ai_spark: Sunrise,
  ai_pulse: Path_,
  ai_nova: NightStar,
  ai_titan: Laurel,
  ai_blaze: Torch,
  ai_apex: Summit,
  ai_adrian: Wave,
  ai_zheng: Wings,
  ai_mia: Bolt,
  coach: Compass,
};

export function AiAvatar({ persona, size }: { persona: AiPersona; size: number }) {
  const Scene = SCENES[persona];
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Scene />
      <Circle cx={50} cy={50} r={49} fill="none" stroke="#FFFFFF" strokeWidth={1.4} opacity={0.28} />
    </Svg>
  );
}

import Svg, { Circle, Path } from 'react-native-svg';

/**
 * Home's line icons: 24-unit grid, 2-unit round strokes, drawn in one colour.
 *
 * These replace emoji. Emoji render differently on every OS version, can't
 * take the surrounding colour, and a screen dotted with them reads as
 * generated rather than designed.
 */
type IconProps = { size?: number; color: string; strokeWidth?: number };

function Frame({ size = 16, children }: { size?: number; children: React.ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {children}
    </Svg>
  );
}

export function FlameIcon({ size, color, strokeWidth = 2 }: IconProps) {
  return (
    <Frame size={size}>
      <Path
        d="M12 3c.5 3-1.5 4.5-3 6.5S7 13 7 15a5 5 0 0 0 10 0c0-2.2-1-3.8-2-5-.3 1.3-1 2.2-2 2.5.5-2.5 0-6.5-1-9.5Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </Frame>
  );
}

export function DropIcon({ size, color, strokeWidth = 2 }: IconProps) {
  return (
    <Frame size={size}>
      <Path
        d="M12 3.5c3 3.6 6 7.2 6 10.5a6 6 0 0 1-12 0c0-3.3 3-6.9 6-10.5Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </Frame>
  );
}

/** Two footprints. */
export function StepsIcon({ size, color, strokeWidth = 2 }: IconProps) {
  return (
    <Frame size={size}>
      <Path
        d="M7 4c1.7 0 2.5 1.8 2.5 4S8.7 12 7 12s-2.5-1.8-2.5-4S5.3 4 7 4ZM5.2 15.5h3.6v1.8a1.8 1.8 0 0 1-3.6 0v-1.8ZM17 8c1.7 0 2.5 1.8 2.5 4s-.8 4-2.5 4-2.5-1.8-2.5-4 .8-4 2.5-4ZM15.2 19.5h3.6"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Frame>
  );
}

export function HeartIcon({ size, color, strokeWidth = 2 }: IconProps) {
  return (
    <Frame size={size}>
      <Path
        d="M12 19.5s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.5c0 5.6-7.5 10-7.5 10Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </Frame>
  );
}

export function BellIcon({ size, color, strokeWidth = 2 }: IconProps) {
  return (
    <Frame size={size}>
      <Path
        d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16ZM10 20.5a2 2 0 0 0 4 0"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Frame>
  );
}

/** Crossed swords, for a pending duel. */
export function DuelIcon({ size, color, strokeWidth = 2 }: IconProps) {
  return (
    <Frame size={size}>
      <Path
        d="M4 4l10 10M14 14l-2 2M14 14l2-2M20 4 10 14M10 14l2 2M10 14l-2-2M5 17l2 2M19 17l-2 2"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </Frame>
  );
}

export function ArrowIcon({ size, color, strokeWidth = 2 }: IconProps) {
  return (
    <Frame size={size}>
      <Path d="M5 12h14M13 6l6 6-6 6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Frame>
  );
}

export function LockIcon({ size, color, strokeWidth = 2 }: IconProps) {
  return (
    <Frame size={size}>
      <Path
        d="M7 11V8a5 5 0 0 1 10 0v3M5.5 11h13v9h-13z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Frame>
  );
}

export function CheckIcon({ size, color, strokeWidth = 2.4 }: IconProps) {
  return (
    <Frame size={size}>
      <Path d="M5 12.5l4.5 4.5L19 7.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Frame>
  );
}

/** A target: the daily challenge. */
export function TargetIcon({ size, color, strokeWidth = 2 }: IconProps) {
  return (
    <Frame size={size}>
      <Circle cx={12} cy={12} r={8} stroke={color} strokeWidth={strokeWidth} />
      <Circle cx={12} cy={12} r={3.5} stroke={color} strokeWidth={strokeWidth} />
    </Frame>
  );
}

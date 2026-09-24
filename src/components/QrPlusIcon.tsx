import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { palette } from '@/theme/tokens';

/**
 * "Scan or add someone": a QR mark at 80% with a plus badge over its corner.
 *
 * Drawn rather than an emoji. 📷 read as "take a photo" and rendered in a
 * different style on every phone; this reads as "connect by code" and is
 * the same everywhere. The QR sits back at 80% opacity so the plus — the
 * action — is the first thing the eye lands on.
 */
export function QrPlusIcon({
  size = 28,
  color = palette.green700,
  badge = palette.green500,
}: {
  size?: number;
  color?: string;
  badge?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28">
      {/* QR: three finder squares and a scatter of modules, at 80%. */}
      <Path
        opacity={0.8}
        fill={color}
        fillRule="evenodd"
        d={[
          // top-left finder
          'M2 2h8v8H2z M4 4v4h4V4z M5 5h2v2H5z',
          // top-right finder
          'M16 2h8v8h-8z M18 4v4h4V4z M19 5h2v2h-2z',
          // bottom-left finder
          'M2 16h8v8H2z M4 18v4h4v-4z M5 19h2v2H5z',
          // data modules
          'M12 2h2v2h-2z M12 6h2v2h-2z M12 10h2v2h-2z M2 12h2v2H2z M6 12h2v2H6z',
          'M10 12h2v2h-2z M14 12h2v2h-2z M18 12h2v2h-2z M12 16h2v2h-2z M12 20h2v2h-2z',
        ].join(' ')}
      />
      {/* Plus badge over the bottom-right, with a white keyline so it lifts
          off the code instead of blending into it. */}
      <Circle cx={21} cy={21} r={7} fill={palette.white} />
      <Circle cx={21} cy={21} r={5.8} fill={badge} />
      <Rect x={20.1} y={17.6} width={1.8} height={6.8} rx={0.9} fill={palette.white} />
      <Rect x={17.6} y={20.1} width={6.8} height={1.8} rx={0.9} fill={palette.white} />
    </Svg>
  );
}

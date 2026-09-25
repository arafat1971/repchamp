import Svg, { Circle, Path, Rect } from 'react-native-svg';

import type { HabitId } from '@/domain/ritual';

/**
 * Line icons for the ritual, drawn here so they share one stroke, one corner
 * and one weight — the ritual reads as a designed set rather than six emoji
 * from six different fonts. 24-unit grid, 1.8 stroke, round joins.
 */
export function HabitIcon({ id, size = 20, color }: { id: HabitId | 'splash' | 'plus'; size?: number; color: string }) {
  const s = { stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {id === 'water' ? <Path d="M12 3.2C12 3.2 5.5 10.2 5.5 14.6a6.5 6.5 0 0 0 13 0C18.5 10.2 12 3.2 12 3.2Z" {...s} /> : null}
      {id === 'walk' ? (
        <>
          <Circle cx="13.5" cy="4.2" r="1.8" {...s} />
          <Path d="M12.5 8l-1.8 5.5 2.8 2.5v4.5M10.7 13.5L8 20.5M12.5 8.5l2.5 3 3 1M12.5 8.5L9.5 10l-1.5 3" {...s} />
        </>
      ) : null}
      {id === 'move' ? (
        <>
          <Path d="M8 12h8" {...s} />
          <Rect x="4" y="8" width="4" height="8" rx="1.2" {...s} />
          <Rect x="16" y="8" width="4" height="8" rx="1.2" {...s} />
          <Path d="M2.5 10.5v3M21.5 10.5v3" {...s} />
        </>
      ) : null}
      {id === 'stretch' ? (
        <>
          <Circle cx="12" cy="4.6" r="1.8" {...s} />
          <Path d="M5 8.5l7 2 7-2M12 10.5v4.5M12 15l-3.5 5.5M12 15l3.5 5.5" {...s} />
        </>
      ) : null}
      {id === 'greens' ? (
        <>
          <Path d="M5 19C5 10.5 10.5 5 19.5 4.5 19.5 13.5 14 19 5 19Z" {...s} />
          <Path d="M5 19l8-8" {...s} />
        </>
      ) : null}
      {id === 'rest' ? <Path d="M19.5 14.2A8 8 0 1 1 9.8 4.5a6.4 6.4 0 0 0 9.7 9.7Z" {...s} /> : null}
      {id === 'splash' ? (
        <>
          <Path d="M9 5.5S5 10 5 12.8a4 4 0 0 0 8 0C13 10 9 5.5 9 5.5Z" {...s} />
          <Path d="M17 4s-2.4 2.7-2.4 4.3a2.4 2.4 0 0 0 4.8 0C19.4 6.7 17 4 17 4Z" {...s} />
          <Path d="M16.5 14.5l1.5 1.5M19 12.5h1.5M15 17.5l.5 1.8" {...s} />
        </>
      ) : null}
      {id === 'plus' ? <Path d="M12 5v14M5 12h14" {...s} /> : null}
    </Svg>
  );
}

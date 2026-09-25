import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { zustandStorage } from '@/lib/storage';
import { DEFAULT_WIDGET_STYLE, type WidgetStyle } from '@/domain/waterWidget';

/**
 * How the "Partner today" home-screen widget looks on this phone.
 *
 * A device preference, not something the partner sees: it rides along on
 * the widget payload this app writes, and the native side keeps it when a
 * partner's push replaces the numbers.
 */
interface WidgetStyleState extends WidgetStyle {
  setStyle: (patch: Partial<WidgetStyle>) => void;
  reset: () => void;
}

export const useWidgetStyleStore = create<WidgetStyleState>()(
  persist(
    (set) => ({
      ...DEFAULT_WIDGET_STYLE,
      setStyle: (patch) => set(patch),
      reset: () => set(DEFAULT_WIDGET_STYLE),
    }),
    {
      name: 'repchamp.widget-style',
      /* v2 introduced layouts, v3 the scene. Everyone moves to the scene —
         the new look is the point of the release — keeping their switches
         and theme (which the other layouts still use). */
      version: 4,
      /* v4: liquid glass. Everyone moves onto the glass surface — the new
         look is the point — except someone who had chosen the sky card. */
      migrate: (persisted, version) => {
        const old = (persisted ?? {}) as Partial<WidgetStyle> & { backdrop?: boolean };
        const { backdrop, ...rest } = old;
        return {
          ...DEFAULT_WIDGET_STYLE,
          ...rest,
          ...(version < 3 ? { layout: 'scene' as const } : {}),
          ...(version < 2 ? { theme: 'sunset' as const } : {}),
          surface: backdrop ? ('sky' as const) : ('glass' as const),
        };
      },
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);

/** The style alone, for code outside React and for the payload. */
export function widgetStyle(): WidgetStyle {
  const { layout, theme, showSteps, showReps, showMine, motion, weather, surface } = useWidgetStyleStore.getState();
  return { layout, theme, showSteps, showReps, showMine, motion, weather, surface };
}

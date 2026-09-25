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
      version: 1,
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);

/** The style alone, for code outside React and for the payload. */
export function widgetStyle(): WidgetStyle {
  const { theme, showSteps, showReps, showMine, motion } = useWidgetStyleStore.getState();
  return { theme, showSteps, showReps, showMine, motion };
}

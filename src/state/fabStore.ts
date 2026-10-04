import { create } from 'zustand';

/**
 * Whether the floating Train button is tucked away.
 *
 * The button floats over the bottom-right of every tab, which on Home is where
 * the Race buttons, the partner's step count and the Quick start pills sit as
 * they scroll past. Home tucks it while the athlete is reading downward and
 * brings it back the moment they scroll up, reach the top, or leave the tab.
 */
export const useFabStore = create<{ tucked: boolean; setTucked: (tucked: boolean) => void }>((set, get) => ({
  tucked: false,
  setTucked: (tucked) => {
    if (get().tucked !== tucked) set({ tucked });
  },
}));

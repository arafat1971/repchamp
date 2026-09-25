import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { WeatherNow } from '@/domain/weather';
import { zustandStorage } from '@/lib/storage';

/** The last weather reading, for the widget's sky. */
interface WeatherState {
  now: WeatherNow | null;
  set: (now: WeatherNow | null) => void;
}

export const useWeatherStore = create<WeatherState>()(
  persist(
    (set) => ({ now: null, set: (now) => set({ now }) }),
    { name: 'repchamp.weather', version: 1, storage: createJSONStorage(() => zustandStorage) },
  ),
);

import { createMMKV } from 'react-native-mmkv';
import type { StateStorage } from 'zustand/middleware';

/**
 * MMKV rather than AsyncStorage: reads are synchronous, so the first render
 * already has the athlete's profile and we never flash an empty Home screen
 * while a promise resolves.
 */
export const storage = createMMKV({ id: 'repchamp' });

/** Adapter matching zustand's `persist` storage contract. */
export const zustandStorage: StateStorage = {
  setItem: (name, value) => storage.set(name, value),
  getItem: (name) => storage.getString(name) ?? null,
  removeItem: (name) => storage.remove(name),
};

/** Wipes all persisted state. Used by "Log out" in Settings. */
export function clearAllStorage(): void {
  storage.clearAll();
}

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { zustandStorage } from '@/lib/storage';

export interface SettingsState {
  /** Beep on every counted rep. */
  sound: boolean;
  /** Vibrate on rep and duel events. */
  haptics: boolean;
  /** Spoken form cues during a set. */
  voiceCoach: boolean;
  /** Allow duel-invite notifications. */
  duelInvites: boolean;
  /** Daily "come train" reminder — at most one evening ping if you haven't trained. */
  dailyReminder: boolean;
  /** Hide from the global leaderboard. */
  privateProfile: boolean;
  /** The live-camera "how to get a good read" tutorial has been dismissed once. */
  cameraTutorialSeen: boolean;

  toggle: (key: SettingsToggle) => void;
  set: (key: SettingsToggle, value: boolean) => void;
  markCameraTutorialSeen: () => void;
}

export type SettingsToggle =
  | 'sound'
  | 'haptics'
  | 'voiceCoach'
  | 'duelInvites'
  | 'dailyReminder'
  | 'privateProfile';

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      sound: true,
      haptics: true,
      voiceCoach: false,
      duelInvites: true,
      dailyReminder: true,
      privateProfile: false,
      cameraTutorialSeen: false,

      toggle: (key) => set((state) => ({ [key]: !state[key] }) as Pick<SettingsState, SettingsToggle>),
      set: (key, value) => set({ [key]: value } as Pick<SettingsState, SettingsToggle>),
      markCameraTutorialSeen: () => set({ cameraTutorialSeen: true }),
    }),
    {
      name: 'repchamp.settings',
      version: 1,
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);

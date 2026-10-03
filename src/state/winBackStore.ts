/** Win-back offers already shown. Local pacing state, like `annualOfferStore`. */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { WinBackRecord } from '@/domain/proWinBack';
import { zustandStorage } from '@/lib/storage';

interface WinBackState {
  /** Newest first. */
  history: WinBackRecord[];
  recordShown: (now?: number) => void;
  recordOutcome: (outcome: 'tapped' | 'dismissed') => void;
}

export const useWinBackStore = create<WinBackState>()(
  persist(
    (set) => ({
      history: [],
      recordShown: (now = Date.now()) =>
        set((s) => ({ history: [{ at: now, outcome: 'shown' as const }, ...s.history].slice(0, 10) })),
      recordOutcome: (outcome) =>
        set((s) => ({ history: s.history.map((r, i) => (i === 0 ? { ...r, outcome } : r)) })),
    }),
    { name: 'repchamp.winBack', version: 1, storage: createJSONStorage(() => zustandStorage) },
  ),
);

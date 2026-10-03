/**
 * What monthly → annual switch offers the athlete has seen. Local pacing state,
 * its own store for the same reason as `proMomentStore`.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { UpgradeOfferRecord } from '@/domain/annualUpgrade';
import { zustandStorage } from '@/lib/storage';

interface AnnualOfferState {
  /** Newest first. */
  history: UpgradeOfferRecord[];
  recordShown: (now?: number) => void;
  recordOutcome: (outcome: 'tapped' | 'dismissed') => void;
}

export const useAnnualOfferStore = create<AnnualOfferState>()(
  persist(
    (set) => ({
      history: [],
      recordShown: (now = Date.now()) =>
        set((s) => ({
          history: [{ at: now, outcome: 'shown' as const }, ...s.history].slice(0, 10),
        })),
      recordOutcome: (outcome) =>
        set((s) => ({
          history: s.history.map((r, i) => (i === 0 ? { ...r, outcome } : r)),
        })),
    }),
    { name: 'repchamp.annualOffer', version: 1, storage: createJSONStorage(() => zustandStorage) },
  ),
);

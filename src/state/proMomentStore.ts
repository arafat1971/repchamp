/**
 * What Pro prompts the athlete has already been shown, and what they did.
 *
 * Its own small store, not a slice of `profileStore`: that blob is pushed to the
 * cloud profile and persisted on every rep, and prompt history is neither — it
 * is local pacing state. Losing it (reinstall) only means one early prompt, which
 * the other guards in `proMoment` still bound.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { ProMomentKind, ProMomentOutcome, ProMomentRecord } from '@/domain/proMoment';
import { zustandStorage } from '@/lib/storage';

const HISTORY_LIMIT = 20;

interface ProMomentState {
  /** Newest first. */
  history: ProMomentRecord[];
  recordShown: (kind: ProMomentKind, now?: number) => void;
  /** Resolve the most recent prompt of `kind` to what the athlete did. */
  recordOutcome: (kind: ProMomentKind, outcome: Exclude<ProMomentOutcome, 'shown'>) => void;
}

export const useProMomentStore = create<ProMomentState>()(
  persist(
    (set) => ({
      history: [],
      recordShown: (kind, now = Date.now()) =>
        set((s) => ({
          history: [{ kind, at: now, outcome: 'shown' as const }, ...s.history].slice(0, HISTORY_LIMIT),
        })),
      recordOutcome: (kind, outcome) =>
        set((s) => {
          const i = s.history.findIndex((r) => r.kind === kind);
          if (i < 0) return {};
          const history = s.history.map((r, j) => (j === i ? { ...r, outcome } : r));
          return { history };
        }),
    }),
    {
      name: 'repchamp.proMoments',
      version: 1,
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);

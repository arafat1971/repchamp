import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  calculateStreak,
  dayKey,
  leagueFromWeeklyXp,
  levelFromXp,
  type League,
  type LevelProgress,
  type SessionMode,
} from '@/domain/progression';
import {
  advanceProgramme,
  completeRestDay,
  programmeState,
  type ProgrammeProgress,
  type ProgrammeState,
} from '@/domain/programme';
import { normalizeUsername, sanitizeDisplayName } from '@/domain/input';
import { isoWeekKey } from '@/domain/weeklyChallenge';
import { EXERCISES, type ExerciseId } from '@/vision/exercises';
import { zustandStorage } from '@/lib/storage';

/** One finished set, whether duel, daily challenge, practice or a couple set. */
export interface SessionSummary {
  id: string;
  exercise: ExerciseId;
  mode: SessionMode;
  reps: number;
  opponentReps: number | null;
  opponentId: string | null;
  target: number | null;
  won: boolean;
  /** Live versus ended level. Absent/false on older records. */
  drew?: boolean;
  xp: number;
  formScore: number;
  durationSec: number;
  /** ISO timestamp. */
  completedAt: string;
  /** `YYYY-MM-DD`, used for streak and weekly rollups. */
  day: string;
}

export interface ProfileState {
  onboarded: boolean;
  username: string;
  displayName: string;
  avatarUri: string | null;
  /** Weekly training-days goal picked during onboarding. */
  weeklyGoal: number;
  totalXp: number;
  sessions: SessionSummary[];
  /** Best single-set rep count per exercise, for the Train roadmap. */
  personalBests: Record<ExerciseId, number>;
  /** The active training programme, or null when not enrolled. */
  programme: ProgrammeProgress | null;
  /**
   * Epoch ms until which a locally-granted Pro bonus is active (0 = none). Given
   * to both partners when a couple pairs — rewarding the invite loop and seeding
   * a Pro trial that can convert. Never overrides a *real* RevenueCat entitlement;
   * it's OR'd in as a temporary grant.
   */
  pairingBonusUntil: number;
  /**
   * Lifetime latch — the free Pro week for pairing is granted once per device
   * account. Without this, leave → re-pair after expiry farms unlimited Pro.
   */
  pairingBonusClaimed: boolean;

  completeOnboarding: (input: { username: string; weeklyGoal: number; avatarUri: string | null }) => void;
  setUsername: (username: string) => void;
  setAvatar: (uri: string | null) => void;
  setWeeklyGoal: (days: number) => void;
  recordSession: (summary: Omit<SessionSummary, 'id' | 'completedAt' | 'day'>) => SessionSummary;
  /** Enrol in a programme (or switch), starting from day 1. */
  startProgramme: (programmeId: string) => void;
  /** Leave the current programme. */
  leaveProgramme: () => void;
  /** Mark today's programme rest day complete (no workout required). */
  completeProgrammeRestDay: () => void;
  /** Grant a Pro bonus for `days` from now (once per account; never shortens an active one). */
  grantPairingBonus: (days: number) => void;
  reset: () => void;
}

const initialState = {
  onboarded: false,
  username: '',
  displayName: 'Champion',
  avatarUri: null as string | null,
  weeklyGoal: 4,
  totalXp: 0,
  sessions: [] as SessionSummary[],
  // Derived from the exercise registry so it stays complete as the library grows,
  // rather than a hand-maintained literal that silently drifts out of date.
  personalBests: Object.fromEntries(
    (Object.keys(EXERCISES) as ExerciseId[]).map((id) => [id, 0]),
  ) as Record<ExerciseId, number>,
  programme: null as ProgrammeProgress | null,
  pairingBonusUntil: 0,
  pairingBonusClaimed: false,
};

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      ...initialState,

      completeOnboarding: ({ username, weeklyGoal, avatarUri }) => {
        const u = normalizeUsername(username) || 'champion';
        return set({
          onboarded: true,
          username: u,
          displayName: sanitizeDisplayName(u),
          weeklyGoal,
          avatarUri,
        });
      },

      setUsername: (username) => {
        const u = normalizeUsername(username) || 'champion';
        set({ username: u, displayName: sanitizeDisplayName(u) });
      },
      setAvatar: (avatarUri) => set({ avatarUri }),
      setWeeklyGoal: (weeklyGoal) => set({ weeklyGoal }),

      recordSession: (input) => {
        const summary: SessionSummary = {
          ...input,
          // Zero-rep / give-up must not pay XP even if a caller passed a payout.
          xp: input.reps > 0 ? input.xp : 0,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          completedAt: new Date().toISOString(),
          day: dayKey(),
        };

        // Empty sets are not training days — skip history, streak, and programme.
        if (summary.reps <= 0) {
          return summary;
        }

        set((state) => ({
          totalXp: state.totalXp + summary.xp,
          sessions: [summary, ...state.sessions].slice(0, 500),
          personalBests: {
            ...state.personalBests,
            [summary.exercise]: Math.max(
              state.personalBests[summary.exercise] ?? 0,
              summary.reps,
            ),
          },
          // Advance the programme if this set cleared the current day's target.
          // No-ops when not enrolled or the set fell short.
          programme: state.programme
            ? advanceProgramme(state.programme, summary.exercise, summary.reps)
            : null,
        }));

        return summary;
      },

      startProgramme: (programmeId) => set({ programme: { programmeId, completedDays: 0 } }),
      leaveProgramme: () => set({ programme: null }),
      completeProgrammeRestDay: () =>
        set((state) => {
          if (!state.programme) return {};
          return { programme: completeRestDay(state.programme) };
        }),

      grantPairingBonus: (days) =>
        set((state) => {
          // One free week per account — leave/re-pair must not re-arm the grant.
          if (state.pairingBonusClaimed) return {};
          const proposed = Date.now() + days * 24 * 60 * 60 * 1000;
          return {
            pairingBonusUntil: Math.max(state.pairingBonusUntil, proposed),
            pairingBonusClaimed: true,
          };
        }),

      reset: () => set({ ...initialState }),
    }),
    {
      name: 'repchamp.profile',
      version: 3,
      storage: createJSONStorage(() => zustandStorage),
      // v1 → v2 added `programme`; v2 → v3 locks pairing Pro to a single grant.
      migrate: (persisted, version) => {
        const state = persisted as Partial<ProfileState>;
        let next = { ...state } as ProfileState;
        if (version < 2 && next.programme === undefined) {
          next = { ...next, programme: null };
        }
        if (version < 3) {
          // Already received a bonus before → treat as claimed so re-pair can't farm.
          next = {
            ...next,
            pairingBonusClaimed: next.pairingBonusClaimed ?? (next.pairingBonusUntil ?? 0) > 0,
          };
        }
        return next;
      },
    },
  ),
);

/* ------------------------------------------------------------------ *
 * Derived selectors — kept as plain functions so they can be unit-tested
 * without mounting a component.
 * ------------------------------------------------------------------ */

export function selectLevel(state: Pick<ProfileState, 'totalXp'>): LevelProgress {
  return levelFromXp(state.totalXp);
}

/** Sessions in the current ISO week (same key as the leaderboard `weekKey`). */
export function selectWeekSessions(
  state: Pick<ProfileState, 'sessions'>,
  now: Date = new Date(),
): SessionSummary[] {
  const week = isoWeekKey(now);
  return state.sessions.filter((s) => {
    const [y, m, d] = s.day.split('-').map(Number);
    if (!y || !m || !d) return false;
    return isoWeekKey(new Date(y, m - 1, d)) === week;
  });
}

export function selectWeeklyXp(state: Pick<ProfileState, 'sessions'>, now?: Date): number {
  return selectWeekSessions(state, now).reduce((acc, s) => acc + s.xp, 0);
}

export function selectLeague(state: Pick<ProfileState, 'sessions'>, now?: Date): League {
  return leagueFromWeeklyXp(selectWeeklyXp(state, now));
}

export function selectStreak(state: Pick<ProfileState, 'sessions'>, today = dayKey()): number {
  return calculateStreak(
    state.sessions.map((s) => s.day),
    today,
  );
}

/** Whether the locally-granted pairing Pro bonus is still active. */
export function selectPairingBonusActive(
  state: Pick<ProfileState, 'pairingBonusUntil'>,
  now = Date.now(),
): boolean {
  return state.pairingBonusUntil > now;
}

/** Distinct days trained this week, for the "3 / 4 days" tile. */
export function selectDaysTrainedThisWeek(
  state: Pick<ProfileState, 'sessions'>,
  now?: Date,
): number {
  return new Set(selectWeekSessions(state, now).map((s) => s.day)).size;
}

export function selectTotalReps(state: Pick<ProfileState, 'sessions'>): number {
  return state.sessions.reduce((acc, s) => acc + s.reps, 0);
}

export function selectDuelsWon(state: Pick<ProfileState, 'sessions'>): number {
  return state.sessions.filter((s) => s.mode === 'versus' && s.won).length;
}

export function selectWinRate(state: Pick<ProfileState, 'sessions'>): number {
  // Draws are neither wins nor losses — exclude them so ties don't tank win %.
  const decided = state.sessions.filter((s) => s.mode === 'versus' && !s.drew);
  if (decided.length === 0) return 0;
  return Math.round((decided.filter((s) => s.won).length / decided.length) * 100);
}

/** Longest streak ever achieved, walking the full session history. */
export function selectBestStreak(state: Pick<ProfileState, 'sessions'>): number {
  const days = [...new Set(state.sessions.map((s) => s.day))].sort();
  let best = 0;
  let run = 0;
  let previous: number | null = null;

  for (const day of days) {
    const time = new Date(`${day}T00:00:00Z`).getTime();
    const gapDays = previous === null ? Infinity : Math.round((time - previous) / 86_400_000);
    // A one-day gap is a rest day and keeps the run alive, matching calculateStreak.
    run = gapDays <= 2 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = time;
  }
  return best;
}

/** The athlete's live programme position, or null when not enrolled. */
export function selectProgramme(
  state: Pick<ProfileState, 'programme'>,
): ProgrammeState | null {
  return state.programme ? programmeState(state.programme) : null;
}

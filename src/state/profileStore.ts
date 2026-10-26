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
import {
  MAX_STREAK_FREEZES,
  MAX_STREAK_FREEZES_PRO,
  STARTER_STREAK_FREEZES,
  bankAfterEarning,
  earnsFreeze,
  mergeFrozenDays,
  planStreakFreezes,
  streakRepairOffer,
  type StreakRepairOffer,
} from '@/domain/streakFreeze';
import type { Blocker, FitnessLevel } from '@/domain/onboardingPlan';
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
  /**
   * Self-reported starting level and main obstacle, from onboarding.
   *
   * Kept because the app asks for them. They used to shape a few onboarding
   * screens and then be dropped on the floor at `completeOnboarding`, which
   * meant three questions whose answers stopped mattering the moment the
   * athlete finished answering them. `firstWeekTarget` already takes a level;
   * it just never had one to take.
   *
   * Null for anyone onboarded before this was stored, so every read has to
   * tolerate it rather than assume an answer exists.
   */
  fitnessLevel: FitnessLevel | null;
  blocker: Blocker | null;
  /** Which athlete the Reps widget shows. Chosen by the user; never inferred. */
  sex: 'male' | 'female' | null;
  totalXp: number;
  /**
   * Reps banked over the life of the install. `sessions` is capped at 500 rows
   * and so cannot answer "how many reps ever" for a long-time athlete; this
   * counter can. Read it through `selectTotalReps`.
   */
  lifetimeReps: number;
  sessions: SessionSummary[];
  /** Best single-set rep count per exercise, for the Train roadmap. */
  personalBests: Record<ExerciseId, number>;
  /** The active training programme, or null when not enrolled. */
  programme: ProgrammeProgress | null;
  /**
   * Epoch ms until which the retired timed Pro bonus is active (0 = none).
   * Nothing grants it any more — pairing now gives free reps instead
   * (`pairingBonusRepCeiling`) — so it is only read until old grants run out.
   */
  pairingBonusUntil: number;
  /**
   * Lifetime latch — the pairing bonus is granted once per account. Without
   * this, leave → re-pair farms it again.
   */
  pairingBonusClaimed: boolean;
  /**
   * The pairing bonus, as a lifetime rep count: reps below it are free (see
   * `freeRepCeiling` in domain/hardPaywall.ts). 0 = none. Local only, never
   * restored from the cloud, because the cloud profile is writable by its owner
   * and a restored ceiling could be inflated. A reinstall loses at most the
   * unused part of 10 reps; the latch above still syncs, so it cannot re-arm.
   */
  pairingBonusRepCeiling: number;
  /** Hour (0–23) they said they train at, or null — see `setPreferredHour`. */
  preferredHour: number | null;
  /** Streak freezes banked, 0..MAX_STREAK_FREEZES — see `domain/streakFreeze`. */
  streakFreezes: number;
  /** Days covered by a spent freeze, `YYYY-MM-DD`, sorted. Neutral in the streak walk. */
  frozenDays: string[];
  /**
   * The last time freezes saved the streak, until the athlete has seen it. Drives
   * the one-off "Streak saved" card on Home; null once acknowledged.
   */
  freezeSave: { day: string; used: number; streak: number } | null;
  /** Day of the last streak repair (Pro perk), for its cooldown. */
  lastRepairDay: string | null;
  /** The break (its last trained day) the athlete waved away, so its card stays gone. */
  repairDismissedFor: string | null;

  completeOnboarding: (input: {
    username: string;
    weeklyGoal: number;
    avatarUri: string | null;
    fitnessLevel?: FitnessLevel | null;
    blocker?: Blocker | null;
  }) => void;
  setUsername: (username: string) => void;
  setAvatar: (uri: string | null) => void;
  setSex: (sex: 'male' | 'female') => void;
  setWeeklyGoal: (days: number) => void;
  /** When the athlete said they train, as a local hour. Seeds the reminder until their own habit takes over. */
  setPreferredHour: (hour: number | null) => void;
  recordSession: (summary: Omit<SessionSummary, 'id' | 'completedAt' | 'day'>) => SessionSummary;
  /** Enrol in a programme (or switch), starting from day 1. */
  startProgramme: (programmeId: string) => void;
  /** Leave the current programme. */
  leaveProgramme: () => void;
  /** Mark today's programme rest day complete (no workout required). */
  completeProgrammeRestDay: () => void;
  /** Grant a Pro bonus for `days` from now (once per account; never shortens an active one). */
  grantPairingBonus: (reps: number) => void;
  /**
   * Spend banked freezes on missed days if, and only if, that keeps the streak
   * alive. Safe to call any time; idempotent. Returns how many were spent.
   */
  applyStreakFreezes: (today?: string) => number;
  /** Hide the "Streak saved" card once seen. */
  dismissFreezeSave: () => void;
  /**
   * Repair a freshly broken streak by freezing the missed days. The caller
   * checks Pro; this only checks there is something to repair. Returns the
   * streak restored, or 0 when there was no offer.
   */
  repairStreak: (today?: string) => number;
  /** Hide the repair card for the current break. */
  dismissRepair: () => void;
  reset: () => void;
}

const initialState = {
  onboarded: false,
  username: '',
  displayName: 'Champion',
  avatarUri: null as string | null,
  weeklyGoal: 4,
  fitnessLevel: null as FitnessLevel | null,
  sex: null as 'male' | 'female' | null,
  blocker: null as Blocker | null,
  totalXp: 0,
  lifetimeReps: 0,
  sessions: [] as SessionSummary[],
  // Derived from the exercise registry so it stays complete as the library grows,
  // rather than a hand-maintained literal that silently drifts out of date.
  personalBests: Object.fromEntries(
    (Object.keys(EXERCISES) as ExerciseId[]).map((id) => [id, 0]),
  ) as Record<ExerciseId, number>,
  programme: null as ProgrammeProgress | null,
  pairingBonusUntil: 0,
  pairingBonusClaimed: false,
  pairingBonusRepCeiling: 0,
  preferredHour: null as number | null,
  streakFreezes: STARTER_STREAK_FREEZES,
  frozenDays: [] as string[],
  freezeSave: null as { day: string; used: number; streak: number } | null,
  lastRepairDay: null as string | null,
  repairDismissedFor: null as string | null,
};

export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      ...initialState,

      completeOnboarding: ({ username, weeklyGoal, avatarUri, fitnessLevel, blocker }) => {
        const u = normalizeUsername(username) || 'champion';
        return set({
          onboarded: true,
          username: u,
          displayName: sanitizeDisplayName(u),
          weeklyGoal,
          avatarUri,
          fitnessLevel: fitnessLevel ?? null,
          blocker: blocker ?? null,
        });
      },

      setUsername: (username) => {
        const u = normalizeUsername(username) || 'champion';
        set({ username: u, displayName: sanitizeDisplayName(u) });
      },
      setAvatar: (avatarUri) => set({ avatarUri }),
      setSex: (sex) => set({ sex }),
      setWeeklyGoal: (weeklyGoal) => set({ weeklyGoal }),
      setPreferredHour: (hour) =>
        set({
          preferredHour:
            hour !== null && Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null,
        }),

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

        // Judge the gap before today's set lands, so a freeze can still save it.
        get().applyStreakFreezes(summary.day);

        set((state) => {
          const before = selectStreak(state, summary.day);
          const after = calculateStreak(
            [summary.day, ...state.sessions.map((s) => s.day)],
            summary.day,
            state.frozenDays,
          );
          return {
            streakFreezes: earnsFreeze(before, after)
              ? bankAfterEarning(state.streakFreezes ?? 0, streakFreezeCap())
              : state.streakFreezes,
            totalXp: state.totalXp + summary.xp,
            // Start from whichever is larger so an account that predates this
            // field (undefined → 0) is seeded from its history, not from zero.
            lifetimeReps: selectTotalReps(state) + summary.reps,
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
          };
        });

        return summary;
      },

      startProgramme: (programmeId) => set({ programme: { programmeId, completedDays: 0 } }),
      leaveProgramme: () => set({ programme: null }),
      completeProgrammeRestDay: () =>
        set((state) => {
          if (!state.programme) return {};
          return { programme: completeRestDay(state.programme) };
        }),

      grantPairingBonus: (reps) =>
        set((state) => {
          // One pairing bonus per account — leave/re-pair must not re-arm the grant.
          if (state.pairingBonusClaimed) return {};
          // Counted from today's total, so an athlete with history gets all of it.
          return {
            pairingBonusRepCeiling: selectTotalReps(state) + Math.max(0, Math.floor(reps)),
            pairingBonusClaimed: true,
          };
        }),

      applyStreakFreezes: (today = dayKey()) => {
        const state = get();
        const plan = planStreakFreezes({
          trainedDays: state.sessions.map((s) => s.day),
          frozenDays: state.frozenDays ?? [],
          banked: state.streakFreezes ?? 0,
          today,
        });
        if (plan.freeze.length === 0) return 0;
        const frozenDays = mergeFrozenDays(state.frozenDays ?? [], plan.freeze);
        set({
          streakFreezes: Math.max(0, state.streakFreezes - plan.freeze.length),
          frozenDays,
          freezeSave: {
            day: today,
            used: plan.freeze.length,
            streak: calculateStreak(
              state.sessions.map((s) => s.day),
              today,
              frozenDays,
            ),
          },
        });
        return plan.freeze.length;
      },
      dismissFreezeSave: () => set({ freezeSave: null }),

      repairStreak: (today = dayKey()) => {
        const state = get();
        const offer = selectRepairOffer(state, today);
        if (!offer) return 0;
        const frozenDays = mergeFrozenDays(state.frozenDays ?? [], offer.freeze);
        set({ frozenDays, lastRepairDay: today, repairDismissedFor: null });
        return calculateStreak(
          state.sessions.map((s) => s.day),
          today,
          frozenDays,
        );
      },
      dismissRepair: () => {
        const offer = selectRepairOffer(get());
        if (offer) set({ repairDismissedFor: offer.lastTrained });
      },

      reset: () => set({ ...initialState }),
    }),
    {
      name: 'repchamp.profile',
      version: 7,
      storage: createJSONStorage(() => zustandStorage),
      // v1 → v2 added `programme`; v2 → v3 locks pairing Pro to a single grant;
      // v3 → v4 adds the uncapped `lifetimeReps` counter, seeded from history;
      // v4 → v5 adds `preferredHour`, null until the athlete says when they train;
      // v5 → v6 adds streak freezes, starting every existing athlete with one;
      // v6 → v7 adds streak repair's cooldown and dismissal.
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
        if (version < 4) {
          next = { ...next, lifetimeReps: selectTotalReps({ sessions: next.sessions ?? [] }) };
        }
        if (version < 5) {
          next = { ...next, preferredHour: next.preferredHour ?? null };
        }
        if (version < 6) {
          next = {
            ...next,
            streakFreezes: next.streakFreezes ?? STARTER_STREAK_FREEZES,
            frozenDays: next.frozenDays ?? [],
            freezeSave: null,
          };
        }
        if (version < 7) {
          next = { ...next, lastRepairDay: null, repairDismissedFor: null };
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

export function selectStreak(
  state: Pick<ProfileState, 'sessions'> & { frozenDays?: readonly string[] },
  today = dayKey(),
): number {
  return calculateStreak(
    state.sessions.map((s) => s.day),
    today,
    state.frozenDays ?? [],
  );
}

/** The pairing bonus's free-rep ceiling, for `HardWallInput.freeRepCeiling`. */
export function selectFreeRepCeiling(state: Pick<ProfileState, 'pairingBonusRepCeiling'>): number {
  const c = state.pairingBonusRepCeiling;
  return typeof c === 'number' && Number.isFinite(c) ? c : 0;
}

/** Whether the retired timed pairing Pro bonus is still active. */
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

/**
 * Reps ever counted. The larger of the visible history and the lifetime
 * counter: history is capped at 500 sessions, so for a long-time athlete it
 * undercounts — and a total that shrinks as old sessions roll off would also
 * hand a free athlete their allowance back. The max also keeps older persisted
 * state (no counter) and callers that pass only `sessions` correct.
 */
export function selectTotalReps(
  state: Pick<ProfileState, 'sessions'> & { lifetimeReps?: number },
): number {
  const visible = state.sessions.reduce((acc, s) => acc + s.reps, 0);
  return Math.max(visible, state.lifetimeReps ?? 0);
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
export function selectBestStreak(
  state: Pick<ProfileState, 'sessions'> & { frozenDays?: readonly string[] },
): number {
  const days = [...new Set(state.sessions.map((s) => s.day))].sort();
  const frozen = [...(state.frozenDays ?? [])].sort();
  let best = 0;
  let run = 0;
  let previous: number | null = null;

  for (const day of days) {
    const time = new Date(`${day}T00:00:00Z`).getTime();
    const gapDays = previous === null ? Infinity : Math.round((time - previous) / 86_400_000);
    // Missed days between the two, less any a freeze covered. One is a rest day
    // and keeps the run alive, matching calculateStreak.
    const missed =
      previous === null
        ? Infinity
        : gapDays - 1 - frozenBetween(frozen, previous, time);
    run = missed <= 1 ? run + 1 : 1;
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

/** Frozen days strictly between two UTC-midnight times. `frozen` is sorted. */
function frozenBetween(frozen: readonly string[], fromMs: number, toMs: number): number {
  let n = 0;
  for (const day of frozen) {
    const t = new Date(`${day}T00:00:00Z`).getTime();
    if (t > fromMs && t < toMs) n += 1;
  }
  return n;
}

/** Freezes banked, defensively bounded for older persisted state. */
export function selectStreakFreezes(state: { streakFreezes?: number }): number {
  return Math.max(0, Math.min(MAX_STREAK_FREEZES_PRO, state.streakFreezes ?? 0));
}

/* The freeze cap depends on Pro, but `proStore` imports this store, so this
   one cannot import it back. `proStore` registers the real source at load;
   until then (and in tests) the free cap applies. */
let freezeCapSource: () => number = () => MAX_STREAK_FREEZES;

/** Called once by `proStore` so earning respects the Pro cap. */
export function setStreakFreezeCapSource(source: () => number): void {
  freezeCapSource = source;
}

function streakFreezeCap(): number {
  try {
    return freezeCapSource();
  } catch {
    return MAX_STREAK_FREEZES;
  }
}

/** A fresh break that can still be repaired, or null. See `streakRepairOffer`. */
export function selectRepairOffer(
  state: Pick<ProfileState, 'sessions'> & { frozenDays?: readonly string[]; lastRepairDay?: string | null },
  today = dayKey(),
): StreakRepairOffer | null {
  return streakRepairOffer({
    trainedDays: state.sessions.map((s) => s.day),
    frozenDays: state.frozenDays ?? [],
    today,
    lastRepairDay: state.lastRepairDay ?? null,
  });
}

import { create } from 'zustand';

import { xpForSession, type SessionMode } from '@/domain/progression';
import { getExercise, type ExerciseId } from '@/vision/exercises';
import { buildFormReport, type FormReport } from '@/vision/formScore';
import type { RepRecord } from '@/vision/repCounter';

export type SessionPhase = 'idle' | 'calibrating' | 'countdown' | 'active' | 'finished';

export interface SessionConfig {
  exercise: ExerciseId;
  mode: SessionMode;
  /** Seconds on the clock. */
  duration: number;
  /** Rep target for solo/daily-challenge sessions. */
  target: number | null;
  /** Opponent id for versus sessions (bot rivals). */
  opponentId: string | null;
  /** Display name of the live opponent, for the result screen. */
  opponentName?: string | null;
}

export interface SessionState {
  phase: SessionPhase;
  config: SessionConfig | null;

  reps: number;
  opponentReps: number;
  timeLeft: number;
  countdown: number;
  /** 0..100 body-detection progress shown on the calibration ring. */
  calibration: number;
  /** True while the pose model can see the athlete. */
  tracking: boolean;
  /** Smoothed 0..1 depth, drives the depth indicator. */
  depth: number;
  repRecords: RepRecord[];
  formCue: string;

  won: boolean;
  xpGained: number;
  formReport: FormReport | null;

  start: (config: SessionConfig) => void;
  setCalibration: (percent: number) => void;
  beginCountdown: () => void;
  tickCountdown: () => void;
  beginActive: () => void;
  /** Called from the pose pipeline on every frame. */
  applyPose: (input: { depth: number; tracking: boolean; completedRep: RepRecord | null }) => void;
  setOpponentReps: (reps: number) => void;
  /** Record the live opponent's display name once it resolves from the duel doc. */
  setOpponentName: (name: string) => void;
  tickClock: () => void;
  finish: (options?: { forfeited?: boolean }) => void;
  reset: () => void;
}

const DEFAULT_DURATIONS: Record<SessionMode, number> = {
  versus: 20,
  solo: 30,
  practice: 45,
  // Longer than a duel: a together set is about both partners getting a real
  // set in side by side, not about who spikes hardest in twenty seconds.
  together: 60,
};

export function defaultDuration(mode: SessionMode): number {
  return DEFAULT_DURATIONS[mode];
}

const idle = {
  phase: 'idle' as SessionPhase,
  config: null,
  reps: 0,
  opponentReps: 0,
  timeLeft: 0,
  countdown: 3,
  calibration: 0,
  tracking: false,
  depth: 0,
  repRecords: [] as RepRecord[],
  formCue: 'Get set…',
  won: false,
  xpGained: 0,
  formReport: null,
};

/**
 * Decides whether the athlete won.
 *
 * Practice is never a loss — it exists to remove pressure, so finishing it at
 * all counts as a win for XP purposes. A `together` set is cooperative and has
 * no loser, for the same reason.
 */
export function didWin(config: SessionConfig, reps: number, opponentReps: number): boolean {
  switch (config.mode) {
    case 'practice':
    case 'together':
      return true;
    case 'solo':
      return reps >= (config.target ?? 0);
    case 'versus':
      return reps >= opponentReps;
  }
}

export const useSessionStore = create<SessionState>()((set, get) => ({
  ...idle,

  start: (config) =>
    set({
      ...idle,
      phase: 'calibrating',
      config,
      timeLeft: config.duration,
    }),

  setCalibration: (percent) => set({ calibration: Math.max(0, Math.min(100, percent)) }),

  beginCountdown: () => set({ phase: 'countdown', countdown: 3, calibration: 100 }),

  tickCountdown: () => {
    const next = get().countdown - 1;
    if (next < 0) {
      get().beginActive();
      return;
    }
    set({ countdown: next });
  },

  beginActive: () => set({ phase: 'active' }),

  applyPose: ({ depth, tracking, completedRep }) => {
    const state = get();
    if (state.phase !== 'active') return;

    if (!completedRep) {
      /**
       * Only commit when something visible actually changed.
       *
       * This runs on every camera frame. Writing `depth` each time re-rendered
       * the whole session screen 30+ times a second, which starved the very
       * pipeline producing the frames — measured at 3-4fps end to end. Depth is
       * quantised to 5% steps (the meter cannot show finer) and tracking only
       * commits on a real transition.
       */
      const quantised = Math.round(depth * 20) / 20;
      if (quantised !== state.depth || tracking !== state.tracking) {
        set({ depth: quantised, tracking });
      }
      return;
    }

    const reps = state.reps + 1;
    const exercise = getExercise(state.config?.exercise ?? 'push');
    const cues = exercise.cues;

    set({
      depth,
      tracking,
      reps,
      repRecords: [...state.repRecords, completedRep],
      // Cue rotates every rep, favouring the encouraging line on full-depth reps.
      formCue: completedRep.fullDepth
        ? (cues[(reps - 1) % cues.length] as string)
        : 'Go a little deeper',
    });
  },

  setOpponentReps: (opponentReps) => set({ opponentReps }),

  setOpponentName: (name) =>
    set((s) => s.config ? { config: { ...s.config, opponentName: name } } : {}),

  tickClock: () => {
    const state = get();
    if (state.phase !== 'active') return;

    const timeLeft = state.timeLeft - 1;
    if (timeLeft > 0) {
      set({ timeLeft });
      return;
    }
    set({ timeLeft: 0 });
    get().finish();
  },

  finish: (options) => {
    const state = get();
    if (!state.config || state.phase === 'finished') return;

    const won = options?.forfeited ? false : didWin(state.config, state.reps, state.opponentReps);
    const exercise = getExercise(state.config.exercise);

    set({
      phase: 'finished',
      won,
      xpGained: xpForSession(state.config.mode, won),
      formReport: buildFormReport(exercise, state.repRecords),
    });
  },

  reset: () => set({ ...idle }),
}));

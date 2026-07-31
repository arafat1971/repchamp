/**
 * Compact cloud progress slice — enough to restore streak, weekly XP/challenge,
 * and programme position after reinstall without shipping full session history.
 */

import { dayKey } from '@/domain/progression';
import type { ProgrammeProgress } from '@/domain/programme';
import { isoWeekKey } from '@/domain/weeklyChallenge';
import { EXERCISES, type ExerciseId } from '@/vision/exercises';

/** Cap stored trained days so the profile doc stays small. */
export const CLOUD_TRAINED_DAYS_CAP = 90;

export interface CloudProgressSlice {
  trainedDays: string[];
  weekKey: string;
  weekXp: number;
  weekExerciseReps: Partial<Record<ExerciseId, number>>;
  programme: ProgrammeProgress | null;
}

export interface SessionLike {
  id: string;
  exercise: ExerciseId;
  mode: 'versus' | 'solo' | 'practice' | 'together';
  reps: number;
  opponentReps: number | null;
  opponentId: string | null;
  target: number | null;
  won: boolean;
  drew?: boolean;
  xp: number;
  formScore: number;
  durationSec: number;
  completedAt: string;
  day: string;
}

/** Unique YYYY-MM-DD keys, oldest→newest, capped. */
export function compactTrainedDays(days: readonly string[]): string[] {
  const valid = days.filter((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d));
  return [...new Set(valid)].sort().slice(-CLOUD_TRAINED_DAYS_CAP);
}

/** Build the slice to push from local session history + programme. */
export function buildCloudProgressSlice(input: {
  sessions: readonly SessionLike[];
  programme: ProgrammeProgress | null;
  now?: Date;
}): CloudProgressSlice {
  const now = input.now ?? new Date();
  const weekKey = isoWeekKey(now);
  const trainedDays = compactTrainedDays(input.sessions.map((s) => s.day));

  let weekXp = 0;
  const weekExerciseReps: Partial<Record<ExerciseId, number>> = {};
  for (const s of input.sessions) {
    const [y, m, d] = s.day.split('-').map(Number);
    if (!y || !m || !d) continue;
    if (isoWeekKey(new Date(y, m - 1, d)) !== weekKey) continue;
    weekXp += s.xp;
    weekExerciseReps[s.exercise] = (weekExerciseReps[s.exercise] ?? 0) + s.reps;
  }

  return {
    trainedDays,
    weekKey,
    weekXp: Math.max(0, Math.floor(weekXp)),
    weekExerciseReps,
    programme: input.programme,
  };
}

/** Merge two slices for upsert — never regress week/programme within the same week. */
export function mergeCloudProgressSlice(
  local: CloudProgressSlice,
  cloud: Partial<CloudProgressSlice> | null | undefined,
): CloudProgressSlice {
  const trainedDays = compactTrainedDays([
    ...local.trainedDays,
    ...(Array.isArray(cloud?.trainedDays) ? cloud!.trainedDays! : []),
  ]);

  const cloudWeekKey = typeof cloud?.weekKey === 'string' ? cloud.weekKey : '';
  let weekKey = local.weekKey;
  let weekXp = local.weekXp;
  let weekExerciseReps = { ...local.weekExerciseReps };

  if (cloudWeekKey && cloudWeekKey === local.weekKey) {
    weekXp = Math.max(local.weekXp, typeof cloud?.weekXp === 'number' ? cloud.weekXp : 0);
    const cloudReps = cloud?.weekExerciseReps ?? {};
    for (const [ex, reps] of Object.entries(cloudReps)) {
      if (!(ex in EXERCISES) || typeof reps !== 'number') continue;
      const id = ex as ExerciseId;
      weekExerciseReps[id] = Math.max(weekExerciseReps[id] ?? 0, reps);
    }
  } else if (cloudWeekKey && cloudWeekKey > local.weekKey) {
    // Rare clock skew — prefer the lexicographically newer ISO week key.
    weekKey = cloudWeekKey;
    weekXp = typeof cloud?.weekXp === 'number' ? cloud.weekXp : 0;
    weekExerciseReps = { ...(cloud?.weekExerciseReps ?? {}) };
  }

  return {
    trainedDays,
    weekKey,
    weekXp,
    weekExerciseReps,
    programme: mergeProgrammeProgress(local.programme, cloud?.programme ?? null),
  };
}

export function mergeProgrammeProgress(
  local: ProgrammeProgress | null,
  cloud: ProgrammeProgress | null | undefined,
): ProgrammeProgress | null {
  if (!cloud?.programmeId) return local;
  if (!local) return { programmeId: cloud.programmeId, completedDays: Math.max(0, cloud.completedDays ?? 0) };
  if (local.programmeId === cloud.programmeId) {
    return {
      programmeId: local.programmeId,
      completedDays: Math.max(local.completedDays, cloud.completedDays ?? 0),
    };
  }
  return local.completedDays >= (cloud.completedDays ?? 0) ? local : {
    programmeId: cloud.programmeId,
    completedDays: Math.max(0, cloud.completedDays ?? 0),
  };
}

/**
 * Lightweight stub sessions so streak / weekly XP / challenge selectors work
 * after a reinstall without storing full history.
 */
export function hydrateSessionsFromCloudProgress(
  local: readonly SessionLike[],
  cloud: Partial<CloudProgressSlice> | null | undefined,
  now = new Date(),
): SessionLike[] {
  if (!cloud) return [...local];

  const out: SessionLike[] = [...local];
  const ids = new Set(local.map((s) => s.id));
  const daysPresent = new Set(local.map((s) => s.day));
  const today = dayKey(now);
  const currentWeek = isoWeekKey(now);

  const trainedDays = Array.isArray(cloud.trainedDays) ? cloud.trainedDays : [];
  for (const day of compactTrainedDays(trainedDays)) {
    const id = `cloud-day-${day}`;
    if (ids.has(id) || daysPresent.has(day)) continue;
    out.push(stubSession({ id, day, reps: 1, xp: 0, exercise: 'push' }));
    ids.add(id);
    daysPresent.add(day);
  }

  if (cloud.weekKey === currentWeek) {
    // Anchor week stubs on a real trained day in this week — never invent "today
    // trained" when the athlete only worked earlier in the week.
    const weekTrainedDays = compactTrainedDays(trainedDays).filter((day) => {
      const [y, m, d] = day.split('-').map(Number);
      if (!y || !m || !d) return false;
      return isoWeekKey(new Date(y, m - 1, d)) === currentWeek;
    });
    const stubDay =
      (weekTrainedDays.includes(today) ? today : null) ??
      weekTrainedDays[weekTrainedDays.length - 1] ??
      null;
    if (!stubDay) {
      // No trained day this week in the slice — skip week XP/reps stubs so we
      // don't fabricate a training day.
    } else {
      const localWeekXp = out
        .filter((s) => {
          const [y, m, d] = s.day.split('-').map(Number);
          if (!y || !m || !d) return false;
          return isoWeekKey(new Date(y, m - 1, d)) === currentWeek;
        })
        .reduce((acc, s) => acc + s.xp, 0);
      const cloudWeekXp = typeof cloud.weekXp === 'number' ? cloud.weekXp : 0;
      const xpDelta = cloudWeekXp - localWeekXp;
      const xpId = `cloud-weekxp-${currentWeek}`;
      if (xpDelta > 0 && !ids.has(xpId)) {
        out.push(stubSession({ id: xpId, day: stubDay, reps: 1, xp: xpDelta, exercise: 'push' }));
        ids.add(xpId);
      }

      const cloudReps = cloud.weekExerciseReps ?? {};
      for (const [ex, reps] of Object.entries(cloudReps)) {
        if (!(ex in EXERCISES) || typeof reps !== 'number' || reps <= 0) continue;
        const exercise = ex as ExerciseId;
        const localReps = out
          .filter((s) => {
            if (s.exercise !== exercise) return false;
            const [y, m, d] = s.day.split('-').map(Number);
            if (!y || !m || !d) return false;
            return isoWeekKey(new Date(y, m - 1, d)) === currentWeek;
          })
          .reduce((acc, s) => acc + s.reps, 0);
        const delta = reps - localReps;
        const repId = `cloud-weekreps-${currentWeek}-${exercise}`;
        if (delta > 0 && !ids.has(repId)) {
          out.push(stubSession({ id: repId, day: stubDay, reps: delta, xp: 0, exercise }));
          ids.add(repId);
        }
      }
    }
  }

  return out.slice(0, 500);
}

function stubSession(input: {
  id: string;
  day: string;
  reps: number;
  xp: number;
  exercise: ExerciseId;
}): SessionLike {
  return {
    id: input.id,
    exercise: input.exercise,
    mode: 'practice',
    reps: input.reps,
    opponentReps: null,
    opponentId: null,
    target: null,
    won: true,
    xp: input.xp,
    formScore: 0,
    durationSec: 0,
    completedAt: `${input.day}T12:00:00.000Z`,
    day: input.day,
  };
}

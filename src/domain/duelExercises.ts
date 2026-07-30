import type { ExerciseId } from '@/vision/exercises';
import { EXERCISES } from '@/vision/exercises';
import { isExerciseFree } from '@/domain/pro';

/**
 * Movements offered when setting up a duel, quick match, or couple train.
 * Stretch / shoulder rolls stay practice-only — they don't make a fair timed duel.
 */
export const DUEL_EXERCISE_IDS = [
  'push',
  'squat',
  'situp',
  'jumping-jack',
  'lunge',
  'high-knees',
] as const satisfies readonly ExerciseId[];

export type DuelExerciseOption = {
  id: ExerciseId;
  label: string;
  emoji: string;
  desc: string;
  color: string;
  tintBg: string;
  soft: readonly [string, string];
  ring: string;
  /** Free for solo/versus; couple mode unlocks the full list. */
  free: boolean;
};

const META: Record<
  (typeof DUEL_EXERCISE_IDS)[number],
  Omit<DuelExerciseOption, 'id' | 'label' | 'free'>
> = {
  push: {
    emoji: '💪',
    desc: 'Upper body power',
    color: '#16a34a',
    tintBg: '#f0fdf4',
    soft: ['#dcfce7', '#bbf7d0'],
    ring: 'rgba(34,197,94,0.35)',
  },
  squat: {
    emoji: '🦵',
    desc: 'Lower body strength',
    color: '#7c3aed',
    tintBg: '#faf5ff',
    soft: ['#f3e8ff', '#e9d5ff'],
    ring: 'rgba(139,92,246,0.35)',
  },
  situp: {
    emoji: '🧘',
    desc: 'Core endurance',
    color: '#ea580c',
    tintBg: '#fff7ed',
    soft: ['#ffedd5', '#fed7aa'],
    ring: 'rgba(234,88,12,0.35)',
  },
  'jumping-jack': {
    emoji: '⭐',
    desc: 'Full-body cardio',
    color: '#0891b2',
    tintBg: '#ecfeff',
    soft: ['#cffafe', '#a5f3fc'],
    ring: 'rgba(8,145,178,0.35)',
  },
  lunge: {
    emoji: '🏃',
    desc: 'Legs & balance',
    color: '#db2777',
    tintBg: '#fdf2f8',
    soft: ['#fce7f3', '#fbcfe8'],
    ring: 'rgba(219,39,119,0.35)',
  },
  'high-knees': {
    emoji: '🔥',
    desc: 'Explosive tempo',
    color: '#dc2626',
    tintBg: '#fef2f2',
    soft: ['#fee2e2', '#fecaca'],
    ring: 'rgba(220,38,38,0.35)',
  },
};

export function duelExerciseOptions(): DuelExerciseOption[] {
  return DUEL_EXERCISE_IDS.map((id) => ({
    id,
    label: EXERCISES[id].label,
    free: isExerciseFree(id),
    ...META[id],
  }));
}

/** Resolve a route param to a known duel exercise (defaults to push-ups). */
export function parseDuelExercise(raw: string | undefined): ExerciseId {
  if (raw && (DUEL_EXERCISE_IDS as readonly string[]).includes(raw)) {
    return raw as ExerciseId;
  }
  return 'push';
}

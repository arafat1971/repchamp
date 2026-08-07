/**
 * What a challenge-invite notification actually says.
 *
 * The banner used to read "Challenge invite / champion challenged you to a
 * duel." — the same words whether it was 20 seconds of push-ups or 60 of
 * squats, from a level 1 stranger or a rival two levels up. Everything that
 * makes an invite worth answering was fetched by `fetchIncomingDuels` and then
 * dropped on the floor.
 *
 * This builds the copy from the invite the poll already has. Pure and
 * dependency-free so the wording can be tested without a device or a
 * notification permission.
 */

import type { InviteKind } from '@/domain/presence';
import { getExercise, type ExerciseId } from '@/vision/exercises';

export interface InviteNotificationInput {
  fromName: string;
  /** Raw exercise id off the duel doc — may be absent or unrecognised. */
  exercise?: string | null;
  /** Seconds the set runs for. */
  duration?: number | null;
  kind: InviteKind;
  /** The host's level, when known and worth mentioning. */
  hostLevel?: number | null;
  /** The reader's level, for the "same level" / "levels up" read. */
  myLevel?: number | null;
}

export interface InviteNotificationCopy {
  title: string;
  body: string;
}

/**
 * `IncomingDuel.exercise` is a bare string off a Firestore doc, so it can be a
 * movement this build does not know. Falling back to null lets the copy drop
 * the movement rather than print a raw id like "high-knees" at someone.
 */
function exerciseLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const def = getExercise(raw as ExerciseId);
    return def?.label ?? null;
  } catch {
    return null;
  }
}

/** "20s" / "1 min" / "1:30" — short enough for a notification title. */
function durationLabel(seconds: number | null | undefined): string | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const rem = Math.round(seconds % 60);
  if (rem === 0) return `${mins} min`;
  return `${mins}:${String(rem).padStart(2, '0')}`;
}

/**
 * The stakes line — why this one is worth opening.
 *
 * Only claims a level gap when both levels are known and the gap is real; an
 * invented "2 levels up" from a missing field would be worse than saying
 * nothing. Silence is the default.
 */
function stakesLine(hostLevel: number | null | undefined, myLevel: number | null | undefined): string | null {
  if (typeof hostLevel !== 'number' || typeof myLevel !== 'number') return null;
  if (!Number.isFinite(hostLevel) || !Number.isFinite(myLevel)) return null;
  const gap = hostLevel - myLevel;
  if (gap >= 2) return `They're ${gap} levels up — beat them and it counts double.`;
  if (gap === 1) return 'They just edged ahead of you.';
  if (gap === 0) return "You're dead level.";
  return null;
}

export function buildInviteNotification(input: InviteNotificationInput): InviteNotificationCopy {
  const label = exerciseLabel(input.exercise);
  const time = durationLabel(input.duration);

  /* Title carries the specifics, because on Android the title is what survives
     a collapsed shade — the body is the line that gets truncated first. */
  const spec = label && time ? `${label} · ${time}` : (label ?? time);

  if (input.kind === 'train') {
    return {
      title: spec ? `Train together · ${spec}` : 'Train together',
      body: `${input.fromName} wants to train with you.`,
    };
  }

  if (input.kind === 'compete') {
    return {
      title: spec ? `Weekly challenge · ${spec}` : 'Weekly challenge',
      body: `${input.fromName} challenged you this week.`,
    };
  }

  const stakes = stakesLine(input.hostLevel, input.myLevel);
  return {
    title: spec ? `Duel · ${spec}` : 'Duel challenge',
    body: stakes ? `${input.fromName} challenged you. ${stakes}` : `${input.fromName} challenged you to a duel.`,
  };
}

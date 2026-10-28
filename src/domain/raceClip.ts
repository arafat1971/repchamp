/**
 * The race video: a 9:16 clip of a finished duel or together set, replayed from
 * the real rep times, for posting to TikTok / Reels / Stories.
 *
 * Pure: this decides WHAT each frame shows (counts, clock, phase). Drawing lives
 * in `src/lib/raceClip/drawFrame.ts`, encoding in the `race-clip-encoder` module.
 *
 * The clip never invents a rep. Counts come from the recorded rep times, scaled
 * into a fixed few seconds, and always end on the true final scores.
 */

export const CLIP = {
  width: 720,
  height: 1280,
  fps: 30,
  /** "ME vs THEM" title card. */
  introMs: 900,
  /** The race itself, however long it really was, squeezed into this. */
  raceMs: 5000,
  /** Final score, verdict and the call to action. */
  resultMs: 2300,
} as const;

export const CLIP_TOTAL_MS = CLIP.introMs + CLIP.raceMs + CLIP.resultMs;
export const CLIP_FRAME_COUNT = Math.round((CLIP_TOTAL_MS / 1000) * CLIP.fps);

export interface RaceClipInput {
  myName: string;
  theirName: string;
  /** AI partners are labelled as AI in the clip, never passed off as people. */
  theirIsAI: boolean;
  exerciseLabel: string;
  cooperative: boolean;
  won: boolean;
  drew: boolean;
  myReps: number;
  theirReps: number;
  /** Wall-clock ms the active phase began; null when unknown. */
  startedAt: number | null;
  durationMs: number;
  /** Wall-clock ms of each counted rep, in order. */
  myRepTimes: readonly number[];
  theirRepTimes: readonly number[];
}

/** Each rep as a fraction 0..1 of the way through the race. */
export interface RaceTimeline {
  mine: number[];
  theirs: number[];
}

export type ClipPhase = 'intro' | 'race' | 'result';

export interface ClipFrame {
  phase: ClipPhase;
  /** 0..1 progress within the current phase. */
  phaseT: number;
  /** 0..1 progress through the replayed race (1 from the result phase on). */
  raceT: number;
  myCount: number;
  theirCount: number;
  /** Seconds left on the race clock, as the athlete saw it. */
  secondsLeft: number;
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Turn recorded rep times into `count` sorted fractions of the race.
 *
 * Missing or unusable times (no start, a rep that arrived without a stamp) fall
 * back to even spacing for the reps that lack one, so the count still climbs to
 * the true total.
 */
export function normaliseRepTimes(
  times: readonly number[],
  count: number,
  startedAt: number | null,
  durationMs: number,
): number[] {
  if (count <= 0) return [];
  const known =
    startedAt != null && durationMs > 0
      ? times
          .slice(0, count)
          .filter((t) => Number.isFinite(t))
          .map((t) => clamp01((t - startedAt) / durationMs))
          .sort((a, b) => a - b)
      : [];
  if (known.length === 0) {
    return Array.from({ length: count }, (_, i) => (i + 0.5) / count);
  }
  const out = [...known];
  const missing = count - out.length;
  const from = out[out.length - 1] ?? 0;
  for (let i = 1; i <= missing; i++) {
    out.push(from + ((1 - from) * i) / (missing + 1));
  }
  return out;
}

export function buildTimeline(input: RaceClipInput): RaceTimeline {
  return {
    mine: normaliseRepTimes(input.myRepTimes, input.myReps, input.startedAt, input.durationMs),
    theirs: normaliseRepTimes(input.theirRepTimes, input.theirReps, input.startedAt, input.durationMs),
  };
}

/** How many reps had landed by race fraction `t`. */
export function countAt(fractions: readonly number[], t: number): number {
  let n = 0;
  for (const f of fractions) if (f <= t) n++;
  return n;
}

export function frameAt(
  input: Pick<RaceClipInput, 'durationMs' | 'myReps' | 'theirReps'>,
  timeline: RaceTimeline,
  frameIndex: number,
): ClipFrame {
  const ms = (frameIndex / CLIP.fps) * 1000;
  const totalSeconds = Math.round(input.durationMs / 1000);

  if (ms < CLIP.introMs) {
    return {
      phase: 'intro',
      phaseT: clamp01(ms / CLIP.introMs),
      raceT: 0,
      myCount: 0,
      theirCount: 0,
      secondsLeft: totalSeconds,
    };
  }
  if (ms < CLIP.introMs + CLIP.raceMs) {
    const raceT = clamp01((ms - CLIP.introMs) / CLIP.raceMs);
    return {
      phase: 'race',
      phaseT: raceT,
      raceT,
      myCount: countAt(timeline.mine, raceT),
      theirCount: countAt(timeline.theirs, raceT),
      secondsLeft: Math.ceil(totalSeconds * (1 - raceT)),
    };
  }
  return {
    phase: 'result',
    phaseT: clamp01((ms - CLIP.introMs - CLIP.raceMs) / CLIP.resultMs),
    raceT: 1,
    myCount: input.myReps,
    theirCount: input.theirReps,
    secondsLeft: 0,
  };
}

/**
 * The end card, written for someone scrolling past rather than the athlete:
 * "SAM WINS" over "14-12 · SQUATS", not "Won by 2".
 */
export function resultHeadline(
  input: Pick<
    RaceClipInput,
    'cooperative' | 'won' | 'drew' | 'myReps' | 'theirReps' | 'exerciseLabel' | 'myName' | 'theirName' | 'theirIsAI'
  >,
): { headline: string; score: string } {
  const label = input.exerciseLabel.toUpperCase();
  if (input.cooperative) {
    return {
      headline: `${input.myReps + input.theirReps} TOGETHER`,
      score: `${input.myReps} + ${input.theirReps} · ${label}`,
    };
  }
  const me = input.myName.trim().toUpperCase() || 'ME';
  const them = theirDisplayName(input).toUpperCase();
  return {
    headline: input.drew ? 'DEAD HEAT' : input.won ? `${me} WINS` : `${them} WINS`,
    score: `${input.myReps}-${input.theirReps} · ${label}`,
  };
}

/** The opponent's name as the clip prints it: AI partners carry the label. */
export function theirDisplayName(input: Pick<RaceClipInput, 'theirName' | 'theirIsAI'>): string {
  const name = input.theirName.trim() || 'Opponent';
  return input.theirIsAI ? `${name} (AI)` : name;
}

/** Caption pasted alongside the video in the share sheet. */
export function clipCaption(
  input: Pick<RaceClipInput, 'cooperative' | 'won' | 'drew' | 'myReps' | 'theirReps' | 'exerciseLabel'>,
  link: string,
): string {
  const label = input.exerciseLabel.toLowerCase();
  const line = input.cooperative
    ? `${input.myReps + input.theirReps} ${label} together on RepChamp. Who's next?`
    : input.won
      ? `${input.myReps} ${label}. Think you can beat me on RepChamp?`
      : `${input.myReps} ${label}. Rematch incoming. Race me on RepChamp`;
  return `${line} ${link}`;
}

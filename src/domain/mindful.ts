import { dayKey } from '@/domain/progression';
import type { HabitId } from '@/domain/ritual';

/*
 * Yoga flows and guided breathing for the Train tab.
 *
 * Neither is tracked by the camera — there is no pose model for a downward dog
 * and nothing to count in a breath — so both are timed and guided: the app
 * holds the clock and says what comes next, and the athlete does the moving.
 * Everything here is pure so the timing rules are tested rather than eyeballed
 * on a phone.
 */

/* ------------------------------------------------------------------ *
 * Yoga
 * ------------------------------------------------------------------ */

export type PoseId =
  | 'mountain'
  | 'forward-fold'
  | 'cat-cow'
  | 'down-dog'
  | 'low-lunge'
  | 'cobra'
  | 'child'
  | 'warrior-2'
  | 'tree'
  | 'chair'
  | 'seated-twist'
  | 'seated-fold'
  | 'bridge'
  | 'savasana';

export const POSES: Record<PoseId, { name: string; cue: string }> = {
  mountain: { name: 'Mountain', cue: 'Feet grounded, crown lifting. Breathe tall.' },
  'forward-fold': { name: 'Forward fold', cue: 'Soft knees, let your head hang heavy.' },
  'cat-cow': { name: 'Cat–cow', cue: 'Arch as you breathe in, round as you breathe out.' },
  'down-dog': { name: 'Downward dog', cue: 'Hips high, heels reaching for the floor.' },
  'low-lunge': { name: 'Low lunge', cue: 'Back knee down, sink the hips forward.' },
  cobra: { name: 'Cobra', cue: 'Elbows hugged in, chest lifting, shoulders low.' },
  child: { name: "Child's pose", cue: 'Knees wide, forehead down, breathe into your back.' },
  'warrior-2': { name: 'Warrior II', cue: 'Front knee over ankle, arms long, gaze forward.' },
  tree: { name: 'Tree', cue: 'Foot on calf or thigh, never the knee. Find a still point.' },
  chair: { name: 'Chair', cue: 'Sit back as if into a chair, arms reaching up.' },
  'seated-twist': { name: 'Seated twist', cue: 'Grow tall on the in-breath, twist on the out.' },
  'seated-fold': { name: 'Seated fold', cue: 'Legs long, fold from the hips, no forcing.' },
  bridge: { name: 'Bridge', cue: 'Press through your feet and lift the hips.' },
  savasana: { name: 'Rest', cue: 'Lie back, let everything go heavy. Just breathe.' },
};

export type FlowStep = { pose: PoseId; seconds: number; side?: 'right' | 'left' };

export type YogaFlowId = 'morning' | 'desk' | 'evening';

export type YogaFlow = {
  id: YogaFlowId;
  title: string;
  line: string;
  accent: string;
  /** The pose drawn on the flow's card — its most recognisable shape. */
  cover: PoseId;
  steps: readonly FlowStep[];
};

export const YOGA_FLOWS: readonly YogaFlow[] = [
  {
    id: 'morning',
    title: 'Morning flow',
    line: 'Wake up the spine',
    accent: '#EA580C',
    cover: 'warrior-2',
    steps: [
      { pose: 'mountain', seconds: 30 },
      { pose: 'forward-fold', seconds: 40 },
      { pose: 'cat-cow', seconds: 60 },
      { pose: 'down-dog', seconds: 45 },
      { pose: 'low-lunge', seconds: 40, side: 'right' },
      { pose: 'low-lunge', seconds: 40, side: 'left' },
      { pose: 'cobra', seconds: 30 },
      { pose: 'child', seconds: 45 },
      { pose: 'warrior-2', seconds: 40, side: 'right' },
      { pose: 'warrior-2', seconds: 40, side: 'left' },
      { pose: 'tree', seconds: 30, side: 'right' },
      { pose: 'tree', seconds: 30, side: 'left' },
    ],
  },
  {
    id: 'desk',
    title: 'Desk reset',
    line: 'Undo a day of sitting',
    accent: '#0D9488',
    cover: 'seated-twist',
    steps: [
      { pose: 'mountain', seconds: 20 },
      { pose: 'seated-twist', seconds: 40, side: 'right' },
      { pose: 'seated-twist', seconds: 40, side: 'left' },
      { pose: 'forward-fold', seconds: 45 },
      { pose: 'cat-cow', seconds: 60 },
      { pose: 'chair', seconds: 30 },
      { pose: 'child', seconds: 60 },
    ],
  },
  {
    id: 'evening',
    title: 'Evening unwind',
    line: 'Slow down before bed',
    accent: '#7C3AED',
    cover: 'child',
    steps: [
      { pose: 'child', seconds: 60 },
      { pose: 'cat-cow', seconds: 60 },
      { pose: 'seated-fold', seconds: 60 },
      { pose: 'seated-twist', seconds: 45, side: 'right' },
      { pose: 'seated-twist', seconds: 45, side: 'left' },
      { pose: 'bridge', seconds: 45 },
      { pose: 'savasana', seconds: 120 },
    ],
  },
];

/** A flow finished all the way through ticks the Stretch habit. */
export const YOGA_HABIT: HabitId = 'stretch';

export function yogaFlow(id: string | undefined): YogaFlow {
  return YOGA_FLOWS.find((f) => f.id === id) ?? YOGA_FLOWS[0]!;
}

export function flowSeconds(flow: Pick<YogaFlow, 'steps'>): number {
  return flow.steps.reduce((sum, s) => sum + s.seconds, 0);
}

/** Whole minutes, rounded — a 7:50 flow is "8 min", never "7 min". */
export function flowMinutes(flow: Pick<YogaFlow, 'steps'>): number {
  return Math.max(1, Math.round(flowSeconds(flow) / 60));
}

/** Distinct poses, so a both-sides pose counts once on the card. */
export function poseCount(flow: Pick<YogaFlow, 'steps'>): number {
  return new Set(flow.steps.map((s) => s.pose)).size;
}

/** The step name as spoken and shown: "Low lunge, right side". */
export function stepLabel(step: FlowStep): string {
  const name = POSES[step.pose].name;
  return step.side ? `${name}, ${step.side} side` : name;
}

/**
 * Where a flow is after `elapsed` seconds of holding.
 *
 * `index` is the step being held and `left` its whole seconds remaining.
 * Past the end it pins to the last step at zero with `done` set, so a late
 * tick of the clock cannot index off the array.
 */
export function poseAt(
  flow: Pick<YogaFlow, 'steps'>,
  elapsed: number,
): { index: number; left: number; done: boolean } {
  let start = 0;
  for (let i = 0; i < flow.steps.length; i++) {
    const end = start + flow.steps[i]!.seconds;
    if (elapsed < end) return { index: i, left: Math.ceil(end - elapsed), done: false };
    start = end;
  }
  return { index: Math.max(0, flow.steps.length - 1), left: 0, done: true };
}

/**
 * Whether a finished flow earns its habit tick.
 *
 * Skip reaches the end as surely as holding every pose does, so reaching the
 * end is not enough: the athlete must have actually spent most of the flow's
 * time in it. Four-fifths leaves room to skip a pose that hurts, not the lot.
 */
export const EARN_SHARE = 0.8;

export function earnsTick(heldSeconds: number, totalSeconds: number): boolean {
  return totalSeconds > 0 && heldSeconds >= totalSeconds * EARN_SHARE;
}

/** Seconds into the flow at which step `index` starts — for skip and back. */
export function stepStart(flow: Pick<YogaFlow, 'steps'>, index: number): number {
  return flow.steps.slice(0, Math.max(0, index)).reduce((sum, s) => sum + s.seconds, 0);
}

/* ------------------------------------------------------------------ *
 * Breathing
 * ------------------------------------------------------------------ */

/** Seconds per phase. `hold` follows the in-breath, `rest` the out-breath. */
export type BreathPattern = { in: number; hold: number; out: number; rest: number };

export type BreathPhase = 'in' | 'hold' | 'out' | 'rest';

export type MeditationId = 'calm' | 'box' | 'sleep' | 'reset';

export type Meditation = {
  id: MeditationId;
  title: string;
  line: string;
  minutes: number;
  pattern: BreathPattern;
  /**
   * The ritual habit finishing it ticks, if any. The one-minute reset ticks
   * nothing: "Breathe" promises five quiet minutes, and one is not five.
   */
  habit: HabitId | null;
};

export const MEDITATIONS: readonly Meditation[] = [
  {
    id: 'calm',
    title: 'Calm breath',
    line: 'A long out-breath to settle the day.',
    minutes: 5,
    pattern: { in: 4, hold: 0, out: 6, rest: 0 },
    habit: 'breathe',
  },
  {
    id: 'box',
    title: 'Box breathing',
    line: 'In, hold, out, hold. A steady square for focus.',
    minutes: 5,
    pattern: { in: 4, hold: 4, out: 4, rest: 4 },
    habit: 'breathe',
  },
  {
    id: 'sleep',
    title: '4-7-8 for sleep',
    line: 'Hold longer, let go slower. Made for bedtime.',
    minutes: 4,
    pattern: { in: 4, hold: 7, out: 8, rest: 0 },
    habit: 'rest',
  },
  {
    id: 'reset',
    title: 'One-minute reset',
    line: 'Six slow breaths between one thing and the next.',
    minutes: 1,
    pattern: { in: 4, hold: 0, out: 6, rest: 0 },
    habit: null,
  },
];

export function meditation(id: string | undefined): Meditation | null {
  return MEDITATIONS.find((m) => m.id === id) ?? null;
}

export function cycleSeconds(p: BreathPattern): number {
  return p.in + p.hold + p.out + p.rest;
}

/**
 * The phase `elapsedMs` into a session, and whole seconds left in it.
 * Zero-length phases are skipped, so a 4/0/6/0 pattern never reports "hold".
 */
export function breathPhaseAt(
  p: BreathPattern,
  elapsedMs: number,
): { phase: BreathPhase; left: number } {
  const cycleMs = cycleSeconds(p) * 1000;
  let t = cycleMs > 0 ? ((elapsedMs % cycleMs) + cycleMs) % cycleMs : 0;
  const order: BreathPhase[] = ['in', 'hold', 'out', 'rest'];
  for (const phase of order) {
    const ms = p[phase] * 1000;
    if (t < ms) return { phase, left: Math.ceil((ms - t) / 1000) };
    t -= ms;
  }
  return { phase: 'in', left: p.in };
}

export const PHASE_WORD: Record<BreathPhase, string> = {
  in: 'Breathe in',
  hold: 'Hold',
  out: 'Breathe out',
  rest: 'Hold',
};

/** The pattern as the card shows it: "4 · 7 · 8". Zero phases are left out. */
export function patternLabel(p: BreathPattern): string {
  return [p.in, p.hold, p.out, p.rest].filter((n) => n > 0).join(' · ');
}

/**
 * Where to resume after the app was away: the start of the breath you were
 * in, so the words and the circle begin together on a fresh in-breath rather
 * than picking up halfway through an exhale.
 */
export function breathResumeAt(p: BreathPattern, elapsedMs: number): number {
  const cycleMs = cycleSeconds(p) * 1000;
  if (cycleMs <= 0) return Math.max(0, elapsedMs);
  return Math.max(0, Math.floor(elapsedMs / cycleMs) * cycleMs);
}

/* ------------------------------------------------------------------ *
 * The log
 * ------------------------------------------------------------------ */

export type MindfulKind = 'yoga' | 'meditation';

/** One finished session. `seconds` is time actually spent in it. */
export type MindfulEntry = { day: string; kind: MindfulKind; id: string; seconds: number };

/** Days of log kept on the phone — enough for "this week" with room to spare. */
export const LOG_DAYS = 28;

/**
 * The log with `entry` added and anything older than `LOG_DAYS` before `today`
 * dropped. Day keys are ISO `YYYY-MM-DD`, so they compare as strings.
 */
export function withMindfulEntry(
  log: readonly MindfulEntry[],
  entry: MindfulEntry,
  today: string,
): MindfulEntry[] {
  const cutoff = new Date(`${today}T12:00:00`);
  cutoff.setDate(cutoff.getDate() - (LOG_DAYS - 1));
  const from = dayKey(cutoff);
  return [...log, entry].filter((e) => e.day >= from);
}

/** Whether session `id` of `kind` was finished on `day`. */
export function doneOn(
  log: readonly MindfulEntry[],
  kind: MindfulKind,
  id: string,
  day: string,
): boolean {
  return log.some((e) => e.kind === kind && e.id === id && e.day === day);
}

/** Whole minutes of `kind` logged on any of `days` — rounded, like the cards. */
export function minutesOn(
  log: readonly MindfulEntry[],
  kind: MindfulKind,
  days: readonly string[],
): number {
  const set = new Set(days);
  const seconds = log.reduce((sum, e) => (e.kind === kind && set.has(e.day) ? sum + e.seconds : sum), 0);
  return Math.round(seconds / 60);
}

/** Drops anything malformed a stored log might hold. */
export function cleanLog(raw: unknown): MindfulEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is MindfulEntry =>
      !!e &&
      typeof e === 'object' &&
      typeof (e as MindfulEntry).day === 'string' &&
      ((e as MindfulEntry).kind === 'yoga' || (e as MindfulEntry).kind === 'meditation') &&
      typeof (e as MindfulEntry).id === 'string' &&
      Number.isFinite((e as MindfulEntry).seconds),
  );
}

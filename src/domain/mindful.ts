import { previousDay } from './duoStreak';

/**
 * Mind & body: guided meditations, and the log both they and camera yoga write
 * to. A meditation is a breathing pattern (or none) plus a script of spoken
 * prompts, laid out over whatever length was chosen. Pure, so the timing and
 * the streak are testable without a clock.
 */

export interface BreathPattern {
  /** Seconds for each phase; a 0 phase is skipped. */
  inhale: number;
  holdIn: number;
  exhale: number;
  holdOut: number;
}

export type BreathPhase = 'inhale' | 'holdIn' | 'exhale' | 'holdOut';

export const PHASE_WORD: Readonly<Record<BreathPhase, string>> = {
  inhale: 'Breathe in',
  holdIn: 'Hold',
  exhale: 'Breathe out',
  holdOut: 'Hold',
};

export interface Meditation {
  id: MeditationId;
  title: string;
  blurb: string;
  emoji: string;
  /** Lengths offered, minutes. The first is the default. */
  minutes: readonly number[];
  /** A paced breath to follow, or null for an open sit. */
  breath: BreathPattern | null;
  /** Said in order over the first minute or so. */
  opening: readonly string[];
  /** Cycled through the middle, one every `every` seconds. */
  middle: readonly string[];
  every: number;
  /** Said over the last half-minute. */
  closing: readonly string[];
}

export type MeditationId = 'calm' | 'box' | 'body-scan' | 'focus' | 'kindness' | 'sleep';

const CLOSING = ['Let the practice go. Let your breath return to its own pace.', 'Notice how you feel now. Gently open your eyes when you are ready.'];

export const MEDITATIONS: readonly Meditation[] = [
  {
    id: 'calm',
    title: 'Calm breath',
    blurb: 'A long, slow out-breath to settle a busy mind.',
    emoji: '🌊',
    minutes: [5, 3, 10],
    breath: { inhale: 4, holdIn: 0, exhale: 6, holdOut: 0 },
    opening: ['Sit comfortably and let your eyes close.', 'Follow the circle. In for four, and out for six.'],
    middle: ['Let each out-breath be a little longer and softer.', 'If your mind wanders, just come back to the breath.', 'Soften your shoulders and your jaw.'],
    every: 60,
    closing: CLOSING,
  },
  {
    id: 'box',
    title: 'Box breathing',
    blurb: 'Four in, hold, four out, hold. Steady focus under pressure.',
    emoji: '🟦',
    minutes: [5, 3, 10],
    breath: { inhale: 4, holdIn: 4, exhale: 4, holdOut: 4 },
    opening: ['Sit upright and relax your hands.', 'Breathe in for four, hold for four, out for four, hold for four.'],
    middle: ['Keep each side of the box even.', 'Stay easy in the holds. There is no strain.', 'Let the rhythm carry you.'],
    every: 64,
    closing: CLOSING,
  },
  {
    id: 'body-scan',
    title: 'Body scan',
    blurb: 'Move attention slowly from head to toe and let each part soften.',
    emoji: '🫧',
    minutes: [10, 5, 15],
    breath: null,
    opening: ['Lie down or sit back, and let your eyes close.', 'Take three slow breaths, and let the body grow heavy.'],
    middle: [
      'Bring your attention to the top of your head, and your forehead. Let it soften.',
      'Notice your jaw and your neck. Let them loosen.',
      'Move down to your shoulders. Let them drop away from your ears.',
      'Feel your arms and your hands. Heavy and warm.',
      'Notice your chest and belly rising and falling.',
      'Bring your attention to your lower back and hips. Let them release.',
      'Move down through your legs, your knees, your calves.',
      'Feel your feet, all the way to the tips of your toes.',
      'Now feel the whole body at once, resting and breathing.',
    ],
    every: 50,
    closing: CLOSING,
  },
  {
    id: 'focus',
    title: 'Focus',
    blurb: 'Count breaths from one to ten. Begin again whenever you drift.',
    emoji: '🎯',
    minutes: [5, 10, 15],
    breath: null,
    opening: ['Sit tall and let your gaze rest, or close your eyes.', 'Count each out-breath, from one up to ten, and then begin again.'],
    middle: ['If you lost count, that is fine. Start again at one.', 'Notice the breath at the tip of your nose.', 'Thoughts will come. Let them pass, and return to the count.'],
    every: 75,
    closing: CLOSING,
  },
  {
    id: 'kindness',
    title: 'Loving-kindness',
    blurb: 'Kind wishes for yourself, someone close, and everyone.',
    emoji: '💛',
    minutes: [10, 5, 15],
    breath: null,
    opening: ['Sit comfortably and bring a hand to your heart if you like.', 'Silently say to yourself: may I be happy, may I be well.'],
    middle: [
      'May I be safe. May I be at ease.',
      'Bring to mind someone you love. May you be happy. May you be well.',
      'Think of someone you barely know. May you be happy too.',
      'Think of someone you find difficult. May you be free from suffering.',
      'Let the wish spread to everyone, everywhere. May all beings be at peace.',
    ],
    every: 70,
    closing: CLOSING,
  },
  {
    id: 'sleep',
    title: 'Sleep wind-down',
    blurb: 'Four-seven-eight breathing to slow the body for sleep.',
    emoji: '🌙',
    minutes: [10, 5, 15],
    breath: { inhale: 4, holdIn: 7, exhale: 8, holdOut: 0 },
    opening: ['Lie down and get comfortable. Let the day go.', 'Breathe in for four, hold for seven, and out slowly for eight.'],
    middle: ['Let your body sink a little deeper with each breath.', 'Nothing to do now. Nowhere to be.', 'If you feel sleepy, let yourself drift.'],
    every: 90,
    closing: ['Let the breath find its own slow rhythm.', 'Rest here as long as you like. Good night.'],
  },
];

export function getMeditation(id: string): Meditation | undefined {
  return MEDITATIONS.find((m) => m.id === id);
}

export interface Prompt {
  /** Seconds from the start. */
  at: number;
  text: string;
}

/**
 * When each prompt is said, over `totalSec`.
 *
 * Opening lines are 12 s apart from a 2 s start; closing lines are 12 s apart
 * and end 8 s before the bell; the middle cycles through its lines every
 * `every` seconds in the space between, keeping clear of both ends. A short
 * session simply says fewer middle lines.
 */
export function promptSchedule(med: Meditation, totalSec: number): Prompt[] {
  const GAP = 12;
  const out: Prompt[] = med.opening.map((text, i) => ({ at: 2 + i * GAP, text }));
  const openEnd = 2 + med.opening.length * GAP;
  const closeStart = Math.max(openEnd, totalSec - 8 - (med.closing.length - 1) * GAP);

  let i = 0;
  for (let at = openEnd + med.every / 2; at < closeStart - GAP; at += med.every) {
    out.push({ at: Math.round(at), text: med.middle[i % med.middle.length]! });
    i += 1;
  }
  med.closing.forEach((text, j) => out.push({ at: closeStart + j * GAP, text }));
  return out.filter((p) => p.at < totalSec);
}

/** Where in the breath cycle `sec` falls, and how far through that phase (0..1). */
export function breathAt(pattern: BreathPattern, sec: number): { phase: BreathPhase; progress: number; phaseSec: number } {
  const phases: [BreathPhase, number][] = (
    [
      ['inhale', pattern.inhale],
      ['holdIn', pattern.holdIn],
      ['exhale', pattern.exhale],
      ['holdOut', pattern.holdOut],
    ] as [BreathPhase, number][]
  ).filter(([, s]) => s > 0);
  const cycle = phases.reduce((a, [, s]) => a + s, 0);
  let t = cycle === 0 ? 0 : ((sec % cycle) + cycle) % cycle;
  for (const [phase, len] of phases) {
    if (t < len) return { phase, progress: t / len, phaseSec: len };
    t -= len;
  }
  const last = phases[phases.length - 1] ?? ['inhale', 1];
  return { phase: last[0], progress: 1, phaseSec: last[1] };
}

/* ------------------------------------------------------------------ *
 * The log and the streak
 * ------------------------------------------------------------------ */

export interface MindfulEntry {
  /** `YYYY-MM-DD`, local. */
  day: string;
  kind: 'yoga' | 'meditation';
  /** Flow or meditation id. */
  id: string;
  minutes: number;
  /** Yoga alignment score, 0..100. */
  score?: number;
}

/** Keep the log bounded; the streak and the week never look further back. */
export const MAX_ENTRIES = 400;

export function appendEntry(entries: readonly MindfulEntry[], entry: MindfulEntry): MindfulEntry[] {
  return [...entries, entry].slice(-MAX_ENTRIES);
}

/**
 * Consecutive days with any practice, counting back from today — or from
 * yesterday when today isn't done yet, so the streak doesn't read 0 all morning.
 */
export function mindfulStreak(entries: readonly MindfulEntry[], today: string): number {
  const days = new Set(entries.map((e) => e.day));
  let day = days.has(today) ? today : previousDay(today);
  let n = 0;
  while (days.has(day)) {
    n += 1;
    day = previousDay(day);
  }
  return n;
}

/** Minutes practised over the last seven days, today included. */
export function weekMinutes(entries: readonly MindfulEntry[], today: string): number {
  const week = new Set<string>();
  let day = today;
  for (let i = 0; i < 7; i++) {
    week.add(day);
    day = previousDay(day);
  }
  return entries.reduce((a, e) => (week.has(e.day) ? a + e.minutes : a), 0);
}

/** Best yoga score for a flow, or null if it has never been finished. */
export function bestScore(entries: readonly MindfulEntry[], flowId: string): number | null {
  let best: number | null = null;
  for (const e of entries) {
    if (e.kind === 'yoga' && e.id === flowId && e.score !== undefined) best = Math.max(best ?? 0, e.score);
  }
  return best;
}

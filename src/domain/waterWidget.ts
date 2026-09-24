/**
 * The "partner today" home-screen widget's payload: their water, steps and
 * reps as three activity rings around their water bear, each beside mine.
 *
 * Built in two places from the same function, so the two can never disagree:
 *
 *  - the *receiver's* app, from the partner's slice of the couple document,
 *    whenever Home has it — this copy also carries my own numbers (`me*`); and
 *  - the *sender's* app, which ships it inside a silent push the moment their
 *    water, steps or reps move, so the partner's widget changes even while
 *    their app is closed. The native messaging service writes it straight
 *    into the widget's storage, keeping the `me*` fields it already had.
 *
 * Everything the widget draws is decided here: the words are phrased and the
 * colours resolved, because the Kotlin that renders it cannot be unit-tested
 * from this repo. The native side only decides what belongs to draw time —
 * is this still today, and is the partner active recently enough to animate.
 */

import { DRINK_META, parseDrinkKind } from '@/domain/drinkKinds';
import { DEFAULT_DAILY_GOAL_ML, MAX_DAILY_GOAL_ML, MIN_DAILY_GOAL_ML, formatMl } from '@/domain/hydration';
import { DEFAULT_STEP_GOAL, formatSteps } from '@/domain/steps';

/** The reps ring closes here — a solid day's work across any movements. */
export const REPS_RING_GOAL = 100;

/** How long after activity the widget keeps its micro-animations going. */
export const WATER_WIDGET_LIVE_MS = 15 * 60 * 1000;

export interface WaterWidgetSnapshot {
  /** Whose day this is, trimmed and fallback-applied. */
  name: string;
  /** The eyebrow, "nkll · Today" — the widget only upper-cases it. */
  title: string;
  /** `YYYY-MM-DD` the numbers belong to; the widget empties itself on another day. */
  day: string;

  /* Water — also fills the bear. */
  /** "1.25 L". */
  amount: string;
  /** "of 2 L". */
  goal: string;
  /** "750 ml to go", "Goal met 🎉", or "No drinks yet". */
  status: string;
  /** How full the bear and the water ring are, 0..1. */
  pct: number;
  met: boolean;
  /** The drinks as bands, bottom to top: colour, and top as a fraction of the bear. */
  layers: { c: string; t: number }[];
  /** "☕ Coffee · 250 ml", or ''. */
  last: string;
  /** When that drink was logged, epoch ms; 0 when unknown. */
  lastAt: number;

  /* Steps. */
  /** "6,240", or "—" when their phone is not sharing a count. */
  steps: string;
  /** "of 8,000 steps", or "steps · not shared" — the row names its metric. */
  stepsGoal: string;
  stepsPct: number;

  /* Reps. */
  /** "85". */
  reps: string;
  /** "reps · Squat" (their main movement today), or "reps". */
  repsDetail: string;
  repsPct: number;

  /** The line under the rows: all rings closed, the last drink, or water's status. */
  footer: string;
  /** A time to append to the footer ("· 3:42 PM"), epoch ms; 0 for none. */
  footerAt: number;
  /** Latest activity — a drink or a finished set — epoch ms; 0 when unknown. */
  activeAt: number;
  /** Every ring closed today. */
  allMet: boolean;

  /* My numbers, for the head-to-head: only the receiver's own app knows them,
     so a push-built copy leaves them '' and the native side keeps the old. */
  meWater: string;
  meSteps: string;
  meReps: string;

  /**
   * The version of the state this shows — the writer's `rev`, 0 if unknown.
   * The native side keeps whichever copy of today has the higher one.
   */
  rev: number;
  /** When this was built, epoch ms. */
  updatedAt: number;
}

export interface WaterWidgetInput {
  name: string;
  day: string;
  ml: number;
  goalMl?: number | null;
  /** Bottom-to-top drink layers, as they sit on the couple document. */
  layers?: readonly { k: string; ml: number }[];
  /** The most recent drink, when known. */
  last?: { k?: string | null; ml: number; at: number } | null;
  /** Their steps today; null when not shared or not countable. */
  steps?: number | null;
  /** Their reps today, and their main movement's label. */
  reps?: number | null;
  topExercise?: string | null;
  /** When they last finished a set, epoch ms. */
  trainedAt?: number | null;
  /** My own numbers, when this copy is built on my phone. */
  me?: { ml: number; steps: number | null; reps: number } | null;
  /** The state's version; see `WaterWidgetSnapshot.rev`. */
  rev?: number;
}

function sanitizeGoal(goal: number | null | undefined): number {
  return typeof goal === 'number' && Number.isFinite(goal) && goal >= MIN_DAILY_GOAL_ML && goal <= MAX_DAILY_GOAL_ML
    ? goal
    : DEFAULT_DAILY_GOAL_ML;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const count = (n: number | null | undefined) =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
const time = (n: number | null | undefined) =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : 0;

export function buildWaterWidgetSnapshot(input: WaterWidgetInput, now = Date.now()): WaterWidgetSnapshot {
  const name = input.name.trim() || 'Your partner';
  const ml = count(input.ml);
  const goalMl = sanitizeGoal(input.goalMl);
  const pct = Math.min(1, ml / goalMl);
  const met = ml >= goalMl;

  /* Bands share the fill in proportion to their volume. Older apps publish no
     layers, and a total with none reads as all water — never an empty bear
     beside a number that says otherwise. */
  const raw = (input.layers ?? []).filter((l) => Number.isFinite(l.ml) && l.ml > 0);
  const bands = raw.length > 0 ? raw : ml > 0 ? [{ k: 'water', ml }] : [];
  const sum = bands.reduce((s, l) => s + l.ml, 0);
  let acc = 0;
  const layers = bands.map((l, i) => {
    acc += l.ml;
    /* The last band lands exactly on the fill line, so rounding never leaves
       a sliver of glass between the drinks and the surface. */
    const t = i === bands.length - 1 ? pct : (acc / sum) * pct;
    return { c: DRINK_META[parseDrinkKind(l.k)].color, t: round3(t) };
  });

  const status = ml <= 0 ? 'No drinks yet' : met ? 'Goal met 🎉' : `${formatMl(goalMl - ml)} to go`;

  const last = input.last && ml > 0 && input.last.ml > 0 ? input.last : null;
  const lastMeta = last ? DRINK_META[parseDrinkKind(last.k)] : null;
  const lastText = last && lastMeta ? `${lastMeta.emoji} ${lastMeta.label} · ${formatMl(last.ml)}` : '';
  const lastAt = last ? time(last.at) : 0;

  /* Steps: an absent count means "their phone cannot say" or "not shared",
     never zero steps — the ring stays empty and the row says so. */
  const stepsKnown = typeof input.steps === 'number' && Number.isFinite(input.steps) && input.steps >= 0;
  const steps = stepsKnown ? Math.round(input.steps as number) : 0;
  const stepsPct = stepsKnown ? Math.min(1, steps / DEFAULT_STEP_GOAL) : 0;

  const reps = count(input.reps);
  const repsPct = Math.min(1, reps / REPS_RING_GOAL);
  const top = input.topExercise?.trim();

  const allMet = met && stepsKnown && steps >= DEFAULT_STEP_GOAL && reps >= REPS_RING_GOAL;
  const footer = allMet ? 'Closed every ring today 🎉' : lastText || status;
  const footerAt = !allMet && lastText ? lastAt : 0;

  const me = input.me ?? null;

  return {
    name,
    title: `${name} · Today`,
    day: input.day,
    amount: formatMl(ml),
    goal: `of ${formatMl(goalMl)}`,
    status,
    pct: round3(pct),
    met,
    layers,
    last: lastText,
    lastAt,
    steps: stepsKnown ? formatSteps(steps) : '—',
    stepsGoal: stepsKnown ? `of ${formatSteps(DEFAULT_STEP_GOAL)} steps` : 'steps · not shared',
    stepsPct: round3(stepsPct),
    reps: String(reps),
    repsDetail: reps > 0 && top ? `reps · ${top}` : 'reps',
    repsPct: round3(repsPct),
    footer,
    footerAt,
    activeAt: Math.max(lastAt, time(input.trainedAt)),
    allMet,
    meWater: me ? formatMl(me.ml) : '',
    meSteps: me ? (me.steps != null && me.steps >= 0 ? formatSteps(me.steps) : '—') : '',
    meReps: me ? String(count(me.reps)) : '',
    rev: time(input.rev),
    updatedAt: now,
  };
}

/**
 * Today's reps from the local session log: the total, the movement with the
 * most reps, and when the latest set finished.
 */
export function repsOnDay<E extends string>(
  sessions: readonly { day: string; exercise: E; reps: number; completedAt?: string }[],
  day: string,
): { reps: number; top: E | null; trainedAt: number } {
  const byExercise = new Map<E, number>();
  let reps = 0;
  let trainedAt = 0;
  for (const s of sessions) {
    if (s.day !== day || !(s.reps > 0)) continue;
    reps += s.reps;
    byExercise.set(s.exercise, (byExercise.get(s.exercise) ?? 0) + s.reps);
    const at = s.completedAt ? Date.parse(s.completedAt) : NaN;
    if (Number.isFinite(at) && at > trainedAt) trainedAt = at;
  }
  let top: E | null = null;
  let best = 0;
  for (const [exercise, n] of byExercise) {
    if (n > best) {
      best = n;
      top = exercise;
    }
  }
  return { reps, top, trainedAt };
}

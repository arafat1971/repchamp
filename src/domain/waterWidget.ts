/**
 * The partner-water home-screen widget's payload.
 *
 * Built in two places from the same function, so the two can never disagree:
 *
 *  - the *receiver's* app, from the partner's slice of the couple document,
 *    whenever Home has it; and
 *  - the *sender's* app, which ships it inside a silent push the moment a
 *    drink is logged, so the partner's widget moves even while their app is
 *    closed. The native messaging service writes it straight into the
 *    widget's SharedPreferences — no JavaScript runs on that side.
 *
 * Everything the widget draws is decided here: the words are already phrased
 * and the colours already resolved, because the Kotlin that renders it cannot
 * be unit-tested from this repo. The native side only does the two things
 * that must happen at draw time: is this still today, and is it still fresh
 * enough to animate.
 */

import { DRINK_META, parseDrinkKind } from '@/domain/drinkKinds';
import { DEFAULT_DAILY_GOAL_ML, MAX_DAILY_GOAL_ML, MIN_DAILY_GOAL_ML, formatMl } from '@/domain/hydration';

export interface WaterWidgetSnapshot {
  /** Whose bear this is, already trimmed and fallback-applied. */
  name: string;
  /** The eyebrow, "Nkll’s water" — the widget only upper-cases it. */
  title: string;
  /** `YYYY-MM-DD` the totals belong to; the widget empties itself on another day. */
  day: string;
  /** "1.25 L" — the big number. */
  amount: string;
  /** "of 2 L". */
  goal: string;
  /** "750 ml to go", "Goal met 🎉", or "No drinks yet today". */
  status: string;
  /** "☕ Coffee · 250 ml", or '' when nothing is known. */
  last: string;
  /** When that drink was logged, epoch ms; 0 when unknown. */
  lastAt: number;
  /** How full the bear is, 0..1. */
  pct: number;
  met: boolean;
  /**
   * The drinks as bands, bottom to top: `c` a colour, `t` the band's top as a
   * fraction of the whole bear. The last band's `t` equals `pct`.
   */
  layers: { c: string; t: number }[];
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
  /** The state's version; see `WaterWidgetSnapshot.rev`. */
  rev?: number;
}

/** How long after a drink the widget keeps its bubbles and live dot going. */
export const WATER_WIDGET_LIVE_MS = 15 * 60 * 1000;

function sanitizeGoal(goal: number | null | undefined): number {
  return typeof goal === 'number' && Number.isFinite(goal) && goal >= MIN_DAILY_GOAL_ML && goal <= MAX_DAILY_GOAL_ML
    ? goal
    : DEFAULT_DAILY_GOAL_ML;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function buildWaterWidgetSnapshot(input: WaterWidgetInput, now = Date.now()): WaterWidgetSnapshot {
  const name = input.name.trim() || 'Your partner';
  const ml = Number.isFinite(input.ml) && input.ml > 0 ? Math.round(input.ml) : 0;
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

  const status =
    ml <= 0 ? 'No drinks yet today' : met ? 'Goal met 🎉' : `${formatMl(goalMl - ml)} to go`;

  const last = input.last && ml > 0 && input.last.ml > 0 ? input.last : null;
  const lastMeta = last ? DRINK_META[parseDrinkKind(last.k)] : null;

  return {
    name,
    title: `${name}${/s$/i.test(name) ? '’' : '’s'} water`,
    day: input.day,
    amount: formatMl(ml),
    goal: `of ${formatMl(goalMl)}`,
    status,
    last: last && lastMeta ? `${lastMeta.emoji} ${lastMeta.label} · ${formatMl(last.ml)}` : '',
    lastAt: last && Number.isFinite(last.at) ? last.at : 0,
    pct: round3(pct),
    met,
    layers,
    rev: typeof input.rev === 'number' && Number.isFinite(input.rev) && input.rev > 0 ? Math.round(input.rev) : 0,
    updatedAt: now,
  };
}

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
import { HOT_C, WEATHER_FRESH_MS, weatherEmoji, type WeatherKind } from '@/domain/weather';
import { occasionLine, seasonFor, type Occasion, type Season } from '@/domain/season';

/** The reps ring closes here — a solid day's work across any movements. */
export const REPS_RING_GOAL = 100;

/** The widget's looks, chosen on this phone. */
export const WIDGET_THEMES = ['glass', 'sunset', 'ocean', 'dark', 'light', 'auto'] as const;

/**
 * What the scene sits on: a pane of liquid glass (translucent, tinted to the
 * hour, lit at the edge), nothing at all (the island floats on the
 * wallpaper), or its own sky.
 */
export const WIDGET_SURFACES = ['glass', 'float', 'sky'] as const;
export type WidgetSurface = (typeof WIDGET_SURFACES)[number];
export type WidgetTheme = (typeof WIDGET_THEMES)[number];

/**
 * The widget's layouts: "scene" is an illustrated scene under the real sky —
 * both bears on a hill in a tug-of-war over water; "duo" puts them face to
 * face with a tug bar per metric; "rings" is the partner's day as activity
 * rings around their bear. All three carry the quick-drink button or tap.
 */
export const WIDGET_LAYOUTS = ['scene', 'duo', 'rings'] as const;
export type WidgetLayout = (typeof WIDGET_LAYOUTS)[number];

export interface WidgetStyle {
  layout: WidgetLayout;
  /** Card colours: follow the system, or pin one. */
  theme: WidgetTheme;
  /** Show the steps ring and row. */
  showSteps: boolean;
  /** Show the reps ring and row. */
  showReps: boolean;
  /** Show my numbers beside theirs. */
  showMine: boolean;
  /** Micro-animations after activity. */
  motion: boolean;
  /** Paint the real local weather (opt-in; asks for approximate location). */
  weather: boolean;
  /** What the scene sits on — see `WIDGET_SURFACES`. */
  surface: WidgetSurface;
}

export const DEFAULT_WIDGET_STYLE: WidgetStyle = {
  layout: 'scene',
  theme: 'sunset',
  showSteps: true,
  showReps: true,
  showMine: true,
  motion: true,
  weather: false,
  surface: 'glass',
};

/** How long after activity the widget keeps its micro-animations going. */
export const WATER_WIDGET_LIVE_MS = 15 * 60 * 1000;

export interface WaterWidgetSnapshot {
  /** Whose day this is, trimmed and fallback-applied. */
  name: string;
  /** The rings layout's title, "nkll · Today". */
  title: string;
  /** The duo layout's title, "nkll vs you". */
  vs: string;
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

  /* The duo: raw numbers so the native side can draw the tug-of-war and
     crown the leader itself — a partner's push replaces their numbers, and
     the comparison must follow at once rather than wait for this app. */
  /** Their water today, ml. */
  waterMl: number;
  /** Their steps, or -1 when not shared. */
  stepsN: number;
  /** Their reps today. */
  repsN: number;
  /** Whether the me* fields are real — false on a partner-built copy. */
  hasMe: boolean;
  meWaterMl: number;
  /** My steps, or -1 when unknown. */
  meStepsN: number;
  meRepsN: number;
  /** My bear: fill, goal reached, and drink bands, as for theirs. */
  mePct: number;
  meMet: boolean;
  meLayers: { c: string; t: number }[];
  /** The rivalry line under the bears — who leads, and a reason to act. */
  duel: string;
  /**
   * Days in a row both bears were filled, as this phone has seen it; 0 for
   * none. Unlocks the bears' outfits: sunglasses at 3, crowns at 7.
   */
  streak: number;
  /** When my latest drink today was logged, epoch ms; 0 when unknown. */
  meLastAt: number;
  /**
   * When the partner last splashed me (a water nudge), epoch ms; 0 for none.
   * Hearts float over my bear for a while after it.
   */
  cheerAt: number;
  /** Today's visitor in the scene, the same all day: 0 butterfly, 1 ladybug, 2 mushroom, 3 snail. */
  visitor: number;

  /* The look, flat so the native side reads it without nesting. A copy
     built on the partner's phone has `styled: false`, and the native side
     keeps the style it already had. */
  styled: boolean;
  layout: WidgetLayout;
  theme: WidgetTheme;
  showSteps: boolean;
  showReps: boolean;
  showMine: boolean;
  motion: boolean;
  weather: boolean;
  surface: WidgetSurface;

  /** The season, for the island's colours and accents. */
  season: Season;
  /** Today's occasion: 'newyear', 'valentine', 'bond' (our monthly anniversary), or ''. */
  occasion: Occasion;

  /* The sky's weather, when "Real weather" is on and a reading is fresh:
     '' for the plain sky. */
  sky: string;
  /** "☀️ 31°", or '' without a reading. */
  temp: string;

  /**
   * The meadow: flowers each earlier day this week left, Monday first, seven
   * slots (today and later are 0).
   */
  meadow: number[];

  /** When they last sent me a reaction, epoch ms; 0 for none. */
  reactAt: number;
  /** The reaction itself, "❤️". */
  reactEmoji: string;

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
  me?: {
    ml: number;
    steps: number | null;
    reps: number;
    goalMl?: number | null;
    layers?: readonly { k: string; ml: number }[];
    /** When my latest drink today was logged. */
    lastAt?: number | null;
  } | null;
  /** The state's version; see `WaterWidgetSnapshot.rev`. */
  rev?: number;
  /** The shared streak, when this copy is built on my phone. */
  streak?: number;
  /** When they last splashed me — see `WaterWidgetSnapshot.cheerAt`. */
  cheerAt?: number | null;
  /** Their latest reaction to me. */
  react?: { at: number; emoji: string } | null;
  /** This week, as this phone saw it: the meadow, and Sunday's wrap line. */
  week?: { meadow: number[]; wrap: string | null } | null;
  /** The season and today's occasion, when this copy is built on my phone. */
  calendar?: { season: Season; occasion: Occasion; bond: number } | null;
  /** The local weather, when on; ignored once older than three hours. */
  weather?: { kind: string; tempC: number; at: number } | null;
  /** My chosen look, when this copy is built on my phone. */
  style?: WidgetStyle | null;
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

  const layers = bands(input.layers, ml, pct);

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
  const meMl = me ? count(me.ml) : 0;
  const meGoal = sanitizeGoal(me?.goalMl);
  const mePct = me ? Math.min(1, meMl / meGoal) : 0;
  const meSteps = me && me.steps != null && Number.isFinite(me.steps) && me.steps >= 0 ? Math.round(me.steps) : -1;

  const fresh = lastAt > 0 && now - lastAt >= -60_000 && now - lastAt <= WATER_WIDGET_LIVE_MS;
  const cheerAt = time(input.cheerAt);
  const weather = input.weather && now - input.weather.at <= WEATHER_FRESH_MS ? input.weather : null;
  const react = input.react && time(input.react.at) > 0 && input.react.emoji ? { at: time(input.react.at), emoji: input.react.emoji.slice(0, 8) } : null;
  const meLastAt = me ? time(me.lastAt) : 0;
  const duel = duelLine({
    name,
    ml,
    met,
    reps,
    cheered: cheerAt > 0 && now - cheerAt >= -60_000 && now - cheerAt <= WATER_WIDGET_LIVE_MS,
    together: sippedTogether(lastAt, meLastAt, now),
    reacted: react && now - react.at >= -60_000 && now - react.at <= WATER_WIDGET_LIVE_MS ? react.emoji : null,
    wrap: input.week?.wrap ?? null,
    occasion: input.calendar ? occasionLine(input.calendar.occasion, input.calendar.bond) : null,
    hot: weather && weather.tempC >= HOT_C ? Math.round(weather.tempC) : null,
    fresh: fresh && lastMeta ? `${lastMeta.label.toLowerCase()} ${lastMeta.emoji}` : null,
    me: me ? { ml: meMl, met: meMl >= meGoal, reps: count(me.reps) } : null,
  });

  return {
    name,
    title: `${name} · Today`,
    vs: `${name} vs you`,
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
    waterMl: ml,
    stepsN: stepsKnown ? steps : -1,
    repsN: reps,
    hasMe: !!me,
    meWaterMl: meMl,
    meStepsN: meSteps,
    meRepsN: me ? count(me.reps) : 0,
    mePct: round3(mePct),
    meMet: !!me && meMl >= meGoal,
    meLayers: me ? bands(me.layers, meMl, mePct) : [],
    duel,
    streak: count(input.streak),
    cheerAt,
    meLastAt,
    season: input.calendar?.season ?? seasonFor(new Date(now)),
    occasion: input.calendar?.occasion ?? '',
    sky: weather?.kind ?? '',
    temp: weather ? `${weatherEmoji(weather.kind as WeatherKind)} ${Math.round(weather.tempC)}°` : '',
    meadow: input.week?.meadow ?? [0, 0, 0, 0, 0, 0, 0],
    reactAt: react?.at ?? 0,
    reactEmoji: react?.emoji ?? '',
    visitor: dailyVisitor(input.day),
    styled: !!input.style,
    ...(input.style ?? DEFAULT_WIDGET_STYLE),
    rev: time(input.rev),
    updatedAt: now,
  };
}

/**
 * Drinks as bands, bottom to top, sharing the fill in proportion to volume.
 *
 * Older apps publish no layers, and a total with none reads as all water —
 * never an empty bear beside a number that says otherwise. The last band
 * lands exactly on the fill line, so rounding never leaves a sliver of glass
 * between the drinks and the surface.
 */
function bands(
  input: readonly { k: string; ml: number }[] | undefined,
  ml: number,
  pct: number,
): { c: string; t: number }[] {
  const raw = (input ?? []).filter((l) => Number.isFinite(l.ml) && l.ml > 0);
  const list = raw.length > 0 ? raw : ml > 0 ? [{ k: 'water', ml }] : [];
  const sum = list.reduce((s, l) => s + l.ml, 0);
  let acc = 0;
  return list.map((l, i) => {
    acc += l.ml;
    const t = i === list.length - 1 ? pct : (acc / sum) * pct;
    return { c: DRINK_META[parseDrinkKind(l.k)].color, t: round3(t) };
  });
}

/** How close two drinks must be to count as sipping together. */
export const TOGETHER_MS = 10 * 60 * 1000;

/**
 * Both drank within ten minutes of each other, and the later sip was in the
 * last few minutes — a moment worth a clink, gone once it has passed.
 */
export function sippedTogether(theirs: number, mine: number, now: number): boolean {
  if (theirs <= 0 || mine <= 0) return false;
  if (Math.abs(theirs - mine) > TOGETHER_MS) return false;
  const latest = Math.max(theirs, mine);
  return now - latest >= -60_000 && now - latest <= WATER_WIDGET_LIVE_MS;
}

/**
 * The wardrobe: what a shared streak dresses the bears in, in order. Each
 * item is kept once reached; headwear shows the newest.
 */
export const WARDROBE = [
  { id: 'sunglasses', days: 3, emoji: '😎', label: 'Sunglasses' },
  { id: 'crown', days: 7, emoji: '👑', label: 'Crown' },
  { id: 'party-hat', days: 14, emoji: '🥳', label: 'Party hat' },
  { id: 'wings', days: 30, emoji: '🪽', label: 'Wings' },
] as const;

/** The next item a streak is working toward, or null when all are earned. */
export function nextOutfit(streak: number) {
  return WARDROBE.find((w) => streak < w.days) ?? null;
}

/** The scene's visitors, one per day. */
export const VISITORS = ['butterfly', 'ladybug', 'mushroom', 'snail'] as const;

/**
 * Today's visitor: the same all day, different from day to day, the same on
 * both phones — so "what's on the hill today" is a small shared surprise.
 */
export function dailyVisitor(day: string): number {
  let h = 0;
  for (let i = 0; i < day.length; i++) h = (h * 31 + day.charCodeAt(i)) >>> 0;
  return h % VISITORS.length;
}

/**
 * The rivalry line: who is ahead, and a reason to do something about it.
 *
 * Every branch is a fact already on the widget — a drink they just had, a
 * gap in water or reps — phrased as a nudge, never an invented deadline.
 * Without my numbers (a copy built on the partner's phone) it speaks about
 * them alone.
 */
export function duelLine(input: {
  name: string;
  ml: number;
  met: boolean;
  reps: number;
  /** "juice 🧃" when they drank in the last few minutes. */
  fresh: string | null;
  /** They splashed me in the last few minutes. */
  cheered?: boolean;
  /** We both drank within minutes of each other, just now. */
  together?: boolean;
  /** The reaction they just sent me, "❤️". */
  reacted?: string | null;
  /** Sunday's wrap line, when there is one. */
  wrap?: string | null;
  /** Today's occasion line ("3-month bond today 💞"), when there is one. */
  occasion?: string | null;
  /** The temperature, when it is hot enough to say so. */
  hot?: number | null;
  me: { ml: number; met: boolean; reps: number } | null;
}): string {
  const { name, ml, met, reps, fresh, me } = input;
  if (me && met && me.met) return 'Both bears full — dream team 🎉';
  if (input.cheered) return `${name} splashed you 💦 — drink up!`;
  if (input.reacted) return `${name} sent you ${input.reacted}`;
  if (input.together) return 'You sipped together 🥂 — cheers!';
  if (fresh) return `${name} just had ${fresh} — your move!`;
  if (!me) {
    if (met) return `${name} filled their bear 🎉 — can you?`;
    return ml > 0 ? `${name} is at ${formatMl(ml)} today 💧` : `${name} hasn’t had a sip yet ☀️`;
  }
  if (input.occasion) return input.occasion;
  if (input.wrap) return input.wrap;
  if (ml <= 0 && me.ml <= 0 && reps <= 0 && me.reps <= 0) return 'First sip wins the day ☀️';
  const gap = ml - me.ml;
  if (Math.abs(gap) >= 100) {
    return gap > 0 ? `${name} is ${formatMl(gap)} ahead 💧 catch up!` : `You’re ${formatMl(-gap)} ahead — keep it flowing 💪`;
  }
  if (input.hot != null && !(met && me.met)) return `It’s ${input.hot}° — both bears need extra 💧`;
  const repGap = reps - me.reps;
  if (Math.abs(repGap) >= 5) {
    return repGap > 0 ? `${name} out-repped you by ${repGap} 💪 your turn` : `You lead reps by ${-repGap} — ${name} owes you a set`;
  }
  return 'Neck and neck today 🤝';
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

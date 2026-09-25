/**
 * Our daily ritual: the small, healthy things two people do for each other's
 * bodies every day — drink, walk, move, stretch, eat something real, wind
 * down — ticked side by side.
 *
 * Three habits count themselves from what the app already knows (water
 * against your goal, steps against a walk goal, any reps), so nobody is asked
 * to tick what the phone saw them do. The rest are honest self-reports: a tick
 * is a promise kept, and the partner sees it.
 *
 * Walking is automatic where the phone can count steps and a tick where it
 * cannot — an unknown count is never read as "didn't walk".
 */

import { previousDay } from '@/domain/duoStreak';
import { isRecentlyActive } from '@/domain/presence';

export type HabitId =
  | 'water'
  | 'walk'
  | 'move'
  | 'stretch'
  | 'greens'
  | 'rest'
  | 'sleep'
  | 'breathe'
  | 'read'
  | 'outside'
  | 'nosugar'
  | 'thanks';

export interface Habit {
  id: HabitId;
  emoji: string;
  label: string;
  /** What "done" means, in a few words. */
  hint: string;
  /** Counted from app data, or ticked by hand. */
  auto: boolean;
}

/** The default day: the three counted habits and three to tick. Always six long. */
export const HABITS: readonly Habit[] = [
  { id: 'water', emoji: '💧', label: 'Hydrate', hint: 'Reach your water goal', auto: true },
  { id: 'walk', emoji: '👟', label: 'Walk', hint: '8,000 steps or a 20 min walk', auto: true },
  { id: 'move', emoji: '💪', label: 'Exercise', hint: 'Any set, any movement', auto: true },
  { id: 'stretch', emoji: '🧘', label: 'Stretch', hint: '5 minutes, head to toe', auto: false },
  { id: 'greens', emoji: '🥗', label: 'Eat real food', hint: 'Fruit or veg with a meal', auto: false },
  { id: 'rest', emoji: '🌙', label: 'Wind down', hint: 'Screens off before bed', auto: false },
];

/** What a couple can choose their three ticked habits from. */
export const CATALOG: readonly Habit[] = [
  HABITS[3]!,
  HABITS[4]!,
  HABITS[5]!,
  { id: 'sleep', emoji: '😴', label: 'Sleep 7 hours', hint: 'In bed in time for seven', auto: false },
  { id: 'breathe', emoji: '🌬️', label: 'Breathe', hint: 'Five quiet minutes', auto: false },
  { id: 'read', emoji: '📖', label: 'Read', hint: 'Ten pages of anything', auto: false },
  { id: 'outside', emoji: '🌤️', label: 'Get outside', hint: 'Ten minutes of daylight', auto: false },
  { id: 'nosugar', emoji: '🚫', label: 'No sugary drinks', hint: 'Water, tea or coffee instead', auto: false },
  { id: 'thanks', emoji: '💌', label: 'Say thanks', hint: 'Tell each other one good thing', auto: false },
];

const IDS = new Set<string>([...HABITS.map((h) => h.id), ...CATALOG.map((h) => h.id)]);
const PICKABLE = new Set<string>(CATALOG.map((h) => h.id));

/** Walk goals a couple can choose, in steps. */
export const WALK_GOALS = [5000, 8000, 10000] as const;

/**
 * The couple's plan: which three habits they tick, and the walk goal. One plan
 * for both — whoever changed it last sets it — so the table always compares
 * the same six habits side by side.
 */
export interface RitualPlan {
  picks: HabitId[];
  walkGoal: number;
  /** When it was chosen, epoch ms; the newer of the two members' plans wins. */
  at: number;
}

export const PICKS = 3;
export const DEFAULT_PLAN: RitualPlan = { picks: ['stretch', 'greens', 'rest'], walkGoal: 8000, at: 0 };

/** A plan from a synced document, or null when it is not a valid one. */
export function cleanPlan(raw: unknown): RitualPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  const { picks, walkGoal, at } = raw as { picks?: unknown; walkGoal?: unknown; at?: unknown };
  if (!Array.isArray(picks)) return null;
  const clean = picks.filter((p, i): p is HabitId => typeof p === 'string' && PICKABLE.has(p) && picks.indexOf(p) === i);
  if (clean.length !== PICKS) return null;
  if (typeof walkGoal !== 'number' || !(WALK_GOALS as readonly number[]).includes(walkGoal)) return null;
  return { picks: clean, walkGoal, at: typeof at === 'number' && Number.isFinite(at) ? at : 0 };
}

/** The plan both of us follow: the newer valid one, or the default. */
export function effectivePlan(mine: unknown, theirs: unknown): RitualPlan {
  const a = cleanPlan(mine);
  const b = cleanPlan(theirs);
  if (a && b) return a.at >= b.at ? a : b;
  return a ?? b ?? DEFAULT_PLAN;
}

/** The six habits a plan makes: the counted three, then the chosen three. */
export function planHabits(plan: RitualPlan = DEFAULT_PLAN): Habit[] {
  const walk = { ...HABITS[1]!, hint: `${plan.walkGoal.toLocaleString('en-US')} steps or a 20 min walk` };
  return [HABITS[0]!, walk, HABITS[2]!, ...plan.picks.map((id) => CATALOG.find((h) => h.id === id)!)];
}

/** Most ticks a day may carry — mirrored as a list size bound in firestore.rules. */
export const MAX_TICKS = 12;

/** The default walk goal, in steps. */
export const WALK_GOAL = DEFAULT_PLAN.walkGoal;

/** Hand ticks from a synced document: known ids only, once each. */
export function cleanTicks(raw: unknown): HabitId[] {
  if (!Array.isArray(raw)) return [];
  const out: HabitId[] = [];
  for (const v of raw) if (typeof v === 'string' && IDS.has(v) && !out.includes(v as HabitId)) out.push(v as HabitId);
  return out.slice(0, MAX_TICKS);
}

/** Add or remove one hand tick. */
export function toggleTick(ticks: readonly HabitId[], id: HabitId): HabitId[] {
  return ticks.includes(id) ? ticks.filter((t) => t !== id) : [...ticks, id];
}

export interface SideDay {
  /** Water today and the goal it fills against. Null when not shared. */
  ml: number | null;
  goalMl: number;
  /** Steps today; null when this phone cannot count or it is not shared. */
  steps: number | null;
  reps: number;
  /** Hand ticks for today. */
  ticks: readonly HabitId[];
}

export interface HabitState {
  habit: Habit;
  done: boolean;
  /** 0..1 for the counted habits, so a ring can fill before the tick. */
  progress: number;
  /** True when this side's state cannot be known (not shared). */
  unknown: boolean;
  /** Can this side tick it by hand right now? */
  tickable: boolean;
}

/** One side's ritual, habit by habit, under the couple's plan. */
export function ritualFor(side: SideDay, plan: RitualPlan = DEFAULT_PLAN): HabitState[] {
  return planHabits(plan).map((habit) => {
    const ticked = side.ticks.includes(habit.id);
    switch (habit.id) {
      case 'water': {
        if (side.ml == null) return { habit, done: false, progress: 0, unknown: true, tickable: false };
        const progress = side.goalMl > 0 ? Math.min(1, side.ml / side.goalMl) : 0;
        return { habit, done: progress >= 1, progress, unknown: false, tickable: false };
      }
      case 'walk': {
        // No count on this phone: the walk is a tick, like the others.
        if (side.steps == null) return { habit, done: ticked, progress: ticked ? 1 : 0, unknown: false, tickable: true };
        const progress = Math.min(1, side.steps / plan.walkGoal);
        return { habit, done: progress >= 1 || ticked, progress: ticked ? 1 : progress, unknown: false, tickable: progress < 1 };
      }
      case 'move':
        return { habit, done: side.reps > 0, progress: side.reps > 0 ? 1 : 0, unknown: false, tickable: false };
      default:
        return { habit, done: ticked, progress: ticked ? 1 : 0, unknown: false, tickable: true };
    }
  });
}

export function ritualScore(states: readonly HabitState[]): number {
  return states.filter((s) => s.done).length;
}

/**
 * The line over the ritual: where the two of you stand and the next step,
 * always something you can do rather than something to feel bad about.
 */
export function ritualLine(mine: number, theirs: number, name: string, total = HABITS.length): string {
  if (mine >= total && theirs >= total) return 'A perfect day, together.';
  if (mine >= total) return `You're done. ${total - theirs} left for ${name}.`;
  if (theirs >= total) return `${name} is done. ${total - mine} to go for a perfect day.`;
  if (mine === 0 && theirs === 0) return 'Nothing ticked yet today.';
  const left = total - mine;
  if (mine > theirs) return `You're ahead, ${mine} to ${theirs}. ${left} to go.`;
  if (theirs > mine) return `${name} is ahead, ${theirs} to ${mine}. ${left} to go.`;
  return `Level at ${mine} each. ${left} to go.`;
}

/* ------------------------------------------------------------------ *
 * Live together
 * ------------------------------------------------------------------ */

/** A heartbeat on this screen counts as "here" this long (two missed beats). */
export const HERE_WINDOW_MS = 75_000;
/** How often an open screen says it is still here. */
export const HERE_BEAT_MS = 30_000;

/** Is the partner on this screen, with me, right now? */
export function isHere(hereAt: number | null | undefined, now: number): boolean {
  return isRecentlyActive(hereAt ?? null, now, HERE_WINDOW_MS);
}

/** The emoji you can throw across in a live moment. */
export const POKES = ['❤️', '👏', '💪', '💧', '🔥', '😘'] as const;
export type Poke = (typeof POKES)[number];

export function cleanPoke(raw: unknown): { e: Poke; at: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const { e, at } = raw as { e?: unknown; at?: unknown };
  if (typeof e !== 'string' || !(POKES as readonly string[]).includes(e)) return null;
  if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0) return null;
  return { e: e as Poke, at };
}

/** A poke is shown once, and only while fresh — never replayed from yesterday. */
export const POKE_FRESH_MS = 60_000;

export function isNewPoke(poke: { at: number } | null, lastSeenAt: number, now: number): boolean {
  return !!poke && poke.at > lastSeenAt && now - poke.at <= POKE_FRESH_MS;
}

/** Local throttle so a held finger cannot flood the document. */
export const POKE_GAP_MS = 1200;

/* ------------------------------------------------------------------ *
 * The evening reminder
 * ------------------------------------------------------------------ */

/** 20:30 — after the training slot, early enough to still stretch and wind down. */
export const RITUAL_REMINDER_HOUR = 20;
export const RITUAL_REMINDER_MINUTE = 30;

/** "stretch", "stretch and wind down", "walk, stretch and wind down". */
function listOf(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/**
 * One evening line about what is left of today's ritual — or null when it is
 * all done and there is nothing to ask for. Names what is left by name, never
 * a guilt line, and mentions the partner only as company: where they are, not
 * what I owe.
 */
export function buildRitualReminder(input: {
  mine: readonly HabitState[];
  /** The partner's score, when paired and known. */
  theirs: { name: string; score: number } | null;
}): { title: string; body: string } | null {
  const total = input.mine.length;
  const left = input.mine.filter((s) => !s.done);
  if (left.length === 0) return null;

  const doable = left.map((s) => s.habit.label.toLowerCase());
  const what = listOf(doable);
  const them = input.theirs;

  if (them && them.score >= total) {
    return {
      title: `${them.name} finished the ritual 🏆`,
      body: `Just ${what} left for a perfect day together.`,
    };
  }
  if (left.length === 1) {
    return {
      title: 'One more for a perfect day ✨',
      body: them ? `Just ${what}. ${them.name} is at ${them.score}/${total}.` : `Just ${what}.`,
    };
  }
  return {
    title: `${total - left.length}/${total} today — ${left.length} to go`,
    body: them ? `Still time for ${what}. ${them.name} is at ${them.score}/${total} 💞` : `Still time for ${what}.`,
  };
}

/* ------------------------------------------------------------------ *
 * Better, week on week
 * ------------------------------------------------------------------ */

/** One day's ritual scores as this phone saw them; -1 when a side is unknown. */
export interface RitualDay {
  me: number;
  them: number;
}

/**
 * Record a day's scores as last seen. Latest, not best: a tick taken back was a
 * mistake, not an achievement. Past days freeze on their own — nothing writes
 * to them once the day has turned.
 */
export function withRitualDay(
  history: Readonly<Record<string, RitualDay>>,
  day: string,
  seen: RitualDay,
  keepDays = 60,
): Record<string, RitualDay> {
  const prev = history[day];
  // An unknown side keeps what was known earlier in the day.
  const next: RitualDay = prev ? { me: seen.me >= 0 ? seen.me : prev.me, them: seen.them >= 0 ? seen.them : prev.them } : seen;
  if (prev && prev.me === next.me && prev.them === next.them) return history as Record<string, RitualDay>;
  const merged = { ...history, [day]: next };
  const keys = Object.keys(merged).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - keepDays))) delete merged[k];
  return merged;
}

/** The last `n` day keys, oldest first, today last. */
export function lastDays(today: string, n: number): string[] {
  const out = [today];
  for (let i = 1; i < n; i++) out.unshift(previousDay(out[0]!));
  return out;
}

export interface RitualWeek {
  days: { day: string; me: number; them: number; perfect: boolean }[];
  perfectDays: number;
  /** Average habits a day for me over the 7 days vs the 7 before; null without enough history. */
  trend: { now: number; before: number } | null;
}

/**
 * The last seven days of the ritual, and whether I am doing better than the
 * week before. The comparison needs at least three recorded days on each side
 * — a trend from one day is noise dressed as insight.
 */
export function ritualWeek(history: Readonly<Record<string, RitualDay>>, today: string, total = HABITS.length): RitualWeek {
  const keys = lastDays(today, 14);
  const recent = keys.slice(7);
  const earlier = keys.slice(0, 7);
  const days = recent.map((day) => {
    const h = history[day];
    const me = h ? Math.max(0, h.me) : 0;
    const them = h ? Math.max(0, h.them) : 0;
    return { day, me, them, perfect: me >= total && them >= total };
  });
  const avg = (ks: string[]) => {
    const seen = ks.map((k) => history[k]).filter((h): h is RitualDay => !!h && h.me >= 0);
    return seen.length >= 3 ? seen.reduce((s, h) => s + h.me, 0) / seen.length : null;
  };
  const now = avg(recent);
  const before = avg(earlier);
  return {
    days,
    perfectDays: days.filter((d) => d.perfect).length,
    trend: now != null && before != null ? { now, before } : null,
  };
}

/** The trend in words: up is celebrated, flat is steady, down is tomorrow. */
export function trendLine(trend: RitualWeek['trend']): string {
  if (!trend) return 'Your trend shows after a few days.';
  const diff = Math.round((trend.now - trend.before) * 10) / 10;
  if (diff >= 0.3) return `Up ${diff} habits a day on last week.`;
  if (diff <= -0.3) return `Down ${Math.abs(diff)} a day on last week.`;
  return `Steady at ${Math.round(trend.now * 10) / 10} a day.`;
}

/* ------------------------------------------------------------------ *
 * The long view
 * ------------------------------------------------------------------ */

export interface Journey {
  /** The last 30 days, oldest first: both scores added, of `total * 2`. */
  days: { day: string; together: number }[];
  perfectDays: number;
  /** Days this phone has recorded at all. */
  tracked: number;
  /** The first recorded day, `YYYY-MM-DD`, or null. */
  since: string | null;
  /**
   * My habits a day over my first recorded week against my latest week —
   * null until each side has at least three days, so a single day is never
   * called a change.
   */
  change: { from: number; to: number } | null;
}

export function journey(history: Readonly<Record<string, RitualDay>>, today: string, total = HABITS.length): Journey {
  const keys = Object.keys(history).filter((k) => k <= today).sort();
  const days = lastDays(today, 30).map((day) => {
    const h = history[day];
    return { day, together: h ? Math.max(0, h.me) + Math.max(0, h.them) : 0 };
  });
  const perfectDays = keys.filter((k) => history[k]!.me >= total && history[k]!.them >= total).length;
  const avg = (ks: string[]) => {
    const seen = ks.map((k) => history[k]!).filter((h) => h.me >= 0);
    return seen.length >= 3 ? seen.reduce((s, h) => s + h.me, 0) / seen.length : null;
  };
  const first = avg(keys.slice(0, 7));
  const latest = keys.length >= 10 ? avg(keys.slice(-7)) : null;
  return {
    days,
    perfectDays,
    tracked: keys.length,
    since: keys[0] ?? null,
    change: first != null && latest != null ? { from: Math.round(first * 10) / 10, to: Math.round(latest * 10) / 10 } : null,
  };
}

/* ------------------------------------------------------------------ *
 * Guided habits
 * ------------------------------------------------------------------ */

/** Habits the app can walk you through, ticked when you finish. */
export const GUIDED: readonly HabitId[] = ['breathe', 'rest'];

export function isGuided(id: HabitId): boolean {
  return GUIDED.includes(id);
}

export function guideFor(id: HabitId): { habit: HabitId; minutes: number; title: string; line: string } {
  if (id === 'rest') {
    return { habit: 'rest', minutes: 3, title: 'Wind down', line: 'Three slow minutes, then screens off for the night.' };
  }
  return { habit: 'breathe', minutes: 5, title: 'Breathe', line: 'Five quiet minutes. Follow the circle.' };
}

/**
 * Evening: after 21:00, with wind-down or sleep in today's plan and not yet
 * done, the screen offers to start winding down — never before, and never
 * once it is ticked.
 */
export function windDownDue(mine: readonly HabitState[], hour: number): boolean {
  if (hour < 21) return false;
  return mine.some((s) => (s.habit.id === 'rest' || s.habit.id === 'sleep') && !s.done);
}

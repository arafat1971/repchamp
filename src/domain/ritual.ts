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

import { isRecentlyActive } from '@/domain/presence';

export type HabitId = 'water' | 'walk' | 'move' | 'stretch' | 'greens' | 'rest';

export interface Habit {
  id: HabitId;
  emoji: string;
  label: string;
  /** What "done" means, in a few words. */
  hint: string;
  /** Counted from app data, or ticked by hand. */
  auto: boolean;
}

export const HABITS: readonly Habit[] = [
  { id: 'water', emoji: '💧', label: 'Hydrate', hint: 'Reach your water goal', auto: true },
  { id: 'walk', emoji: '👟', label: 'Walk', hint: '8,000 steps or a 20 min walk', auto: true },
  { id: 'move', emoji: '💪', label: 'Exercise', hint: 'Any set, any movement', auto: true },
  { id: 'stretch', emoji: '🧘', label: 'Stretch', hint: '5 minutes, head to toe', auto: false },
  { id: 'greens', emoji: '🥗', label: 'Eat real food', hint: 'Fruit or veg with a meal', auto: false },
  { id: 'rest', emoji: '🌙', label: 'Wind down', hint: 'Screens off before bed', auto: false },
];

const IDS = new Set<string>(HABITS.map((h) => h.id));

/** The walk goal, in steps. */
export const WALK_GOAL = 8000;

/** Hand ticks from a synced document: known ids only, once each. */
export function cleanTicks(raw: unknown): HabitId[] {
  if (!Array.isArray(raw)) return [];
  const out: HabitId[] = [];
  for (const v of raw) if (typeof v === 'string' && IDS.has(v) && !out.includes(v as HabitId)) out.push(v as HabitId);
  return out;
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

/** One side's ritual, habit by habit. */
export function ritualFor(side: SideDay): HabitState[] {
  return HABITS.map((habit) => {
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
        const progress = Math.min(1, side.steps / WALK_GOAL);
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
  if (mine >= total && theirs >= total) return 'A perfect day, together 🏆';
  if (mine >= total) return `You're done — ${total - theirs} left for ${name}. Cheer them on 💦`;
  if (theirs >= total) return `${name} is done — ${total - mine} to go and it's a perfect day ✨`;
  if (mine === 0 && theirs === 0) return 'A fresh day. First tick wins the morning ☀️';
  const left = total - mine;
  if (mine > theirs) return `You lead ${mine}–${theirs}. ${left} more for your perfect day`;
  if (theirs > mine) return `${name} leads ${theirs}–${mine}. ${left} more and you're level`;
  return `Level at ${mine} each — who takes the next one?`;
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

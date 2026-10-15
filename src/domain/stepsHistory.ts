/**
 * Step history — the days behind today's number.
 *
 * The pedometer only answers "how many today", so the history is built here,
 * one day at a time, from the reads the app already makes. Each day keeps the
 * highest count seen (a later read can only be the same or more, except after
 * a reboot on Android — and a lower figure then is a partial day, never a
 * correction) and the goal it was measured against.
 *
 * Everything below is pure and clock-injected, so the streaks, badges and the
 * shared journey are tested without a device.
 */

import { sanitizeStepGoal, sanitizeSteps } from '@/domain/steps';
import { stepsExtras } from '@/domain/stepsPace';

export interface StepDay {
  /** `YYYY-MM-DD`, local. */
  day: string;
  steps: number;
  goal: number;
}

/** How many days to keep. A year covers every badge and the yearly journey. */
export const HISTORY_LIMIT = 400;

/** Record a read. Keeps the day's max; newest first; capped. */
export function recordStepDay(history: readonly StepDay[], day: string, steps: number, goal: number): StepDay[] {
  const safe = sanitizeSteps(steps);
  if (safe == null) return [...history];
  const g = sanitizeStepGoal(goal);
  const existing = history.find((d) => d.day === day);
  if (existing && existing.steps >= safe && existing.goal === g) return [...history];
  const next: StepDay = { day, steps: Math.max(existing?.steps ?? 0, safe), goal: g };
  return [next, ...history.filter((d) => d.day !== day)]
    .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))
    .slice(0, HISTORY_LIMIT);
}

/** `YYYY-MM-DD` for a Date, local. */
export function keyOf(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The day `n` days before `day`. */
export function shiftDay(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y as number, (m as number) - 1, (d as number) - n, 12);
  return keyOf(date);
}

const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export interface WeekBar {
  day: string;
  /** One-letter weekday. */
  label: string;
  steps: number;
  goal: number;
  met: boolean;
  isToday: boolean;
}

/** The last 7 days, oldest first, ending today. Missing days read as 0. */
export function lastSevenDays(history: readonly StepDay[], today: string, goal: number): WeekBar[] {
  const byDay = new Map(history.map((d) => [d.day, d]));
  const out: WeekBar[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const day = shiftDay(today, i);
    const rec = byDay.get(day);
    const g = rec?.goal ?? goal;
    const steps = rec?.steps ?? 0;
    const [y, m, d] = day.split('-').map(Number);
    const wd = new Date(y as number, (m as number) - 1, d as number, 12).getDay();
    out.push({ day, label: WEEKDAY[wd] as string, steps, goal: g, met: steps >= g, isToday: i === 0 });
  }
  return out;
}

/**
 * Days in a row the goal was met, ending today (or yesterday, if today is
 * still in progress — a streak shouldn't read 0 at breakfast).
 */
export function goalStreak(history: readonly StepDay[], today: string): number {
  const byDay = new Map(history.map((d) => [d.day, d]));
  const met = (day: string) => {
    const r = byDay.get(day);
    return !!r && r.steps >= r.goal;
  };
  let start = met(today) ? today : shiftDay(today, 1);
  let n = 0;
  while (met(start)) {
    n += 1;
    start = shiftDay(start, 1);
  }
  return n;
}

export interface StepStats {
  best: StepDay | null;
  /** Average over the days recorded in the last 7, 0 when none. */
  weekAvg: number;
  weekTotal: number;
  /** Change vs the 7 days before, as a fraction (0.12 = +12%), or null. */
  weekTrend: number | null;
  lifetime: number;
  lifetimeKm: number;
  daysMet: number;
}

export function stepStats(history: readonly StepDay[], today: string): StepStats {
  let best: StepDay | null = null;
  let lifetime = 0;
  let daysMet = 0;
  let thisWeek = 0;
  let thisWeekDays = 0;
  let lastWeek = 0;
  const weekStart = shiftDay(today, 6);
  const prevStart = shiftDay(today, 13);
  for (const d of history) {
    lifetime += d.steps;
    if (d.steps >= d.goal) daysMet += 1;
    if (!best || d.steps > best.steps) best = d;
    if (d.day >= weekStart && d.day <= today) {
      thisWeek += d.steps;
      thisWeekDays += 1;
    } else if (d.day >= prevStart && d.day < weekStart) {
      lastWeek += d.steps;
    }
  }
  return {
    best,
    weekAvg: thisWeekDays > 0 ? Math.round(thisWeek / thisWeekDays) : 0,
    weekTotal: thisWeek,
    weekTrend: lastWeek > 0 ? (thisWeek - lastWeek) / lastWeek : null,
    lifetime,
    lifetimeKm: stepsExtras(lifetime).km,
    daysMet,
  };
}

/* ------------------------------------------------------------------ *
 * Badges
 * ------------------------------------------------------------------ */

export interface StepBadge {
  id: string;
  emoji: string;
  title: string;
  detail: string;
  earned: boolean;
  /** 0–1 toward it, for the locked ones. */
  progress: number;
}

export function stepBadges(history: readonly StepDay[], today: string): StepBadge[] {
  const stats = stepStats(history, today);
  const best = stats.best?.steps ?? 0;
  const streak = goalStreak(history, today);
  const bestStreak = longestStreak(history);
  const frac = (v: number, of: number) => Math.max(0, Math.min(1, v / of));
  const day = (id: string, emoji: string, title: string, n: number): StepBadge => ({
    id,
    emoji,
    title,
    detail: `${n.toLocaleString('en-US')} steps in a day`,
    earned: best >= n,
    progress: frac(best, n),
  });
  const run = (id: string, emoji: string, title: string, n: number): StepBadge => ({
    id,
    emoji,
    title,
    detail: `Goal met ${n} days in a row`,
    earned: Math.max(streak, bestStreak) >= n,
    progress: frac(Math.max(streak, bestStreak), n),
  });
  const km = (id: string, emoji: string, title: string, n: number): StepBadge => ({
    id,
    emoji,
    title,
    detail: `${n} km walked in total`,
    earned: stats.lifetimeKm >= n,
    progress: frac(stats.lifetimeKm, n),
  });
  return [
    day('first-5k', '👟', 'First 5K', 5000),
    day('ten-k', '🔟', '10K Club', 10000),
    day('fifteen-k', '🚀', 'Sky Walker', 15000),
    day('twenty-k', '🏔️', 'Summit Day', 20000),
    run('streak-3', '🔥', 'On a Roll', 3),
    run('streak-7', '📅', 'Full Week', 7),
    run('streak-30', '👑', 'Iron Habit', 30),
    km('km-42', '🏅', 'Marathon', 42),
    km('km-100', '💯', 'Century', 100),
    km('km-500', '🌍', 'Explorer', 500),
  ];
}

function longestStreak(history: readonly StepDay[]): number {
  const met = new Set(history.filter((d) => d.steps >= d.goal).map((d) => d.day));
  let best = 0;
  for (const day of met) {
    if (met.has(shiftDay(day, 1))) continue; // not the start of a run
    let n = 0;
    let cur = day;
    while (met.has(cur)) {
      n += 1;
      cur = shiftDay(cur, -1);
    }
    best = Math.max(best, n);
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * The journey — distance walked, as a trip
 * ------------------------------------------------------------------ */

/** Legs of a walk around famous places, cumulative km at each stop. */
export const JOURNEY: readonly { km: number; name: string; emoji: string }[] = [
  { km: 0, name: 'Your front door', emoji: '🏠' },
  { km: 5, name: 'Across Central Park', emoji: '🌳' },
  { km: 21, name: 'A half marathon', emoji: '🏃' },
  { km: 42, name: 'A full marathon', emoji: '🏅' },
  { km: 55, name: 'Across the English Channel', emoji: '🌊' },
  { km: 117, name: 'The length of Manhattan ×5', emoji: '🗽' },
  { km: 344, name: 'London to Paris', emoji: '🗼' },
  { km: 800, name: 'The Camino de Santiago', emoji: '⛪' },
  { km: 2200, name: 'The Great Wall (Ming)', emoji: '🏯' },
  { km: 3500, name: 'The Appalachian Trail', emoji: '⛰️' },
  { km: 40075, name: 'Around the Earth', emoji: '🌍' },
];

export interface JourneyPoint {
  km: number;
  from: (typeof JOURNEY)[number];
  to: (typeof JOURNEY)[number] | null;
  /** 0–1 between `from` and `to`. */
  progress: number;
  kmToNext: number;
}

export function journeyAt(km: number): JourneyPoint {
  const safe = Math.max(0, Number.isFinite(km) ? km : 0);
  let i = 0;
  while (i + 1 < JOURNEY.length && (JOURNEY[i + 1] as (typeof JOURNEY)[number]).km <= safe) i += 1;
  const from = JOURNEY[i] as (typeof JOURNEY)[number];
  const to = JOURNEY[i + 1] ?? null;
  const progress = to ? (safe - from.km) / (to.km - from.km) : 1;
  return { km: Math.round(safe * 10) / 10, from, to, progress, kmToNext: to ? Math.round((to.km - safe) * 10) / 10 : 0 };
}

/* ------------------------------------------------------------------ *
 * Walk sessions — "walk now", measured live
 * ------------------------------------------------------------------ */

/** Steps per minute → a label a person recognises. */
export function cadenceLabel(spm: number): { label: string; tone: 'idle' | 'stroll' | 'walk' | 'brisk' | 'run' } {
  if (spm < 20) return { label: 'Standing still', tone: 'idle' };
  if (spm < 80) return { label: 'Strolling', tone: 'stroll' };
  if (spm < 110) return { label: 'Walking', tone: 'walk' };
  if (spm < 140) return { label: 'Brisk walk', tone: 'brisk' };
  return { label: 'Running', tone: 'run' };
}

/**
 * Cadence from recent samples: steps per minute over the newest window.
 * Samples are `{ at: epoch ms, steps: day total }`, oldest first.
 */
export function cadence(samples: readonly { at: number; steps: number }[], windowMs = 30_000): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1] as { at: number; steps: number };
  let first = samples[0] as { at: number; steps: number };
  for (const s of samples) {
    if (last.at - s.at <= windowMs) {
      first = s;
      break;
    }
  }
  const dt = last.at - first.at;
  if (dt < 3000) return 0;
  return Math.max(0, Math.round(((last.steps - first.steps) / dt) * 60_000));
}

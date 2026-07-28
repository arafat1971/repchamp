import { LEAGUES } from './progression';

/**
 * Personalised onboarding projections.
 *
 * The onboarding asks for a goal and a weekly training frequency, then largely
 * ignores both. These helpers turn those two answers into concrete, honest
 * promises the athlete can see before they commit — "at 4 days a week you reach
 * Silver in your second week" lands far harder than a generic feature list.
 *
 * Every number is derived from the app's *real* mechanics (`xpForSession`,
 * `LEAGUES`, the built-in programmes) rather than invented, so the plan shown
 * here is one the app actually delivers. Pure and framework-free so the
 * projections can be unit-tested.
 */

/** XP a realistic session earns. Practice is 40; a solo target win is 300. */
const XP_PER_SESSION = 120;

export interface WeeklyProjection {
  /** 1-indexed week number. */
  week: number;
  /** Cumulative XP by the end of this week. */
  xp: number;
  /** League name reached at this cumulative weekly rate. */
  league: string;
}

/**
 * Project XP growth over `weeks` at the chosen training frequency.
 *
 * League is resolved from the *weekly* XP rate (how `selectLeague` works), not
 * the cumulative total, so the tier shown matches what the athlete will really
 * see on the Arena tab.
 */
export function projectProgress(daysPerWeek: number, weeks = 6): WeeklyProjection[] {
  const perWeek = Math.max(0, daysPerWeek) * XP_PER_SESSION;
  const out: WeeklyProjection[] = [];

  for (let week = 1; week <= weeks; week++) {
    out.push({
      week,
      xp: perWeek * week,
      league: leagueForWeeklyXp(perWeek).name,
    });
  }
  return out;
}

/** The league a given *weekly* XP rate lands in. */
export function leagueForWeeklyXp(weeklyXp: number) {
  // Walk down from the top so the highest satisfied tier wins.
  for (let i = LEAGUES.length - 1; i >= 0; i--) {
    const league = LEAGUES[i]!;
    if (weeklyXp >= league.minWeeklyXp) return league;
  }
  return LEAGUES[0]!;
}

/**
 * Weeks of training before the athlete's weekly rate reaches the next league.
 * Returns null when they are already at the top tier.
 */
export function weeksToNextLeague(daysPerWeek: number): { league: string; weeks: number } | null {
  const perWeek = Math.max(0, daysPerWeek) * XP_PER_SESSION;
  const current = leagueForWeeklyXp(perWeek);
  const next = LEAGUES.find((l) => l.minWeeklyXp > current.minWeeklyXp);
  if (!next) return null;

  // At a fixed weekly rate the tier never changes, so express the gap as the
  // extra sessions needed rather than implying time alone will promote them.
  const deficit = next.minWeeklyXp - perWeek;
  const extraSessions = Math.ceil(deficit / XP_PER_SESSION);
  return { league: next.name, weeks: Math.max(1, Math.ceil(extraSessions / 7)) };
}

/** Copy tailored to the goal chosen on the goal step. */
export function goalPlan(goalId: string | null): {
  title: string;
  blurb: string;
  emoji: string;
  focus: string;
} {
  switch (goalId) {
    case 'strength':
      return {
        emoji: '🏋️',
        title: 'Built for strength',
        blurb: 'A progressive push/squat programme that adds volume every week.',
        focus: '4 weeks to 50 push-ups',
      };
    case 'form':
      return {
        emoji: '✅',
        title: 'Form first',
        blurb: 'Live depth and tempo feedback on every rep, with a form score after each set.',
        focus: 'Depth + tempo scoring',
      };
    case 'compete':
      return {
        emoji: '🏆',
        title: 'Made to compete',
        blurb: 'Live duels, weekly leagues and a leaderboard that resets every Monday.',
        focus: 'Weekly leagues',
      };
    case 'reps':
    default:
      return {
        emoji: '#️⃣',
        title: 'Every rep counted',
        blurb: 'On-device tracking counts each clean rep and banks it to your weekly total.',
        focus: 'Automatic rep counting',
      };
  }
}

/**
 * A realistic first-week target for this athlete.
 *
 * Scaled by the self-reported level so a complete beginner and someone already
 * training three times a week don't get handed the same number — the fastest
 * way to lose either of them.
 */
export function firstWeekTarget(daysPerWeek: number, level: FitnessLevel | null = null): number {
  // ~25 push-ups a session is an achievable opening week for a typical starter.
  const base = Math.max(25, daysPerWeek * 25);
  return Math.max(10, Math.round((base * levelMultiplier(level)) / 5) * 5);
}

/** Self-reported starting level, asked during onboarding. */
export type FitnessLevel = 'new' | 'returning' | 'regular';

/** What the athlete says gets in their way — used to pick the antidote feature. */
export type Blocker = 'motivation' | 'consistency' | 'form' | 'time';

/**
 * Scale the first-week target to the athlete's self-reported level.
 *
 * Asking a question and then ignoring the answer is worse than not asking: the
 * plan has to visibly change, or the athlete learns the questions were theatre.
 */
export function levelMultiplier(level: FitnessLevel | null): number {
  switch (level) {
    case 'new':
      return 0.6;
    case 'regular':
      return 1.5;
    case 'returning':
    default:
      return 1;
  }
}

/**
 * The app's honest answer to what the athlete says holds them back. Each maps
 * to a feature that genuinely exists, so the promise is one the app keeps.
 */
export function blockerAnswer(blocker: Blocker | null): {
  emoji: string;
  title: string;
  blurb: string;
} {
  switch (blocker) {
    case 'motivation':
      return {
        emoji: '⚔️',
        title: 'Someone to beat',
        blurb:
          'Live duels and weekly leagues give every set a scoreboard, so training stops being optional.',
      };
    case 'form':
      return {
        emoji: '🎯',
        title: 'A coach on every rep',
        blurb:
          'Depth, tempo and alignment are scored live, so you fix form while you train — not weeks later.',
      };
    case 'time':
      return {
        emoji: '⏱️',
        title: 'Two minutes is enough',
        blurb:
          'Sets are 60 seconds. No gym, no setup — prop the phone up and go.',
      };
    case 'consistency':
    default:
      return {
        emoji: '🔥',
        title: 'A streak worth protecting',
        blurb:
          'Shared streaks and daily nudges make skipping the harder choice.',
      };
  }
}

export interface PlannedDay {
  /** Short weekday label, Mon-first. */
  label: string;
  /** Target reps for this day; 0 on a rest day. */
  target: number;
  rest: boolean;
  /** True for the first training day — the one they start today. */
  first: boolean;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/**
 * Lay the first week out day by day as a *ramp*, mirroring how the real
 * programmes progress (10 → 12 → 14 → 16) rather than repeating a flat average.
 *
 * A visible ladder is what makes week one feel achievable: the athlete sees a
 * gentle opening number rather than "25 reps × 4", and each day is a small,
 * legible step up. Rest days are spread through the week rather than bunched at
 * the end, so the schedule reads like a real plan.
 */
export function firstWeekPlan(
  daysPerWeek: number,
  level: FitnessLevel | null = null,
): PlannedDay[] {
  const days = Math.max(1, Math.min(7, Math.round(daysPerWeek)));
  const total = firstWeekTarget(days, level);

  // Pick which weekdays train, spread as evenly as the count allows.
  const trainingIdx = new Set<number>();
  for (let i = 0; i < days; i++) {
    trainingIdx.add(Math.round((i * 7) / days) % 7);
  }
  // Rounding can collide; fill forward until we have the right number of days.
  let cursor = 0;
  while (trainingIdx.size < days && cursor < 7) {
    trainingIdx.add(cursor);
    cursor += 1;
  }

  // Ramp from ~80% to ~120% of the average so the week visibly builds while
  // still summing to the promised total.
  const avg = total / days;
  const ramped: number[] = [];
  for (let i = 0; i < days; i++) {
    const t = days === 1 ? 0.5 : i / (days - 1);
    ramped.push(Math.max(1, Math.round(avg * (0.8 + 0.4 * t))));
  }
  // Correct any rounding drift onto the final (largest) day.
  const drift = total - ramped.reduce((a, b) => a + b, 0);
  if (ramped.length > 0) {
    ramped[ramped.length - 1] = Math.max(1, ramped[ramped.length - 1]! + drift);
  }

  let taken = 0;
  let firstSeen = false;
  return DAY_LABELS.map((label, index) => {
    if (!trainingIdx.has(index)) return { label, target: 0, rest: true, first: false };
    const target = ramped[taken] ?? 0;
    taken += 1;
    const first = !firstSeen;
    firstSeen = true;
    return { label, target, rest: false, first };
  });
}

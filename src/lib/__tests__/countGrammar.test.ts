/**
 * Count-bearing copy must read correctly at one.
 *
 * "1 reps" has now been fixed in seven places on this branch — `teaserLockLine`,
 * `startingPointProof`, the per-rep depth header, the couple contribution line,
 * the history row, the notifications row, the Home exercise tile — and every one
 * shipped past a green suite. It recurs because nothing states the rule: each
 * author pluralises the line in front of them and misses the next.
 * `app/couple/index.tsx` carried `{days === 1 ? 'day' : 'days'}` and a bare
 * `{reps} reps` in the *same sentence*.
 *
 * It is a small thing that lands in exactly the copy the app leans on to sound
 * precise: a win-back notification crediting a first set, a paid form report, a
 * shared couple card. Sloppiness there undercuts the specificity doing the
 * persuading.
 *
 * ## Why this tests behaviour, not source text
 *
 * A first attempt grepped every `.tsx` for an interpolated count before a bare
 * plural. It needed a fifteen-entry allowlist — fractions ("3 of 4 days"),
 * rates, debug logs, and thresholds where one is unreachable — and a test whose
 * allowlist is longer than its assertion teaches people to add to the allowlist.
 *
 * So this exercises the *pure copy builders* instead, at the count that actually
 * breaks. Every function here is reachable with a count of one, and each
 * assertion is a fact about what an athlete would read rather than a pattern
 * match. Screens are left to review; the domain is where the sentences live.
 */

import { formReportTeaser, teaserLockLine } from '@/domain/formReportTeaser';
import { startingPointProof, headlineProof } from '@/domain/progressProof';
import { buildDormantReminder } from '@/domain/dormantReminder';
import { buildWeeklyRecap } from '@/domain/reminderCopy';
import type { FormReport } from '@/vision/formScore';
import type { SessionSummary } from '@/state/profileStore';

let seq = 0;
function session(reps: number, day = '2026-09-01'): SessionSummary {
  return {
    id: `s${seq++}`,
    exercise: 'push',
    mode: 'solo',
    reps,
    opponentReps: null,
    opponentId: null,
    target: null,
    won: true,
    xp: 300,
    formScore: 90,
    durationSec: 60,
    completedAt: `${day}T07:00:00.000Z`,
    day,
  };
}

function oneRepReport(): FormReport {
  return {
    score: 70,
    grade: 'Solid',
    summary: 'One rep.',
    metrics: [
      { label: 'Depth', pct: 70 },
      { label: 'Alignment', pct: 70 },
      { label: 'Tempo', pct: 70 },
    ],
    bars: [{ height: 1, fullDepth: true }],
    tip: 'Tip.',
    fullDepthReps: 1,
    partialReps: 0,
  } as FormReport;
}

/** Any "1 <plural>" is wrong, whatever the noun. */
const SINGULAR_MISMATCH = /\b1 (reps|sets|days|sessions|duels|badges|weeks)\b/;

describe('copy reads correctly at a count of one', () => {
  it('the form-report teaser lock line', () => {
    const line = teaserLockLine(formReportTeaser(oneRepReport())!);
    expect(line).not.toMatch(SINGULAR_MISMATCH);
    expect(line).toContain('1 rep analysed');
  });

  it('the starting-point proof, which exists for exactly this athlete', () => {
    const line = startingPointProof([session(1)]);
    expect(line).not.toMatch(SINGULAR_MISMATCH);
    expect(line).toBe('Your first set was 1 rep');
  });

  it('the dormant win-back line built on it', () => {
    const copy = buildDormantReminder({ daysAway: 4, sessions: [session(1)], streak: 0 });
    expect(`${copy?.title} ${copy?.body}`).not.toMatch(SINGULAR_MISMATCH);
  });

  /* The remaining `headlineProof` tiers are threshold-guarded — three sets, a
     hundred reps, a three-day streak — so one is unreachable there. Asserted
     rather than assumed, because a future tier could lower a threshold and
     reintroduce the bug silently. */
  it('every headline tier, across the counts that can reach them', () => {
    const cases = [
      headlineProof([session(1)], 1),
      headlineProof([session(1), session(1), session(1)], 0),
      headlineProof([session(100)], 0),
      headlineProof([session(4), session(4), session(9)], 0),
    ];
    for (const line of cases) {
      if (line) expect(line).not.toMatch(SINGULAR_MISMATCH);
    }
  });

  it('the weekly recap, whatever it chooses to say', () => {
    for (const sessions of [[session(1)], [session(1), session(1), session(1)]]) {
      const copy = buildWeeklyRecap({ sessions, streak: 1 });
      expect(`${copy.title} ${copy.body}`).not.toMatch(SINGULAR_MISMATCH);
    }
  });
});

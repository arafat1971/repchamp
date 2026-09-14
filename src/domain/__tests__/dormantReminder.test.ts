import {
  DORMANT_AFTER_DAYS,
  buildDormantReminder,
  daysSinceLastSession,
} from '@/domain/dormantReminder';
import type { SessionSummary } from '@/state/profileStore';

/** Minimal record — only the fields the copy actually reads carry meaning. */
const session = (o: Partial<SessionSummary> = {}): SessionSummary => ({
  id: 'x',
  exercise: 'push',
  mode: 'practice',
  reps: 10,
  opponentReps: null,
  opponentId: null,
  target: null,
  won: false,
  xp: 10,
  formScore: 80,
  durationSec: 30,
  completedAt: '2026-09-01T10:00:00.000Z',
  day: '2026-09-01',
  ...o,
});

/** Four sessions with a real best-set gain — `headlineProof`'s strongest claim. */
const improving = [
  session({ id: 'a', reps: 4, completedAt: '2026-09-01T10:00:00.000Z', day: '2026-09-01' }),
  session({ id: 'b', reps: 5, completedAt: '2026-09-02T10:00:00.000Z', day: '2026-09-02' }),
  session({ id: 'c', reps: 11, completedAt: '2026-09-03T10:00:00.000Z', day: '2026-09-03' }),
  session({ id: 'd', reps: 12, completedAt: '2026-09-04T10:00:00.000Z', day: '2026-09-04' }),
];

describe('daysSinceLastSession', () => {
  it('counts whole days between two day keys', () => {
    expect(daysSinceLastSession('2026-09-01', '2026-09-04')).toBe(3);
    expect(daysSinceLastSession('2026-09-03', '2026-09-04')).toBe(1);
    expect(daysSinceLastSession('2026-09-04', '2026-09-04')).toBe(0);
  });

  /* The gap is measured at UTC noon precisely so a clock change inside the
     window cannot round three days down to two and silently skip the slot. */
  it('is not shifted by a DST boundary inside the window', () => {
    expect(daysSinceLastSession('2026-11-01', '2026-11-04')).toBe(3);
    expect(daysSinceLastSession('2026-03-08', '2026-03-11')).toBe(3);
  });

  it('crosses month and year ends', () => {
    expect(daysSinceLastSession('2026-08-30', '2026-09-02')).toBe(3);
    expect(daysSinceLastSession('2026-12-30', '2027-01-02')).toBe(3);
  });

  /* An athlete who has never finished a session is not dormant — they have not
     started, and a win-back push has nothing true to say to them. */
  it('is null without history', () => {
    expect(daysSinceLastSession(null, '2026-09-04')).toBeNull();
    expect(daysSinceLastSession(undefined, '2026-09-04')).toBeNull();
  });

  it('is null rather than NaN on a malformed key', () => {
    expect(daysSinceLastSession('not-a-day', '2026-09-04')).toBeNull();
    expect(daysSinceLastSession('2026-09-01', 'nonsense')).toBeNull();
  });

  /* A device clock rolled backwards must not produce a negative gap that reads
     as "trained in the future" downstream. */
  it('floors a backwards clock at zero', () => {
    expect(daysSinceLastSession('2026-09-10', '2026-09-04')).toBe(0);
  });
});

describe('buildDormantReminder', () => {
  it('states what they have, and does not fire before the threshold', () => {
    const copy = buildDormantReminder({ daysAway: DORMANT_AFTER_DAYS, sessions: improving });
    expect(copy).not.toBeNull();
    expect(copy?.title).toBe('Your progress is still here');
    expect(copy?.body).toBe(
      'Your best set has gone from 5 to 12 reps. Pick up where you left off.',
    );
    expect(
      buildDormantReminder({ daysAway: DORMANT_AFTER_DAYS - 1, sessions: improving }),
    ).toBeNull();
  });

  /* Two days away is a weekend and one is Tuesday. Firing earlier would tell an
     athlete who took a deliberate rest day that they have gone missing. */
  it('treats a rest day as a rest day', () => {
    expect(buildDormantReminder({ daysAway: 1, sessions: improving })).toBeNull();
    expect(buildDormantReminder({ daysAway: 2, sessions: improving })).toBeNull();
    expect(buildDormantReminder({ daysAway: 9, sessions: improving })).not.toBeNull();
  });

  /* The whole reason this slot exists rather than reusing the daily one: by day
     three the streak is already broken, so copy about progress "at risk" would
     be naming something already gone. Reps and best sets do not decay, and an
     athlete who returns to find nothing was lost disbelieves the next push. */
  it('never claims anything is being lost, risked, or is about to expire', () => {
    for (const daysAway of [3, 5, 14, 90]) {
      const copy = buildDormantReminder({ daysAway, sessions: improving, streak: 0 });
      const text = `${copy?.title} ${copy?.body}`.toLowerCase();
      /* Loss-directed words only. "gone" is deliberately absent: `headlineProof`
         says a best set "has gone from 5 to 12 reps", which is a growth claim,
         and banning the bare substring would forbid the sentence this slot
         exists to send. */
      for (const word of [
        'risk',
        'lose',
        'losing',
        'lost',
        'expire',
        'before it',
        "don't break",
        'last chance',
        'slipping away',
        'about to',
      ]) {
        expect(text).not.toContain(word);
      }
    }
  });

  /* The count is a fact about their absence, which they already know and did
     not enjoy. The title is for the part worth unlocking the phone to read. */
  it('does not count their absence back at them', () => {
    const copy = buildDormantReminder({ daysAway: 12, sessions: improving });
    expect(copy?.title).not.toContain('12');
    expect(copy?.body).not.toContain('12 days');
  });

  /* `headlineProof` returns null rather than inventing a milestone. An athlete
     with nothing earned yet should get zero notifications, not a generic line
     dressed up as one — the same refusal `buildWeeklyRecap` is tested for. */
  it('stays silent when there is no honest claim to make', () => {
    expect(buildDormantReminder({ daysAway: 30, sessions: [] })).toBeNull();
    expect(buildDormantReminder({ daysAway: 30, sessions: [session()] })).toBeNull();
  });

  it('says nothing when there is no history to measure from', () => {
    expect(buildDormantReminder({ daysAway: null, sessions: improving })).toBeNull();
  });

  /* `daysAway` arrives from arithmetic over a device clock, not a literal. */
  it('survives a non-finite or fractional gap', () => {
    expect(buildDormantReminder({ daysAway: Number.NaN, sessions: improving })).toBeNull();
    expect(buildDormantReminder({ daysAway: 3.9, sessions: improving })).not.toBeNull();
    expect(buildDormantReminder({ daysAway: 2.9, sessions: improving })).toBeNull();
  });

  it('fires from three days up', () => {
    expect(DORMANT_AFTER_DAYS).toBe(3);
  });
});

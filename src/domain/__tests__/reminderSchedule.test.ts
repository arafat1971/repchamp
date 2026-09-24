import {
  DEFAULT_REMINDER_HOUR,
  EARLIEST_REMINDER_HOUR,
  HABIT_DOMINANCE,
  LATEST_REMINDER_HOUR,
  LEAD_HOURS,
  SESSIONS_BEFORE_LEARNING,
  learnTrainingHour,
  reminderHourFor,
} from '@/domain/reminderSchedule';
import type { SessionSummary } from '@/state/profileStore';

/**
 * A session finished at a given local hour on a given day.
 *
 * The hour is written into a local-time string with no zone suffix, so
 * `new Date(...)` reads it back as that same local hour under whatever zone
 * Jest is running in. Using a `Z` instant here would make every assertion
 * depend on the test machine's timezone.
 */
const at = (day: string, hour: number, o: Partial<SessionSummary> = {}): SessionSummary => ({
  id: `${day}-${hour}`,
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
  completedAt: `${day}T${String(hour).padStart(2, '0')}:00:00.000`,
  day,
  ...o,
});

/** Five consecutive mornings at 07:00 — an unambiguous habit. */
const morningRoutine = [
  at('2026-09-01', 7),
  at('2026-09-02', 7),
  at('2026-09-03', 7),
  at('2026-09-04', 7),
  at('2026-09-05', 7),
];

describe('learnTrainingHour', () => {
  /* The whole point: the 07:00 athlete was being reminded at 19:00, twelve
     hours after the moment that would have worked. */
  it('finds a consistent training hour and leads it', () => {
    const learned = learnTrainingHour(morningRoutine);
    expect(learned).not.toBeNull();
    expect(learned?.habitualHour).toBe(7);
    expect(learned?.hour).toBe(7 - LEAD_HOURS);
    expect(learned?.confidence).toBe(1);
  });

  /* Two points are a line through noise — the same threshold and the same
     reason as `exerciseProgress`. Two unusual mornings are not a routine. */
  it('says nothing until there is enough history', () => {
    expect(learnTrainingHour(morningRoutine.slice(0, SESSIONS_BEFORE_LEARNING - 1))).toBeNull();
    expect(learnTrainingHour(morningRoutine.slice(0, SESSIONS_BEFORE_LEARNING))).not.toBeNull();
  });

  it('says nothing at all about an athlete with no history', () => {
    expect(learnTrainingHour([])).toBeNull();
  });

  /* Training whenever you can is a real pattern, and the honest response is to
     leave the reminder alone rather than dress up the modal hour as a routine. */
  it('refuses to invent a routine from a scattered history', () => {
    const scattered = [
      at('2026-09-01', 6),
      at('2026-09-02', 11),
      at('2026-09-03', 15),
      at('2026-09-04', 20),
      at('2026-09-05', 23),
    ];
    expect(learnTrainingHour(scattered)).toBeNull();
  });

  /* One habit, not two: exact-hour bucketing would split 06:50 and 07:10 and
     conclude the athlete has no pattern at all. */
  it('treats nearby hours as one habit', () => {
    const nearby = [
      at('2026-09-01', 6),
      at('2026-09-02', 7),
      at('2026-09-03', 7),
      at('2026-09-04', 8),
    ];
    const learned = learnTrainingHour(nearby);
    expect(learned).not.toBeNull();
    expect(learned?.habitualHour).toBe(7);
  });

  /* A reminder may be ignored; it may not wake anyone. The pre-dawn athlete
     gets the floor rather than a lead-in at 03:00. */
  it('never schedules before the waking window', () => {
    const dawn = [at('2026-09-01', 4), at('2026-09-02', 4), at('2026-09-03', 4)];
    expect(learnTrainingHour(dawn)?.hour).toBe(EARLIEST_REMINDER_HOUR);
  });

  /* The case the whole module exists for: 07:00 is an ordinary hour to train,
     and the floor must sit below it. A floor that raised this athlete's
     lead-in to 08:00 would remind them an hour *after* the session it is
     prompting — worse than the flat evening it replaces. */
  it('serves the early-morning athlete rather than overshooting them', () => {
    const learned = learnTrainingHour(morningRoutine);
    expect(learned?.hour).toBe(6);
    expect(learned?.hour).toBeLessThan(learned?.habitualHour ?? 0);
  });

  it('never schedules into the night', () => {
    const lateNight = [at('2026-09-01', 23), at('2026-09-02', 23), at('2026-09-03', 23)];
    const learned = learnTrainingHour(lateNight);
    expect(learned?.hour).toBe(LATEST_REMINDER_HOUR);
    expect(learned?.hour).toBeLessThanOrEqual(LATEST_REMINDER_HOUR);
  });

  it('keeps every learned hour inside the waking window', () => {
    for (let hour = 0; hour <= 23; hour++) {
      const consistent = [
        at('2026-09-01', hour),
        at('2026-09-02', hour),
        at('2026-09-03', hour),
      ];
      const learned = learnTrainingHour(consistent);
      expect(learned?.hour).toBeGreaterThanOrEqual(EARLIEST_REMINDER_HOUR);
      expect(learned?.hour).toBeLessThanOrEqual(LATEST_REMINDER_HOUR);
    }
  });

  /* A routine that has genuinely moved should be followed, not outvoted by a
     year of a schedule the athlete no longer keeps. */
  it('follows a routine that has moved', () => {
    const oldEvenings = Array.from({ length: 20 }, (_, i) =>
      at(`2026-07-${String(i + 1).padStart(2, '0')}`, 19),
    );
    const newMornings = Array.from({ length: 20 }, (_, i) =>
      at(`2026-09-${String(i + 1).padStart(2, '0')}`, 7),
    );
    expect(learnTrainingHour([...oldEvenings, ...newMornings])?.habitualHour).toBe(7);
  });

  /* `completedAt` comes off a store that has been written to since launch; a
     corrupt row must not vote for midnight. */
  it('skips unparseable timestamps rather than counting them as hour zero', () => {
    const withJunk = [
      ...morningRoutine,
      at('2026-09-06', 7, { id: 'junk', completedAt: 'not-a-timestamp' }),
    ];
    const learned = learnTrainingHour(withJunk);
    expect(learned?.habitualHour).toBe(7);
  });

  it('is tuned to the documented thresholds', () => {
    expect(SESSIONS_BEFORE_LEARNING).toBe(3);
    expect(HABIT_DOMINANCE).toBe(0.5);
  });
});

describe('reminderHourFor', () => {
  /* Call sites use this unconditionally, so the no-history answer has to be
     exactly the hour the app already sent at — this changes nothing for the
     athlete it has learned nothing about. */
  it('falls back to the hour the app already used', () => {
    expect(reminderHourFor([])).toBe(DEFAULT_REMINDER_HOUR);
    expect(reminderHourFor(morningRoutine.slice(0, 1))).toBe(DEFAULT_REMINDER_HOUR);
    expect(DEFAULT_REMINDER_HOUR).toBe(19);
  });

  it('uses the learned hour once there is one', () => {
    expect(reminderHourFor(morningRoutine)).toBe(7 - LEAD_HOURS);
  });

  it('honours an explicit fallback for slots that do not send at 19:00', () => {
    expect(reminderHourFor([], 20)).toBe(20);
  });
});

/**
 * The learned hour has to survive the trip from `domain/` to the OS.
 *
 * `domain/reminderSchedule` is thoroughly tested and correct: it picks 06:00 for
 * a dawn athlete, refuses to invent a routine from scattered history, and falls
 * back to 19:00. None of that proved the hour ever reached a scheduled
 * notification. Two defects lived entirely in the adapter between the pure rule
 * and `expo-notifications`, invisible to every existing test because the domain
 * layer they exercised was faultless:
 *
 *   1. The Settings toggle called `syncLocalReminders` without `sessions`, so
 *      `reminderHourFor([])` re-armed at a flat 19:00 — toggling the switch off
 *      and on silently undid the learned hour.
 *   2. `useNotificationSync` excluded `sessions` from its effect dependencies
 *      with a comment asserting that `trainedToday` and `streak` were the only
 *      parts of it the sync read. True when written, false once the hour was
 *      read too — an athlete whose routine moves breaks no streak, so the
 *      schedule never followed them.
 *
 * Both are wiring, so this tests wiring: it drives `syncLocalReminders` with a
 * fake `expo-notifications` and reads the hour back off the trigger that would
 * have been handed to the OS. What the domain tests prove about *which* hour is
 * correct, this proves about whether that hour is the one actually scheduled.
 *
 * The two service modules are mocked because importing `notifications.ts` pulls
 * `@react-native-firebase/firestore` through them, which this preset cannot
 * parse. They are push-token I/O and irrelevant to scheduling.
 */

/* `mock`-prefixed because a `jest.mock` factory is hoisted above these
   declarations and may only close over variables named this way. */
const mockSchedule = jest.fn().mockResolvedValue('scheduled');
const mockCancel = jest.fn().mockResolvedValue(undefined);

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  setNotificationCategoryAsync: jest.fn().mockResolvedValue(undefined),
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true, canAskAgain: true }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  scheduleNotificationAsync: (...args: unknown[]) => mockSchedule(...args),
  cancelScheduledNotificationAsync: (...args: unknown[]) => mockCancel(...args),
  SchedulableTriggerInputTypes: { DAILY: 'daily', WEEKLY: 'weekly' },
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
}));

// Firestore-backed push-token I/O; nothing to do with local schedules.
jest.mock('@/services/coupleService', () => ({ syncMyCouplePushToken: jest.fn() }));
jest.mock('@/services/userService', () => ({ saveExpoPushToken: jest.fn() }));

import { streakReminderHour, syncLocalReminders } from '@/lib/notifications';
import {
  DEFAULT_REMINDER_HOUR,
  EARLIEST_REMINDER_HOUR,
  LATEST_REMINDER_HOUR,
} from '@/domain/reminderSchedule';
import type { SessionSummary } from '@/state/profileStore';

const WORKOUT_REMINDER_ID = 'workout-reminder-daily';
const STREAK_REMINDER_ID = 'couple-streak-reminder-eve';
const DORMANT_REMINDER_ID = 'dormant-reminder-eve';

let seq = 0;

/**
 * A finished session at a given local hour.
 *
 * `completedAt` is built in local time on purpose: `learnTrainingHour` reads it
 * back with `getHours()`, so a UTC literal would mean a different hour under a
 * different `TZ` and the assertions here would pass or fail by machine.
 */
function sessionAt(hour: number, dayOffset = 0): SessionSummary {
  const d = new Date(2026, 8, 1 + dayOffset, hour, 0, 0);
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
  return {
    id: `s${seq++}`,
    exercise: 'push',
    mode: 'solo',
    reps: 20,
    opponentReps: null,
    opponentId: null,
    target: null,
    won: true,
    xp: 300,
    formScore: 90,
    durationSec: 60,
    completedAt: d.toISOString(),
    day,
  };
}

/** A routine: enough sessions at one hour to clear the learning thresholds. */
function routineAt(hour: number, count = 6): SessionSummary[] {
  return Array.from({ length: count }, (_, i) => sessionAt(hour, i));
}

/** The hour on the DAILY trigger scheduled under `id`, or null if none was. */
function scheduledHourFor(id: string): number | null {
  const call = mockSchedule.mock.calls
    .map(([arg]) => arg as { identifier?: string; trigger?: { hour?: number } })
    .reverse()
    .find((arg) => arg?.identifier === id);
  return call?.trigger?.hour ?? null;
}

beforeEach(() => {
  mockSchedule.mockClear();
  mockCancel.mockClear();
});

describe('syncLocalReminders — the learned hour reaches the OS', () => {
  /* The end-to-end claim the domain tests cannot make. A 07:00 routine must
     arrive at the scheduler as 06:00 (an hour's lead), not as the flat 19:00
     that every slot used to hardcode. */
  it('schedules the daily reminder at the learned hour, not the default', () => {
    return syncLocalReminders({
      dailyReminderEnabled: true,
      trainedToday: false,
      coupleAtRisk: false,
      sessions: routineAt(7),
      streak: 3,
      daysSinceLastSession: 1,
    }).then(() => {
      expect(scheduledHourFor(WORKOUT_REMINDER_ID)).toBe(6);
    });
  });

  /* The Settings-toggle defect, stated as a test: a caller that omits
     `sessions` gets 19:00 because `reminderHourFor([])` can learn nothing. This
     is what the toggle used to do on every arm. */
  it('falls back to the default hour when no history is passed', async () => {
    await syncLocalReminders({
      dailyReminderEnabled: true,
      trainedToday: false,
      coupleAtRisk: false,
    });
    expect(scheduledHourFor(WORKOUT_REMINDER_ID)).toBe(DEFAULT_REMINDER_HOUR);
  });

  /* The dormant slot replaces the daily one and must carry the same hour —
     they are one slot with two possible sentences, not two schedules. */
  it('gives the dormant slot the same learned hour', async () => {
    await syncLocalReminders({
      dailyReminderEnabled: true,
      trainedToday: false,
      coupleAtRisk: false,
      sessions: routineAt(7),
      streak: 0,
      daysSinceLastSession: 5,
    });
    expect(scheduledHourFor(DORMANT_REMINDER_ID)).toBe(6);
    // All-or-nothing: the daily line must not also be armed.
    expect(scheduledHourFor(WORKOUT_REMINDER_ID)).toBeNull();
  });

  /* The streak slot sits an hour behind the daily one and always has. Shifting
     it with the learned hour keeps that gap instead of pinning it to 20:00. */
  it('keeps the streak slot one hour behind the learned hour', async () => {
    await syncLocalReminders({
      dailyReminderEnabled: true,
      trainedToday: false,
      coupleAtRisk: true,
      partnerName: 'Sam',
      sessions: routineAt(7),
      streak: 4,
      daysSinceLastSession: 1,
    });
    expect(scheduledHourFor(STREAK_REMINDER_ID)).toBe(7);
  });

  /* The ceiling, now `LATEST_REMINDER_HOUR` rather than a literal. A late
     routine must not push the streak slot past the end of the waking window. */
  it('never schedules the streak slot past the waking window', async () => {
    await syncLocalReminders({
      dailyReminderEnabled: true,
      trainedToday: false,
      coupleAtRisk: true,
      partnerName: 'Sam',
      sessions: routineAt(23),
      streak: 4,
      daysSinceLastSession: 1,
    });
    const hour = scheduledHourFor(STREAK_REMINDER_ID);
    expect(hour).not.toBeNull();
    expect(hour as number).toBeLessThanOrEqual(LATEST_REMINDER_HOUR);
  });

  /* A dawn routine clamps to the floor rather than scheduling in the dark. The
     domain proves the clamp; this proves the clamped value is what ships. */
  it('never schedules before the waking window', async () => {
    await syncLocalReminders({
      dailyReminderEnabled: true,
      trainedToday: false,
      coupleAtRisk: false,
      sessions: routineAt(5),
      streak: 2,
      daysSinceLastSession: 1,
    });
    const hour = scheduledHourFor(WORKOUT_REMINDER_ID);
    expect(hour).not.toBeNull();
    expect(hour as number).toBeGreaterThanOrEqual(EARLIEST_REMINDER_HOUR);
  });

  /* A scattered routine is a real pattern and the honest answer is to leave the
     reminder where it was — personalisation must not become a guess. */
  it('leaves a scattered routine on the default hour', async () => {
    const scattered = [
      sessionAt(6, 0),
      sessionAt(11, 1),
      sessionAt(15, 2),
      sessionAt(19, 3),
      sessionAt(22, 4),
    ];
    await syncLocalReminders({
      dailyReminderEnabled: true,
      trainedToday: false,
      coupleAtRisk: false,
      sessions: scattered,
      streak: 1,
      daysSinceLastSession: 1,
    });
    expect(scheduledHourFor(WORKOUT_REMINDER_ID)).toBe(DEFAULT_REMINDER_HOUR);
  });

  /* Volume is what the notification policy protects; a learned hour must cost
     none of it. One slot armed, never two. */
  it('still arms exactly one evening slot', async () => {
    await syncLocalReminders({
      dailyReminderEnabled: true,
      trainedToday: false,
      coupleAtRisk: false,
      sessions: routineAt(7),
      streak: 3,
      daysSinceLastSession: 1,
    });
    const evening = mockSchedule.mock.calls
      .map(([arg]) => (arg as { identifier?: string }).identifier)
      .filter((id) => id === WORKOUT_REMINDER_ID || id === DORMANT_REMINDER_ID);
    expect(evening).toHaveLength(1);
  });
});

/**
 * The call sites, checked as text.
 *
 * Defect 1 was a caller omitting a field, and defect 2 a dependency array
 * missing an entry. Neither is reachable from here: `app/` has no component
 * tests in this project (see `notificationRouting.test.ts` for the same
 * constraint and the same answer). A grep-shaped assertion that runs on every
 * push is worth more than a perfectly-shaped one that does not exist, and it is
 * cheap to delete the day real component tests land.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..');

describe('the callers pass what the schedule is derived from', () => {
  it('hands sessions to syncLocalReminders from the Settings toggle', () => {
    const source = readFileSync(join(ROOT, 'app', 'modal', 'settings.tsx'), 'utf8');
    const call = source.slice(
      source.indexOf('void syncLocalReminders({'),
      source.indexOf('} else {'),
    );
    expect(call).toContain('sessions');
  });

  it('re-syncs when the learned hour changes', () => {
    const source = readFileSync(join(ROOT, 'src', 'state', 'useNotificationSync.ts'), 'utf8');
    const deps = source.slice(source.lastIndexOf('}, ['), source.lastIndexOf(']'));
    expect(deps).toContain('reminderHour');
  });
});

/**
 * The weekly recap — the one slot that deliberately does NOT learn an hour.
 *
 * It also fires on the wrong day until this branch: `expo-notifications`
 * numbers weekdays 1–7 with 1 = Sunday, and this app's week is Mon–Sun
 * everywhere else, so "Your week in reps" arrived six hours before the week it
 * described had ended.
 */
describe('the weekly recap', () => {
  const WEEKLY_RECAP_ID = 'weekly-recap';

  /** The full scheduled arg for the recap, or null. */
  function recapCall(): { trigger?: { weekday?: number; hour?: number }; content?: { body?: string } } | null {
    const call = mockSchedule.mock.calls
      .map(([arg]) => arg as { identifier?: string; trigger?: { weekday?: number; hour?: number }; content?: { body?: string } })
      .reverse()
      .find((arg) => arg?.identifier === WEEKLY_RECAP_ID);
    return call ?? null;
  }

  /* Monday, so the week being summarised is actually over. 2 = Monday under
     expo's 1 = Sunday numbering. */
  it('fires on Monday, after the week it describes has ended', async () => {
    await syncLocalReminders({
      dailyReminderEnabled: true,
      trainedToday: false,
      coupleAtRisk: false,
      sessions: routineAt(7),
      streak: 3,
      daysSinceLastSession: 1,
    });
    expect(recapCall()?.trigger?.weekday).toBe(2);
  });

  /* The deliberate decision, pinned: every other slot moves to the learned
     hour, and this one must not. A recap asks the athlete to do nothing, so
     there is no moment for it to beat — and a 07:00 routine would otherwise
     drag the weekly summary to 06:00 on a Monday. */
  it('keeps its fixed hour even when a training hour has been learned', async () => {
    await syncLocalReminders({
      dailyReminderEnabled: true,
      trainedToday: false,
      coupleAtRisk: false,
      sessions: routineAt(7),
      streak: 3,
      daysSinceLastSession: 1,
    });
    // The daily slot moved to 06:00; the recap stayed put.
    expect(scheduledHourFor(WORKOUT_REMINDER_ID)).toBe(6);
    expect(recapCall()?.trigger?.hour).toBe(18);
  });

  /* The copy is baked in at schedule time, so it must be built from the history
     handed to THIS sync — that is the whole reason the sync re-runs on
     foreground. A recap carrying last week's claim is a stale fact presented as
     current. */
  it('bakes in a claim built from the history it was given', async () => {
    const improving = [
      sessionAt(7, 0),
      sessionAt(7, 1),
      sessionAt(7, 2),
      { ...sessionAt(7, 3), reps: 40 },
    ];
    await syncLocalReminders({
      dailyReminderEnabled: true,
      trainedToday: false,
      coupleAtRisk: false,
      sessions: improving,
      streak: 4,
      daysSinceLastSession: 1,
    });
    // 20 -> 40 is a real gain, so the recap states it rather than the generic line.
    expect(recapCall()?.content?.body).toContain('best set has gone from');
  });

  /* Still exactly one recap per sync, whatever else changed. */
  it('schedules exactly one recap', async () => {
    await syncLocalReminders({
      dailyReminderEnabled: true,
      trainedToday: false,
      coupleAtRisk: false,
      sessions: routineAt(7),
      streak: 3,
      daysSinceLastSession: 1,
    });
    const recaps = mockSchedule.mock.calls
      .map(([arg]) => (arg as { identifier?: string }).identifier)
      .filter((id) => id === WEEKLY_RECAP_ID);
    expect(recaps).toHaveLength(1);
  });
});

describe('the sync refreshes when the app is reopened', () => {
  /* The recap's copy is frozen at schedule time, so the only defence against a
     stale claim is re-syncing. Source-text assertion for the same reason as the
     call-site checks above: `app/` and the hooks have no component tests here. */
  it('re-syncs on foreground', () => {
    const source = readFileSync(join(ROOT, 'src', 'state', 'useNotificationSync.ts'), 'utf8');
    expect(source).toContain("AppState.addEventListener");
    const deps = source.slice(source.lastIndexOf('}, ['), source.lastIndexOf(']'));
    expect(deps).toContain('foregroundTick');
  });
});

/**
 * The last-night warning has to reach the OS, not just the pure function.
 *
 * `buildDailyReminder` learning about `daysAway` is inert unless
 * `syncLocalReminders` actually passes it down — the same adapter gap that hid
 * the learned hour from the Settings toggle.
 */
describe('the daily reminder knows when the streak is on its last night', () => {
  /** The content scheduled under the workout slot, or null. */
  function workoutContent(): { title?: string; body?: string } | null {
    const call = mockSchedule.mock.calls
      .map(([arg]) => arg as { identifier?: string; content?: { title?: string; body?: string } })
      .reverse()
      .find((arg) => arg?.identifier === WORKOUT_REMINDER_ID);
    return call?.content ?? null;
  }

  it('warns that the streak ends today once the rest day is spent', async () => {
    await syncLocalReminders({
      dailyReminderEnabled: true,
      trainedToday: false,
      coupleAtRisk: false,
      sessions: routineAt(7),
      streak: 9,
      // Two days since the last session: the grace day is already used.
      daysSinceLastSession: 2,
    });
    expect(workoutContent()?.title).toBe('Day 9 ends today');
  });

  it('sends the ordinary line when the streak genuinely holds', async () => {
    await syncLocalReminders({
      dailyReminderEnabled: true,
      trainedToday: false,
      coupleAtRisk: false,
      sessions: routineAt(7),
      streak: 9,
      daysSinceLastSession: 1,
    });
    expect(workoutContent()?.title).toBe('Day 9 — keep it going');
    expect(workoutContent()?.body).toBe('One set today and the streak holds.');
  });

  /* Day 3 and beyond belongs to the dormant slot, which replaces this one — so
     the two must never both be armed, whatever the streak says. */
  it('hands over to the dormant slot rather than doubling up', async () => {
    await syncLocalReminders({
      dailyReminderEnabled: true,
      trainedToday: false,
      coupleAtRisk: false,
      sessions: routineAt(7),
      streak: 0,
      daysSinceLastSession: 4,
    });
    const armed = mockSchedule.mock.calls
      .map(([arg]) => (arg as { identifier?: string }).identifier)
      .filter((id) => id === WORKOUT_REMINDER_ID || id === DORMANT_REMINDER_ID);
    expect(armed).toEqual([DORMANT_REMINDER_ID]);
  });
});

/**
 * The streak slot's hour, including the case where its rule cannot hold.
 *
 * The slot trails the daily one by an hour — it is the last call of the day for
 * a streak that dies at midnight. That gap is a preference; the waking-window
 * ceiling is a promise, and at `LATEST_REMINDER_HOUR` there is nowhere later to
 * go, so the gap yields. Pinned here because the arithmetic used to be inline
 * and the comment beside it claimed the gap always held.
 */
describe('streakReminderHour', () => {
  it('keeps its historical 20:00 when nothing was learned', () => {
    expect(streakReminderHour(DEFAULT_REMINDER_HOUR)).toBe(20);
  });

  it('trails a learned hour by one', () => {
    for (const hour of [6, 7, 10, 15, 18, 20]) {
      expect(streakReminderHour(hour)).toBe(hour + 1);
    }
  });

  /* The exception. A 22:00 or 23:00 routine learns 21 — the ceiling — and a
     22:00 reminder would break the one guarantee the clamp exists to make. */
  it('yields the gap to the ceiling rather than waking anyone', () => {
    expect(streakReminderHour(LATEST_REMINDER_HOUR)).toBe(LATEST_REMINDER_HOUR);
  });

  it('never schedules past the ceiling, whatever it is handed', () => {
    for (let hour = 0; hour <= 23; hour++) {
      expect(streakReminderHour(hour)).toBeLessThanOrEqual(LATEST_REMINDER_HOUR);
    }
  });

  /* The collision is harmless only because the two slots never coexist. If that
     ever changes, this is the test that should start failing. */
  it('is the only evening slot armed when a couple streak is at risk', async () => {
    await syncLocalReminders({
      dailyReminderEnabled: true,
      trainedToday: false,
      coupleAtRisk: true,
      partnerName: 'Sam',
      sessions: routineAt(23),
      streak: 5,
      daysSinceLastSession: 1,
    });
    const armed = mockSchedule.mock.calls
      .map(([arg]) => (arg as { identifier?: string }).identifier)
      .filter((id) => id === WORKOUT_REMINDER_ID || id === DORMANT_REMINDER_ID);
    expect(armed).toEqual([]);
    expect(scheduledHourFor(STREAK_REMINDER_ID)).toBe(LATEST_REMINDER_HOUR);
  });
});

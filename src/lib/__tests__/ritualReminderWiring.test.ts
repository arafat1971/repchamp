/**
 * The ritual reminder is a one-shot for *today* at 20:30: scheduled while
 * there is something left and the time is ahead, cancelled otherwise. Driven
 * through a fake `expo-notifications`, as `reminderWiring.test.ts` does.
 */

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
  SchedulableTriggerInputTypes: { DAILY: 'daily', WEEKLY: 'weekly', DATE: 'date' },
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
}));
jest.mock('@/services/coupleService', () => ({ syncMyCouplePushToken: jest.fn() }));
jest.mock('@/services/userService', () => ({ saveExpoPushToken: jest.fn() }));

import { syncRitualReminder } from '@/lib/notifications';

const copy = { title: '4/6 today — 2 to go', body: 'Still time for stretch and wind down.' };
const at = (h: number, m = 0) => new Date(2026, 8, 25, h, m, 0);

function scheduled() {
  return mockSchedule.mock.calls.map(([a]) => a as { identifier: string; content: { title: string }; trigger: { type: string; date: Date } });
}

beforeEach(() => {
  mockSchedule.mockClear();
  mockCancel.mockClear();
});

describe('syncRitualReminder', () => {
  it('schedules today at 20:30 with the words as of now', async () => {
    await syncRitualReminder({ enabled: true, copy, now: at(14) });
    const [call] = scheduled();
    expect(call?.identifier).toBe('ritual-reminder');
    expect(call?.content.title).toBe(copy.title);
    expect(call?.trigger.type).toBe('date');
    expect(call?.trigger.date.getHours()).toBe(20);
    expect(call?.trigger.date.getMinutes()).toBe(30);
    expect(call?.trigger.date.getDate()).toBe(25);
  });

  it('cancels when the ritual is done, the switch is off, or the time has passed', async () => {
    await syncRitualReminder({ enabled: true, copy: null, now: at(14) });
    await syncRitualReminder({ enabled: false, copy, now: at(14) });
    await syncRitualReminder({ enabled: true, copy, now: at(20, 45) });
    expect(scheduled()).toHaveLength(0);
    expect(mockCancel).toHaveBeenCalledWith('ritual-reminder');
  });
});

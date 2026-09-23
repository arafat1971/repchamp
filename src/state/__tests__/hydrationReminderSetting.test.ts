/**
 * The new toggle must default on for existing installs.
 *
 * A field added to a persisted store is absent from every blob written before
 * it existed. Zustand shallow-merges persisted state over the initial state,
 * so the default wins — but that is worth proving rather than assuming, since
 * the failure mode is silent: every existing athlete would get hydration
 * reminders switched off with no way to know they had been opted out.
 */

const mockStore = new Map<string, string>();

jest.mock('@/lib/storage', () => ({
  storage: {
    getString: (k: string) => mockStore.get(k),
    set: (k: string, v: string) => {
      mockStore.set(k, v);
    },
    remove: (k: string) => {
      mockStore.delete(k);
    },
  },
  zustandStorage: {
    getItem: (k: string) => mockStore.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mockStore.set(k, v);
    },
    removeItem: (k: string) => {
      mockStore.delete(k);
    },
  },
}));

import { useSettingsStore } from '../settingsStore';

describe('the hydration reminder toggle', () => {
  it('defaults on for a fresh install', () => {
    expect(useSettingsStore.getState().hydrationReminder).toBe(true);
  });

  it('survives a settings blob written before the field existed', async () => {
    // Exactly what an older build persisted: no hydrationReminder key.
    mockStore.set(
      'repchamp.settings',
      JSON.stringify({
        state: { sound: true, haptics: true, dailyReminder: false },
        version: 1,
      }),
    );

    await useSettingsStore.persist.rehydrate();

    // The old value is honoured…
    expect(useSettingsStore.getState().dailyReminder).toBe(false);
    // …and the new field falls back to its default rather than undefined.
    expect(useSettingsStore.getState().hydrationReminder).toBe(true);
  });

  it('can be turned off independently of the training reminder', () => {
    useSettingsStore.getState().set('hydrationReminder', false);
    expect(useSettingsStore.getState().hydrationReminder).toBe(false);
    expect(useSettingsStore.getState().dailyReminder).toBe(false);

    useSettingsStore.getState().set('dailyReminder', true);
    expect(useSettingsStore.getState().hydrationReminder).toBe(false);
  });
});

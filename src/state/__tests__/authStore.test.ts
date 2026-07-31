/**
 * Auth store — the cloud-mirror status.
 *
 * `upsertProfile` reports a rejected write by *returning false* rather than
 * throwing, so ignoring its result meant a denied write (rules, App Check, a
 * contested username) left `status` on 'synced' while the athlete's XP quietly
 * stopped mirroring. Nothing is lost locally, but the app claimed a sync that
 * never happened, and there was no signal to retry on.
 */

// `jest.mock` factories are hoisted above these declarations and the store
// reads `isFirebaseConfigured()` at import time, so every factory below must
// tolerate `mockState` not existing yet — hence the optional chaining and
// defaults. Jest only permits out-of-scope names that start with `mock`.
const mockState = {
  configured: true,
  /** What the fake `upsertProfile` reports back. */
  upsertOk: true,
  publishCalls: 0,
  removeCalls: 0,
};

jest.mock('@/lib/firebase', () => ({
  isFirebaseConfigured: () => mockState?.configured ?? true,
}));

jest.mock('@/services/auth', () => ({
  ensureSignedIn: jest.fn(async () => undefined),
  onAuthChange: jest.fn(() => () => {}),
  signOut: jest.fn(async () => undefined),
  LOCAL_USER: { uid: 'local', isAnonymous: true },
}));

jest.mock('@/services/userService', () => ({
  upsertProfile: jest.fn(async () => mockState.upsertOk),
  publishScore: jest.fn(async () => {
    mockState.publishCalls += 1;
  }),
  removeScore: jest.fn(async () => {
    mockState.removeCalls += 1;
  }),
  fetchProfile: jest.fn(async () => null),
  uploadAvatar: jest.fn(async (_uid: string, uri: string) => uri),
  buildCloudProgressSlice: jest.fn(() => ({
    trainedDays: [],
    weekKey: '2026-W31',
    weekXp: 0,
    weekExerciseReps: {},
    programme: null,
  })),
}));

jest.mock('@/domain/cloudProgress', () => ({
  hydrateSessionsFromCloudProgress: jest.fn(() => []),
  mergeProgrammeProgress: jest.fn(() => null),
}));

jest.mock('@/state/settingsStore', () => ({
  useSettingsStore: { getState: () => ({ privateProfile: false }) },
}));

jest.mock('@/state/profileStore', () => ({
  useProfileStore: {
    getState: () => ({
      username: 'ada',
      displayName: 'Ada',
      avatarUri: null,
      weeklyGoal: 5,
      totalXp: 100,
      personalBests: {},
      onboarded: true,
      pairingBonusClaimed: false,
      pairingBonusUntil: null,
      sessions: [],
      programme: null,
    }),
  },
  selectWeeklyXp: () => 10,
  selectLevel: () => ({ level: 2 }),
  selectLeague: () => ({ id: 'bronze' }),
}));

import { useAuthStore } from '../authStore';

beforeEach(() => {
  mockState.configured = true;
  mockState.upsertOk = true;
  mockState.publishCalls = 0;
  mockState.removeCalls = 0;
  useAuthStore.setState({
    user: { uid: 'ada', isAnonymous: false } as never,
    status: 'idle',
    ready: true,
  });
});

describe('authStore.pushProfile', () => {
  it('reports synced when the cloud write lands', async () => {
    useAuthStore.setState({ status: 'syncing' as never });
    await useAuthStore.getState().pushProfile();

    expect(useAuthStore.getState().status).not.toBe('error');
    expect(mockState.publishCalls).toBe(1);
  });

  it('reports error when the profile write is rejected', async () => {
    // Regression: upsertProfile returns false rather than throwing, so this
    // used to fall through and look like a successful sync.
    mockState.upsertOk = false;
    await useAuthStore.getState().pushProfile();

    expect(useAuthStore.getState().status).toBe('error');
  });

  it('does not publish a leaderboard row when the profile write failed', async () => {
    // Publishing a score for a profile that was never saved would leave the
    // board referencing a row the profile does not back.
    mockState.upsertOk = false;
    await useAuthStore.getState().pushProfile();

    expect(mockState.publishCalls).toBe(0);
    expect(mockState.removeCalls).toBe(0);
  });

  it('no-ops without a signed-in athlete', async () => {
    useAuthStore.setState({ user: null });
    await useAuthStore.getState().pushProfile();

    expect(mockState.publishCalls).toBe(0);
    expect(useAuthStore.getState().status).not.toBe('error');
  });

  it('no-ops when Firebase is not configured', async () => {
    mockState.configured = false;
    await useAuthStore.getState().pushProfile();

    expect(mockState.publishCalls).toBe(0);
  });
});

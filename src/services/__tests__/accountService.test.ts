/**
 * Account deletion — the GDPR path.
 *
 * The one behaviour these cover is the one that matters legally: deletion must
 * never *report* success it did not achieve. Every Firestore delete here used
 * to swallow its own rejection, so a failed erase was indistinguishable from a
 * clean one and the athlete was told their account was gone while their
 * profile and leaderboard row were still live.
 */

const mockState = { configured: true };

/** Per-path delete behaviour: set a path to `false` to make it reject. */
const deleteOk: Record<string, boolean> = {};
const deleted: string[] = [];

function mockDoc(path: string) {
  return {
    path,
    async delete() {
      deleted.push(path);
      if (deleteOk[path] === false) throw new Error(`denied: ${path}`);
    },
    collection: (name: string) => mockCollection(`${path}/${name}`),
    async get() {
      return { exists: () => true, data: () => ({}) };
    },
  };
}

/** Duel docs the `duels` collection returns, keyed by doc id. */
const duelRows: Record<string, Record<string, unknown>> = {};

function mockCollection(path: string) {
  const q = {
    where: () => q,
    limit: () => q,
    async get() {
      if (path !== 'duels') return { docs: [] as unknown[] };
      return {
        docs: Object.entries(duelRows).map(([id, data]) => ({
          id,
          data: () => data,
          ref: mockDoc(`duels/${id}`),
        })),
      };
    },
  };
  return { ...q, doc: (id: string) => mockDoc(`${path}/${id}`) };
}

jest.mock('@/lib/firebase', () => ({
  isFirebaseConfigured: () => mockState.configured,
}));

jest.mock('@react-native-firebase/firestore', () => {
  const fn = () => ({ collection: (name: string) => mockCollection(name) });
  return { __esModule: true, default: fn };
});

jest.mock('@react-native-firebase/auth', () => {
  const fn = () => ({ currentUser: null });
  return { __esModule: true, default: fn };
});

jest.mock('@/services/duelService', () => ({
  cancelDuel: jest.fn(async () => {}),
  finishDuel: jest.fn(async () => true),
}));

import { deleteAccount } from '../accountService';

beforeEach(() => {
  mockState.configured = true;
  deleted.length = 0;
  for (const k of Object.keys(duelRows)) delete duelRows[k];
  for (const k of Object.keys(deleteOk)) delete deleteOk[k];
});

describe('deleteAccount', () => {
  it('resolves when every erasure lands', async () => {
    await expect(deleteAccount('ada')).resolves.toBeUndefined();
    // The publicly visible records are the ones that matter most.
    expect(deleted).toContain('leaderboard/ada');
    expect(deleted).toContain('users/ada');
  });

  it('throws instead of claiming success when the leaderboard row survives', async () => {
    deleteOk['leaderboard/ada'] = false;
    await expect(deleteAccount('ada')).rejects.toThrow(/could not be deleted/i);
  });

  it('names what survived so the athlete can retry knowingly', async () => {
    deleteOk['leaderboard/ada'] = false;
    await expect(deleteAccount('ada')).rejects.toThrow(/leaderboard row/i);
  });

  it('still attempts every erasure even after one is rejected', async () => {
    deleteOk['matchmaking/ada'] = false;
    await expect(deleteAccount('ada')).rejects.toThrow();
    // A single rejection must not abandon the rest of the wipe.
    expect(deleted).toContain('leaderboard/ada');
    expect(deleted).toContain('users/ada');
  });

  it('no-ops when Firebase is not configured', async () => {
    mockState.configured = false;
    await expect(deleteAccount('ada')).resolves.toBeUndefined();
    expect(deleted).toHaveLength(0);
  });

  /*
   * The avatar is a base64 field on the profile document now — Firebase Storage
   * needs a paid plan, so the app stopped using it entirely. Deleting the
   * profile is what erases the photo, and that is what this asserts rather than
   * a separate Storage call that no longer happens.
   */
  it('erases the profile photo along with the profile document', async () => {
    await deleteAccount('ada');

    // The avatar rides on this document, so its deletion is the photo's.
    expect(deleted).toContain('users/ada');
  });
});

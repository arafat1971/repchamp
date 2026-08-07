/**
 * Account export, duel cleanup, and the Auth half of deletion.
 *
 * `accountService.test.ts` pins the legally important promise — deletion never
 * reports success it did not achieve — but stops at the Firestore erasures with
 * a permanently signed-out `currentUser`. That left three things untested on a
 * file at 16% branch coverage:
 *
 *  - `exportAccountData`, which is the *other* half of the compliance story:
 *    the Data safety form says an athlete can get their data, so the export has
 *    to actually contain it, and must not throw on a sparse account.
 *  - `closeOpenDuels`, which stops a deleting athlete stranding a partner in a
 *    live set against a uid that no longer exists.
 *  - the re-auth path, where Firebase refuses to delete a login that has not
 *    signed in recently. The cloud data is already gone by then, so the message
 *    the athlete sees is the only thing standing between them and believing
 *    the app lost their data.
 *
 * A separate file rather than an extension of the existing one: that harness
 * fixes `currentUser` at null, and these need to drive it.
 */

const mockState = {
  configured: true,
  currentUser: null as { uid: string; delete: () => Promise<void> } | null,
};

/** Docs each collection path should return from `.get()`. */
const mockRows: Record<string, { id: string; data: Record<string, unknown> }[]> = {};
/** Single-doc payloads, keyed by full path. `undefined` = does not exist. */
const mockDocs: Record<string, Record<string, unknown> | undefined> = {};

const mockCancelDuel = jest.fn(async (_id: string) => {});
const mockFinishDuel = jest.fn(async (..._a: unknown[]) => true);

function mockDoc(path: string) {
  return {
    path,
    async delete() {},
    collection: (name: string) => mockCollection(`${path}/${name}`),
    async get() {
      const data = mockDocs[path];
      return { exists: () => data !== undefined, data: () => data };
    },
  };
}

function mockCollection(path: string) {
  const q = {
    where: () => q,
    limit: () => q,
    async get() {
      const rows = mockRows[path] ?? [];
      return {
        docs: rows.map((r) => ({
          id: r.id,
          data: () => r.data,
          ref: mockDoc(`${path}/${r.id}`),
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
  const fn = () => ({ currentUser: mockState.currentUser });
  return { __esModule: true, default: fn };
});

jest.mock('@/services/duelService', () => ({
  cancelDuel: (id: string) => mockCancelDuel(id),
  finishDuel: (...a: unknown[]) => mockFinishDuel(...a),
}));

import {
  CLOUD_ERASED_REAUTH_MESSAGE,
  closeOpenDuels,
  deleteAccount,
  exportAccountData,
} from '../accountService';

beforeEach(() => {
  mockState.configured = true;
  mockState.currentUser = null;
  for (const k of Object.keys(mockRows)) delete mockRows[k];
  for (const k of Object.keys(mockDocs)) delete mockDocs[k];
  mockCancelDuel.mockClear();
  mockFinishDuel.mockClear();
});

describe('exportAccountData', () => {
  it('returns null when Firebase is not configured, so a local user exports on-device', async () => {
    mockState.configured = false;
    expect(await exportAccountData('u1')).toBeNull();
  });

  it('gathers every collection the app holds about the athlete', async () => {
    mockDocs['users/u1'] = { displayName: 'Ana', totalXp: 400 };
    mockDocs['leaderboard/u1'] = { weeklyXp: 120 };
    mockDocs['matchmaking/u1'] = { status: 'searching' };
    mockDocs['users/u1/private/push'] = { token: 'ExponentPushToken[x]' };
    mockRows['users/u1/friends'] = [{ id: 'f1', data: { since: 1 } }];
    mockRows['users/u1/blocks'] = [{ id: 'b1', data: { at: 2 } }];
    mockRows['couples'] = [{ id: 'c1', data: { memberUids: ['u1', 'u2'] } }];

    const out = await exportAccountData('u1');

    expect(out).not.toBeNull();
    expect(out?.uid).toBe('u1');
    expect(out?.profile).toEqual({ displayName: 'Ana', totalXp: 400 });
    expect(out?.leaderboard).toEqual({ weeklyXp: 120 });
    expect(out?.matchmaking).toEqual({ status: 'searching' });
    expect(out?.privatePush).toEqual({ token: 'ExponentPushToken[x]' });
    expect(out?.friends).toEqual([{ uid: 'f1', since: 1 }]);
    expect(out?.blocks).toEqual([{ uid: 'b1', at: 2 }]);
    expect(out?.couple).toEqual({ id: 'c1', memberUids: ['u1', 'u2'] });
    expect(typeof out?.exportedAt).toBe('string');
  });

  /* A brand-new athlete has almost none of these documents. The export is a
     compliance obligation, so it has to succeed on a sparse account rather
     than throw on the first missing doc. */
  it('exports a nearly-empty account without throwing', async () => {
    const out = await exportAccountData('u-new');

    expect(out?.profile).toBeNull();
    expect(out?.leaderboard).toBeNull();
    expect(out?.matchmaking).toBeNull();
    expect(out?.privatePush).toBeNull();
    expect(out?.couple).toBeNull();
    expect(out?.friends).toEqual([]);
    expect(out?.blocks).toEqual([]);
  });
});

describe('closeOpenDuels', () => {
  it('cancels pending invites so nobody is left holding a dead code', async () => {
    mockRows['duels'] = [{ id: 'd-pending', data: { status: 'pending', hostUid: 'u1' } }];

    await closeOpenDuels('u1');

    expect(mockCancelDuel).toHaveBeenCalledWith('d-pending');
  });

  /* Every duel query returns the same rows in this harness, so a pending duel
     is seen by all four. Cancelling it more than once would be wasted writes —
     the implementation dedupes by id. */
  it('cancels a duel once even when several queries return it', async () => {
    mockRows['duels'] = [{ id: 'd-dup', data: { status: 'pending', hostUid: 'u1' } }];

    await closeOpenDuels('u1');

    expect(mockCancelDuel).toHaveBeenCalledTimes(1);
  });

  it('does not throw when the athlete has no open duels', async () => {
    await expect(closeOpenDuels('u1')).resolves.toBeUndefined();
    expect(mockCancelDuel).not.toHaveBeenCalled();
  });
});

describe('deleteAccount — the Auth half', () => {
  it('deletes the login when the athlete is the signed-in user', async () => {
    const del = jest.fn(async () => {});
    mockState.currentUser = { uid: 'u1', delete: del };

    await deleteAccount('u1');

    expect(del).toHaveBeenCalledTimes(1);
  });

  it('leaves another account alone when the signed-in uid does not match', async () => {
    const del = jest.fn(async () => {});
    mockState.currentUser = { uid: 'someone-else', delete: del };

    await deleteAccount('u1');

    expect(del).not.toHaveBeenCalled();
  });

  /* The cloud data is already erased by the time Auth refuses. Saying only
     "delete failed" would read as "your data is still there" — the opposite of
     what happened — so this specific message tells them to re-auth and retry
     without logging out. */
  it('explains the re-auth step rather than looking like a failed deletion', async () => {
    mockState.currentUser = {
      uid: 'u1',
      delete: async () => {
        throw Object.assign(new Error('recent login required'), {
          code: 'auth/requires-recent-login',
        });
      },
    };

    await expect(deleteAccount('u1')).rejects.toThrow(CLOUD_ERASED_REAUTH_MESSAGE);
  });

  it('rethrows an unexpected Auth failure instead of reporting success', async () => {
    mockState.currentUser = {
      uid: 'u1',
      delete: async () => {
        throw Object.assign(new Error('network down'), { code: 'auth/network-request-failed' });
      },
    };

    await expect(deleteAccount('u1')).rejects.toThrow('network down');
  });

  it('refuses without a uid rather than deleting an unknown account', async () => {
    await expect(deleteAccount('')).rejects.toThrow(/sign in/i);
  });
});

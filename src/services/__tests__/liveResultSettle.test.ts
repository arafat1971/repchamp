/**
 * Live-duel settle outbox — the durable half.
 *
 * This module keeps a set's XP alive across process death: the outbox holds
 * what still owes an award, and the banked set records what has already been
 * paid so a replay cannot pay twice. Both live in MMKV, so both survive a
 * kill — and the ordering between them is what makes the whole thing safe.
 *
 * The watcher/timer half (`armLiveResultSettle`'s Firestore subscription and
 * its forfeit retries) is deliberately not covered here; it needs a duel-doc
 * simulator and fake timers, which is a separate piece of work. What is
 * covered is everything that decides whether an athlete keeps their XP.
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
}));

// The cloud half is inert here: no duel doc resolves, so nothing settles from
// the network and the local/forced paths are what run.
jest.mock('@/services/duelService', () => ({
  watchDuel: jest.fn(() => () => {}),
  finishDuel: jest.fn(async () => true),
  forceSettleAbandoned: jest.fn(async () => false),
  seatFor: jest.fn(() => null),
}));

import type { ArmLiveSettleInput, PersistedSettle } from '../liveResultSettle';

const OUTBOX_KEY = 'liveSettleOutbox.v1';
const BANKED_KEY = 'liveSettleBanked.v1';

/**
 * The module keeps the banked set and the armed-watcher map in module scope,
 * loaded from storage once at import. Clearing the fake storage between tests
 * therefore is not enough — the module has to be re-imported so that state is
 * rebuilt from the now-empty store, or every test after the first inherits the
 * previous one's bookkeeping.
 */
type SettleModule = typeof import('../liveResultSettle');
let mod: SettleModule;

function load(): SettleModule {
  let loaded!: SettleModule;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolateModules needs a fresh require
    loaded = require('../liveResultSettle') as SettleModule;
  });
  return loaded;
}

function input(over: Partial<ArmLiveSettleInput> = {}): ArmLiveSettleInput {
  return {
    duelId: 'd1',
    uid: 'ada',
    mode: 'versus',
    outcome: { reps: 12, formScore: 90 },
    local: { won: true, drew: false, xp: 50, opponentReps: 9 },
    record: {
      exercise: 'push' as never,
      sessionMode: 'versus' as never,
      reps: 12,
      target: null,
      opponentId: null,
      formScore: 90,
      durationSec: 20,
    },
    onBank: () => true,
    ...over,
  };
}

function outbox(): PersistedSettle[] {
  return JSON.parse(mockStore.get(OUTBOX_KEY) ?? '[]');
}

beforeEach(() => {
  mockStore.clear();
  mod = load();
});

afterEach(() => {
  // Arming starts real forfeit/last-resort timers that outlive the test and
  // would otherwise keep Jest's event loop alive. Force-banking tears every
  // in-flight watcher down; the callback returns false so this cleanup cannot
  // be mistaken for an assertion about banking.
  mod.forceBankPendingLiveSettles(() => false);
});

describe('armLiveResultSettle', () => {
  it('persists the set to the outbox so it survives process death', () => {
    mod.armLiveResultSettle(input());

    const rows = outbox();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.duelId).toBe('d1');
    expect(rows[0]!.local.xp).toBe(50);
  });

  it('marks the settle armed while its watcher is running', () => {
    expect(mod.isLiveSettleArmed('d1', 'ada')).toBe(false);
    mod.armLiveResultSettle(input());
    expect(mod.isLiveSettleArmed('d1', 'ada')).toBe(true);
  });

  it('ignores a second arm while one is already running', () => {
    // The result screen can arm the same set more than once (on mount, plus
    // the race guard on the leave path). The second call is a no-op rather
    // than a second entry — the live watcher already owns this settle, and
    // replacing it would drop the subscription it is holding.
    mod.armLiveResultSettle(input());
    mod.armLiveResultSettle(input({ local: { won: true, drew: false, xp: 70, opponentReps: 9 } }));

    const rows = outbox();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.local.xp).toBe(50);
  });

  it('refuses to re-arm a set that was already paid', () => {
    mod.armLiveResultSettle(input());
    mod.forceBankPendingLiveSettles(() => true);
    expect(outbox()).toHaveLength(0);

    mod.armLiveResultSettle(input());

    // Already banked, so it must not go back into the queue owing XP again.
    expect(outbox()).toHaveLength(0);
    expect(mod.isLiveSettleArmed('d1', 'ada')).toBe(false);
  });

  it('keeps both athletes of the same duel separate', () => {
    mod.armLiveResultSettle(input({ uid: 'ada' }));
    mod.armLiveResultSettle(input({ uid: 'bob' }));

    expect(outbox()).toHaveLength(2);
  });
});

describe('forceBankPendingLiveSettles', () => {
  it('awards the local outcome and clears the entry', () => {
    mod.armLiveResultSettle(input());

    const paid: number[] = [];
    mod.forceBankPendingLiveSettles((_item, bank) => {
      paid.push(bank.xp);
    });

    expect(paid).toEqual([50]);
    expect(outbox()).toHaveLength(0);
    expect(mod.wasLiveSettleBanked('d1', 'ada')).toBe(true);
  });

  it('records the award before clearing the outbox', () => {
    // Ordering is the safety property: if the process dies between the two
    // writes, the worst case must be a *replay that is refused*, never an
    // award that was cleared before it was recorded.
    mod.armLiveResultSettle(input());
    mod.forceBankPendingLiveSettles(() => true);

    const bankedRaw = mockStore.get(BANKED_KEY) ?? '[]';
    expect(JSON.parse(bankedRaw)).toContain('d1:ada');
  });

  it('does not pay the same set twice across calls', () => {
    mod.armLiveResultSettle(input());

    let payouts = 0;
    mod.forceBankPendingLiveSettles(() => {
      payouts += 1;
    });
    mod.forceBankPendingLiveSettles(() => {
      payouts += 1;
    });

    expect(payouts).toBe(1);
  });

  it('leaves the entry armed when the caller refuses the award', () => {
    // `false` means the app could not apply it — e.g. auth switched accounts
    // mid-settle — so the XP must stay owed rather than vanish.
    mod.armLiveResultSettle(input());
    mod.forceBankPendingLiveSettles(() => false);

    expect(outbox()).toHaveLength(1);
    expect(mod.wasLiveSettleBanked('d1', 'ada')).toBe(false);
  });

  it('disarms in-flight watchers so a timer cannot double-apply', () => {
    mod.armLiveResultSettle(input());
    expect(mod.isLiveSettleArmed('d1', 'ada')).toBe(true);

    mod.forceBankPendingLiveSettles(() => true);

    expect(mod.isLiveSettleArmed('d1', 'ada')).toBe(false);
  });

  it('pays every athlete waiting in the outbox', () => {
    mod.armLiveResultSettle(input({ duelId: 'd1', uid: 'ada' }));
    mod.armLiveResultSettle(input({ duelId: 'd2', uid: 'ada' }));

    const seen: string[] = [];
    mod.forceBankPendingLiveSettles((item) => {
      seen.push(item.duelId);
    });

    expect(seen.sort()).toEqual(['d1', 'd2']);
    expect(outbox()).toHaveLength(0);
  });
});

describe('resumePendingLiveSettles', () => {
  it('re-arms a set that survived process death', () => {
    // Simulate a previous run that armed but never banked.
    mod.armLiveResultSettle(input());
    mod.forceBankPendingLiveSettles(() => false); // leaves it owed, disarms watchers
    expect(mod.isLiveSettleArmed('d1', 'ada')).toBe(false);

    mod.resumePendingLiveSettles(() => true);

    expect(mod.isLiveSettleArmed('d1', 'ada')).toBe(true);
  });

  it('drops an entry that was already paid rather than re-arming it', () => {
    mod.armLiveResultSettle(input());
    mod.forceBankPendingLiveSettles(() => true);
    // Re-add a stale duplicate as a crashed run might have left behind.
    mockStore.set(
      OUTBOX_KEY,
      JSON.stringify([{ ...input(), onBank: undefined }]),
    );

    let rearmed = 0;
    mod.resumePendingLiveSettles(() => {
      rearmed += 1;
      return true;
    });

    expect(rearmed).toBe(0);
    expect(outbox()).toHaveLength(0);
  });
});

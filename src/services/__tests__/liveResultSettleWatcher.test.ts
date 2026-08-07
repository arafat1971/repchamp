/**
 * Live-duel settle — the watcher/timer half.
 *
 * `liveResultSettle.test.ts` covers the durable half (outbox, banked set) and
 * says outright that the watcher and its timers are "a separate piece of work"
 * needing a duel-doc simulator and fake timers. This is that work: the paths
 * here decide **who won and what XP they keep** when the network is late,
 * flaky, or the opponent walks away, and they were the least-covered branches
 * in the codebase (18% on this file).
 *
 * The simulator is a fake `watchDuel` that hands the test the subscriber
 * callback, so a test can push duel snapshots in whatever order a real match
 * would produce and assert on the single `onBank` payload that results.
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

/* Jest hoists `jest.mock` above these declarations, so anything the factory
   closes over has to be `mock`-prefixed — that prefix is the only escape hatch
   from the out-of-scope-variable guard. */
const mockState: { emit: ((duel: unknown) => void) | null } = { emit: null };
const mockFinishDuel = jest.fn(async () => false);
const mockForceSettleAbandoned = jest.fn(async () => false);

jest.mock('@/services/duelService', () => ({
  watchDuel: jest.fn((_id: string, cb: (d: unknown) => void) => {
    mockState.emit = cb;
    return () => {
      mockState.emit = null;
    };
  }),
  finishDuel: mockFinishDuel,
  forceSettleAbandoned: mockForceSettleAbandoned,
  seatFor: jest.fn(() => null),
}));

/** Push a duel snapshot to the armed watcher. Throws if nothing is watching,
    so a test that silently stopped exercising the watcher fails loudly. */
function emit(duelDoc: unknown): void {
  if (!mockState.emit) throw new Error('no watcher armed — armLiveResultSettle was not called');
  mockState.emit(duelDoc);
}

import type { ArmLiveSettleInput, LiveSettleBank } from '../liveResultSettle';

type SettleModule = typeof import('../liveResultSettle');

/** Module holds `banked` + `active` in module scope — re-import per test. */
function freshModule(): SettleModule {
  let mod!: SettleModule;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolateModules needs a fresh require
    mod = require('../liveResultSettle') as SettleModule;
  });
  return mod;
}

const HOST = 'me-uid';
const GUEST = 'them-uid';

function player(uid: string, reps: number, done: boolean, forfeited = false) {
  return {
    uid,
    displayName: uid,
    avatarUrl: null,
    level: 1,
    reps,
    done,
    forfeited,
  };
}

/** A duel doc as the watcher would see it. `startedAt` in ms. */
function duel(over: Record<string, unknown> = {}) {
  return {
    id: 'd1',
    exercise: 'push',
    duration: 20,
    status: 'active',
    cooperative: false,
    hostUid: HOST,
    guestUid: GUEST,
    startedAt: Date.now(),
    host: player(HOST, 0, false),
    guest: player(GUEST, 0, false),
    ...over,
  };
}

function armInput(over: Partial<ArmLiveSettleInput> = {}): ArmLiveSettleInput {
  return {
    duelId: 'd1',
    uid: HOST,
    mode: 'versus',
    outcome: { reps: 10, formScore: 80 },
    local: { won: false, drew: false, xp: 0, opponentReps: 0 },
    record: {
      exercise: 'push',
      sessionMode: 'versus',
      reps: 10,
      target: null,
      formScore: 80,
      durationSec: 20,
    },
    onBank: () => true,
    ...over,
  };
}

/** The single payout a test expects, with the "did it pay at all" check baked
    in so `banks[0]` is never read off an empty array. */
function onlyBank(banks: LiveSettleBank[]): LiveSettleBank {
  expect(banks).toHaveLength(1);
  const first = banks[0];
  if (!first) throw new Error('no payout recorded');
  return first;
}

/** An `onBank` that records every payout so a test can assert on it. */
function collect(into: LiveSettleBank[]): ArmLiveSettleInput['onBank'] {
  return (bank) => {
    into.push(bank);
    return true;
  };
}

beforeEach(() => {
  mockStore.clear();
  mockState.emit = null;
  mockFinishDuel.mockClear();
  mockForceSettleAbandoned.mockClear();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('settling from the duel doc', () => {
  it('pays the winner when both seats finish with the local athlete ahead', () => {
    const mod = freshModule();
    const banks: LiveSettleBank[] = [];
    mod.armLiveResultSettle(armInput({ onBank: collect(banks) }));

    emit(
      duel({
        status: 'finished',
        host: player(HOST, 12, true),
        guest: player(GUEST, 7, true),
      }),
    );

    expect(banks).toHaveLength(1);
    expect(onlyBank(banks).won).toBe(true);
    expect(onlyBank(banks).drew).toBe(false);
    expect(onlyBank(banks).opponentReps).toBe(7);
    expect(onlyBank(banks).xp).toBeGreaterThan(0);
  });

  it('records a loss, not a win, when the opponent is ahead', () => {
    const mod = freshModule();
    const banks: LiveSettleBank[] = [];
    mod.armLiveResultSettle(armInput({ onBank: collect(banks) }));

    emit(
      duel({
        status: 'finished',
        host: player(HOST, 3, true),
        guest: player(GUEST, 9, true),
      }),
    );

    expect(banks).toHaveLength(1);
    expect(onlyBank(banks).won).toBe(false);
    expect(onlyBank(banks).opponentReps).toBe(9);
  });

  it('calls equal reps a draw', () => {
    const mod = freshModule();
    const banks: LiveSettleBank[] = [];
    mod.armLiveResultSettle(armInput({ onBank: collect(banks) }));

    emit(
      duel({
        status: 'finished',
        host: player(HOST, 5, true),
        guest: player(GUEST, 5, true),
      }),
    );

    expect(onlyBank(banks).won).toBe(false);
    expect(onlyBank(banks).drew).toBe(true);
  });

  it('hands the win to the athlete who stayed when the opponent forfeits', () => {
    const mod = freshModule();
    const banks: LiveSettleBank[] = [];
    mod.armLiveResultSettle(armInput({ onBank: collect(banks) }));

    emit(
      duel({
        status: 'finished',
        host: player(HOST, 2, true),
        guest: player(GUEST, 40, true, true), // more reps, but walked away
      }),
    );

    expect(onlyBank(banks).won).toBe(true);
  });

  /* Settling unsubscribes, so a repeat snapshot cannot even reach the handler —
     the watcher is torn down the moment the XP is banked. That is the stronger
     guarantee: not "a second payment is rejected" but "there is no longer
     anything listening to reject it". Re-arming is the path a duplicate would
     realistically take (a cold resume), and the banked set stops that too. */
  it('tears the watcher down once it settles, and will not re-arm for the same duel', () => {
    const mod = freshModule();
    const banks: LiveSettleBank[] = [];
    mod.armLiveResultSettle(armInput({ onBank: collect(banks) }));

    const finished = duel({
      status: 'finished',
      host: player(HOST, 12, true),
      guest: player(GUEST, 7, true),
    });
    emit(finished);

    expect(banks).toHaveLength(1);
    expect(mockState.emit).toBeNull(); // unsubscribed

    // A resume after the fact must not pay again.
    mod.armLiveResultSettle(armInput({ onBank: collect(banks) }));
    expect(mockState.emit).toBeNull(); // never even re-subscribed
    expect(banks).toHaveLength(1);
  });

  it('does not settle while one seat is still going', () => {
    const mod = freshModule();
    const banks: LiveSettleBank[] = [];
    mod.armLiveResultSettle(armInput({ onBank: collect(banks) }));

    emit(
      duel({
        host: player(HOST, 10, true),
        guest: player(GUEST, 4, false), // still training
      }),
    );

    expect(banks).toHaveLength(0);
  });
});

describe('the last-resort timer', () => {
  it('eventually pays out when the opponent never finishes', () => {
    const mod = freshModule();
    const banks: LiveSettleBank[] = [];
    mod.armLiveResultSettle(
      armInput({
        local: { won: true, drew: false, xp: 30, opponentReps: 4 },
        onBank: collect(banks),
      }),
    );

    // Opponent stops responding mid-set.
    emit(duel({ host: player(HOST, 10, true), guest: player(GUEST, 4, false) }));
    expect(banks).toHaveLength(0);

    // Past the set + abandon grace, the fallback fires rather than stranding XP.
    jest.advanceTimersByTime(20_000 + 60_000 + 30_000);

    expect(banks).toHaveLength(1);
    expect(onlyBank(banks).xp).toBe(30);
  });

  it('leaves the outbox armed when onBank refuses (uid mismatch on resume)', () => {
    const mod = freshModule();
    let calls = 0;
    mod.armLiveResultSettle(
      armInput({
        onBank: () => {
          calls += 1;
          return false; // a different athlete is signed in — do not pay
        },
      }),
    );

    emit(
      duel({
        status: 'finished',
        host: player(HOST, 12, true),
        guest: player(GUEST, 7, true),
      }),
    );

    expect(calls).toBe(1);
    expect(mod.wasLiveSettleBanked('d1', HOST)).toBe(false);
  });

  it('marks banked so a later resume cannot pay the same duel again', () => {
    const mod = freshModule();
    mod.armLiveResultSettle(armInput());

    emit(
      duel({
        status: 'finished',
        host: player(HOST, 12, true),
        guest: player(GUEST, 7, true),
      }),
    );

    expect(mod.wasLiveSettleBanked('d1', HOST)).toBe(true);
  });
});

describe('cooperative (together) mode', () => {
  it('counts reps as a win and never reports a draw', () => {
    const mod = freshModule();
    const banks: LiveSettleBank[] = [];
    mod.armLiveResultSettle(
      armInput({
        mode: 'together',
        outcome: { reps: 8, formScore: 70 },
        onBank: collect(banks),
      }),
    );

    emit(
      duel({
        status: 'finished',
        cooperative: true,
        host: player(HOST, 8, true),
        guest: player(GUEST, 3, true),
      }),
    );

    expect(onlyBank(banks).won).toBe(true);
    expect(onlyBank(banks).drew).toBe(false);
  });

  it('does not count a forfeited together-set as a win', () => {
    const mod = freshModule();
    const banks: LiveSettleBank[] = [];
    mod.armLiveResultSettle(
      armInput({
        mode: 'together',
        outcome: { reps: 0, formScore: 0, forfeited: true },
        onBank: collect(banks),
      }),
    );

    emit(
      duel({
        status: 'finished',
        cooperative: true,
        host: player(HOST, 0, true, true),
        guest: player(GUEST, 5, true),
      }),
    );

    expect(onlyBank(banks).won).toBe(false);
  });
});

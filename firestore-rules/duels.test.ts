/**
 * `duels/{duelId}` rules — the anti-cheat surface.
 *
 * Two things matter here: an athlete may only move their own seat, and reps may
 * only climb, in believable steps, up to a ceiling. The `done: true` waiver is
 * the deliberate exception — a finishing write may land the final score in one
 * shot so a dropped live tick cannot brick settlement.
 */

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

import { asUser, clearData, seat, seed, setupEnv, teardownEnv } from './harness';

const HOST = 'host-uid';
const GUEST = 'guest-uid';
const DUEL = 'duel-1';

beforeAll(async () => {
  await setupEnv();
});
afterAll(async () => {
  await teardownEnv();
});
beforeEach(async () => {
  await clearData();
});

async function seedActive(over: Record<string, unknown> = {}) {
  await seed(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'duels', DUEL), {
      hostUid: HOST,
      guestUid: GUEST,
      targetUid: null,
      status: 'active',
      host: seat(HOST, { reps: 10 }),
      guest: seat(GUEST, { reps: 10 }),
      createdAt: 1,
      ...over,
    });
  });
}

describe('seat isolation', () => {
  it('lets the host advance their own seat', async () => {
    await seedActive();
    await assertSucceeds(
      updateDoc(doc(asUser(HOST), 'duels', DUEL), { host: seat(HOST, { reps: 15 }) }),
    );
  });

  it("refuses the host writing the guest's seat", async () => {
    await seedActive();
    await assertFails(
      updateDoc(doc(asUser(HOST), 'duels', DUEL), { guest: seat(GUEST, { reps: 1 }) }),
    );
  });

  it('refuses a stranger writing either seat', async () => {
    await seedActive();
    await assertFails(
      updateDoc(doc(asUser('mallory'), 'duels', DUEL), { host: seat(HOST, { reps: 500 }) }),
    );
  });

  it('refuses a stranger reading an active duel', async () => {
    await seedActive();
    await assertFails(getDoc(doc(asUser('mallory'), 'duels', DUEL)));
  });
});

describe('rep fairness', () => {
  it('allows a live tick within the +8 cap', async () => {
    await seedActive();
    await assertSucceeds(
      updateDoc(doc(asUser(HOST), 'duels', DUEL), { host: seat(HOST, { reps: 18 }) }),
    );
  });

  it('refuses a live jump beyond +8', async () => {
    await seedActive();
    await assertFails(
      updateDoc(doc(asUser(HOST), 'duels', DUEL), { host: seat(HOST, { reps: 40 }) }),
    );
  });

  it('allows a big jump when the seat is finishing', async () => {
    await seedActive();
    await assertSucceeds(
      updateDoc(doc(asUser(HOST), 'duels', DUEL), {
        host: seat(HOST, { reps: 60, done: true }),
      }),
    );
  });

  it('refuses reps going backwards', async () => {
    await seedActive();
    await assertFails(
      updateDoc(doc(asUser(HOST), 'duels', DUEL), { host: seat(HOST, { reps: 2 }) }),
    );
  });

  it('refuses reps beyond the hard ceiling even when finishing', async () => {
    await seedActive();
    await assertFails(
      updateDoc(doc(asUser(HOST), 'duels', DUEL), {
        host: seat(HOST, { reps: 5000, done: true }),
      }),
    );
  });
});

describe('abandon settlement', () => {
  it('lets the host forfeit an abandoned guest seat at its last synced reps', async () => {
    await seedActive();
    await assertSucceeds(
      updateDoc(doc(asUser(HOST), 'duels', DUEL), {
        host: seat(HOST, { reps: 12, done: true }),
        guest: seat(GUEST, { reps: 10, done: true, forfeited: true }),
        status: 'finished',
        winnerUid: HOST,
      }),
    );
  });

  it('refuses a forfeit that also rewrites the abandoned seat’s reps', async () => {
    await seedActive();
    await assertFails(
      updateDoc(doc(asUser(HOST), 'duels', DUEL), {
        host: seat(HOST, { reps: 12, done: true }),
        guest: seat(GUEST, { reps: 0, done: true, forfeited: true }),
        status: 'finished',
        winnerUid: HOST,
      }),
    );
  });
});

describe('join', () => {
  it('lets an athlete take an open guest seat', async () => {
    await seed(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'duels', DUEL), {
        hostUid: HOST,
        guestUid: null,
        targetUid: null,
        status: 'pending',
        host: seat(HOST),
        guest: null,
        createdAt: 1,
      });
    });
    await assertSucceeds(
      updateDoc(doc(asUser(GUEST), 'duels', DUEL), {
        guestUid: GUEST,
        guest: seat(GUEST),
        status: 'active',
        startedAt: serverTimestamp(),
      }),
    );
  });

  it('refuses a joiner who seats themselves with reps banked', async () => {
    await seed(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'duels', DUEL), {
        hostUid: HOST,
        guestUid: null,
        targetUid: null,
        status: 'pending',
        host: seat(HOST),
        guest: null,
        createdAt: 1,
      });
    });
    await assertFails(
      updateDoc(doc(asUser(GUEST), 'duels', DUEL), {
        guestUid: GUEST,
        guest: seat(GUEST, { reps: 100 }),
        status: 'active',
        startedAt: serverTimestamp(),
      }),
    );
  });
});

describe('deleting a duel', () => {
  async function seedPending(over: Record<string, unknown> = {}) {
    await seed(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'duels', DUEL), {
        hostUid: HOST,
        guestUid: null,
        targetUid: null,
        status: 'pending',
        host: seat(HOST),
        guest: null,
        createdAt: 1,
        ...over,
      });
    });
  }

  it('lets the host withdraw a pending invite', async () => {
    await seedPending();
    await assertSucceeds(deleteDoc(doc(asUser(HOST), 'duels', DUEL)));
  });

  /* A host who is losing must not be able to erase the match, which would
     take the guest's result with it. */
  it('refuses the host deleting a live duel', async () => {
    await seedActive();
    await assertFails(deleteDoc(doc(asUser(HOST), 'duels', DUEL)));
  });

  it('lets either player delete a finished duel (account erasure)', async () => {
    await seedActive({ status: 'finished' });
    await assertSucceeds(deleteDoc(doc(asUser(GUEST), 'duels', DUEL)));
    await seedActive({ status: 'finished' });
    await assertSucceeds(deleteDoc(doc(asUser(HOST), 'duels', DUEL)));
  });

  it('refuses a stranger deleting a finished duel', async () => {
    await seedActive({ status: 'finished' });
    await assertFails(deleteDoc(doc(asUser('mallory'), 'duels', DUEL)));
  });

  it('lets the target decline an unjoined invite', async () => {
    await seedPending({ targetUid: GUEST });
    await assertSucceeds(deleteDoc(doc(asUser(GUEST), 'duels', DUEL)));
  });
});

describe('creating a duel', () => {
  it('refuses an unknown invite kind', async () => {
    await assertFails(
      setDoc(doc(asUser(HOST), 'duels', DUEL), {
        hostUid: HOST,
        guestUid: null,
        targetUid: null,
        status: 'pending',
        kind: 'bogus',
        host: seat(HOST),
        guest: null,
      }),
    );
  });

  it('refuses inviting yourself', async () => {
    await assertFails(
      setDoc(doc(asUser(HOST), 'duels', DUEL), {
        hostUid: HOST,
        guestUid: null,
        targetUid: HOST,
        status: 'pending',
        host: seat(HOST),
        guest: null,
      }),
    );
  });
});

describe('live writes to a settled duel', () => {
  it('refuses a live tick once the duel is finished', async () => {
    await seedActive({ status: 'finished' });
    await assertFails(
      updateDoc(doc(asUser(HOST), 'duels', DUEL), { host: seat(HOST, { reps: 12 }) }),
    );
  });

  it('refuses a live tick on a seat that has already finished', async () => {
    await seedActive({ host: seat(HOST, { reps: 10, done: true }) });
    await assertFails(
      updateDoc(doc(asUser(HOST), 'duels', DUEL), { host: seat(HOST, { reps: 14, done: true }) }),
    );
  });
});

describe('join touches only the guest seat and the clock', () => {
  async function seedOpen() {
    await seed(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'duels', DUEL), {
        hostUid: HOST,
        guestUid: null,
        targetUid: null,
        status: 'pending',
        exercise: 'push',
        duration: 60,
        host: seat(HOST),
        guest: null,
        winnerUid: null,
        createdAt: 1,
      });
    });
  }
  const join = (over: Record<string, unknown> = {}) =>
    updateDoc(doc(asUser(GUEST), 'duels', DUEL), {
      guestUid: GUEST,
      guest: seat(GUEST),
      status: 'active',
      startedAt: serverTimestamp(),
      ...over,
    });

  it('refuses a joiner rewriting the format', async () => {
    await seedOpen();
    await assertFails(join({ duration: 1 }));
  });

  it('refuses a joiner presetting the winner', async () => {
    await seedOpen();
    await assertFails(join({ winnerUid: GUEST }));
  });

  it("refuses a joiner renaming the host's seat", async () => {
    await seedOpen();
    await assertFails(join({ 'host.displayName': 'someone else' }));
  });

  it('refuses a join with a client-chosen start time', async () => {
    await seedOpen();
    await assertFails(join({ startedAt: Timestamp.fromMillis(1) }));
  });

  it('refuses a join with no start time', async () => {
    await seedOpen();
    await assertFails(
      updateDoc(doc(asUser(GUEST), 'duels', DUEL), {
        guestUid: GUEST,
        guest: seat(GUEST),
        status: 'active',
      }),
    );
  });
});

describe('settling', () => {
  it('refuses declaring a winner while the opponent is still playing', async () => {
    await seedActive();
    await assertFails(
      updateDoc(doc(asUser(HOST), 'duels', DUEL), { status: 'finished', winnerUid: HOST }),
    );
  });

  it('refuses finishing own seat and claiming the win before the opponent is done', async () => {
    await seedActive();
    await assertFails(
      updateDoc(doc(asUser(HOST), 'duels', DUEL), {
        host: seat(HOST, { reps: 60, done: true }),
        status: 'finished',
        winnerUid: HOST,
      }),
    );
  });

  it('refuses the host flipping a live duel back to pending (and so deleting it)', async () => {
    await seedActive();
    await assertFails(updateDoc(doc(asUser(HOST), 'duels', DUEL), { status: 'pending' }));
    await assertFails(deleteDoc(doc(asUser(HOST), 'duels', DUEL)));
  });

  it('refuses setting winnerUid on a live tick', async () => {
    await seedActive();
    await assertFails(
      updateDoc(doc(asUser(HOST), 'duels', DUEL), {
        host: seat(HOST, { reps: 12 }),
        winnerUid: HOST,
      }),
    );
  });

  it('lets the last finisher settle with the winner the scores produce', async () => {
    await seedActive({ guest: seat(GUEST, { reps: 30, done: true }), winnerUid: null });
    await assertSucceeds(
      updateDoc(doc(asUser(HOST), 'duels', DUEL), {
        host: seat(HOST, { reps: 20, done: true }),
        status: 'finished',
        winnerUid: GUEST,
      }),
    );
  });

  it('refuses the last finisher naming themselves winner with fewer reps', async () => {
    await seedActive({ guest: seat(GUEST, { reps: 30, done: true }), winnerUid: null });
    await assertFails(
      updateDoc(doc(asUser(HOST), 'duels', DUEL), {
        host: seat(HOST, { reps: 20, done: true }),
        status: 'finished',
        winnerUid: HOST,
      }),
    );
  });

  it('refuses leaving a duel active once both seats are done', async () => {
    await seedActive({ guest: seat(GUEST, { reps: 30, done: true }) });
    await assertFails(
      updateDoc(doc(asUser(HOST), 'duels', DUEL), { host: seat(HOST, { reps: 20, done: true }) }),
    );
  });

  it('settles a tie as a draw', async () => {
    await seedActive({ guest: seat(GUEST, { reps: 20, done: true }) });
    await assertSucceeds(
      updateDoc(doc(asUser(HOST), 'duels', DUEL), {
        host: seat(HOST, { reps: 20, done: true }),
        status: 'finished',
        winnerUid: null,
      }),
    );
  });

  it('a forfeit loses even with more reps', async () => {
    await seedActive({ guest: seat(GUEST, { reps: 10, done: true }) });
    await assertSucceeds(
      updateDoc(doc(asUser(HOST), 'duels', DUEL), {
        host: seat(HOST, { reps: 40, done: true, forfeited: true }),
        status: 'finished',
        winnerUid: GUEST,
      }),
    );
  });

  it('lets a together set finish with no winner', async () => {
    await seedActive({ cooperative: true, guest: seat(GUEST, { reps: 30, done: true }) });
    await assertSucceeds(
      updateDoc(doc(asUser(HOST), 'duels', DUEL), {
        host: seat(HOST, { reps: 20, done: true }),
        status: 'finished',
        winnerUid: null,
      }),
    );
  });
});

describe('forfeit window', () => {
  const forfeitGuest = () =>
    updateDoc(doc(asUser(HOST), 'duels', DUEL), {
      host: seat(HOST, { reps: 12, done: true }),
      guest: seat(GUEST, { reps: 10, done: true, forfeited: true }),
      status: 'finished',
      winnerUid: HOST,
    });

  it('refuses forfeiting the opponent while the match is still running', async () => {
    await seedActive({ duration: 60, startedAt: Timestamp.now() });
    await assertFails(forfeitGuest());
  });

  it('refuses forfeiting inside the grace period after the clock', async () => {
    await seedActive({ duration: 60, startedAt: Timestamp.fromMillis(Date.now() - 90_000) });
    await assertFails(forfeitGuest());
  });

  it('allows forfeiting once the match window and grace have passed', async () => {
    await seedActive({ duration: 60, startedAt: Timestamp.fromMillis(Date.now() - 180_000) });
    await assertSucceeds(forfeitGuest());
  });
});

describe('reading', () => {
  it('answers a get on a duel that does not exist instead of throwing', async () => {
    const snap = await assertSucceeds(getDoc(doc(asUser(GUEST), 'duels', 'never-existed')));
    expect(snap.exists()).toBe(false);
  });

  async function seedOpenInvite() {
    await seed(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'duels', DUEL), {
        hostUid: HOST,
        guestUid: null,
        targetUid: null,
        status: 'pending',
        host: seat(HOST),
        guest: null,
      });
    });
  }

  it('lets a scanner get an open invite by id', async () => {
    await seedOpenInvite();
    await assertSucceeds(getDoc(doc(asUser('scanner'), 'duels', DUEL)));
  });

  it('refuses a stranger listing open invites', async () => {
    await seedOpenInvite();
    await assertFails(
      getDocs(
        query(
          collection(asUser('mallory'), 'duels'),
          where('status', '==', 'pending'),
          where('targetUid', '==', null),
          where('guestUid', '==', null),
        ),
      ),
    );
  });

  it('still lets a player list their own duels', async () => {
    await seedActive();
    await assertSucceeds(
      getDocs(
        query(
          collection(asUser(HOST), 'duels'),
          where('hostUid', '==', HOST),
          where('status', '==', 'active'),
        ),
      ),
    );
  });
});

describe('duel shape', () => {
  const invite = (over: Record<string, unknown> = {}) => ({
    id: DUEL,
    exercise: 'push',
    duration: 60,
    status: 'pending',
    hostUid: HOST,
    guestUid: null,
    targetUid: GUEST,
    host: seat(HOST),
    guest: null,
    winnerUid: null,
    cooperative: false,
    kind: 'duel',
    createdAt: serverTimestamp(),
    ...over,
  });
  const create = (over: Record<string, unknown> = {}) =>
    setDoc(doc(asUser(HOST), 'duels', DUEL), invite(over));

  it('accepts the document createDuel writes', async () => {
    await assertSucceeds(create());
  });

  it('refuses unknown top-level fields', async () => {
    await assertFails(create({ junk: 'x' }));
  });

  it('refuses a preset winner', async () => {
    await assertFails(create({ winnerUid: HOST }));
  });

  it('refuses a host seat that starts finished', async () => {
    await assertFails(create({ host: seat(HOST, { done: true }) }));
  });

  it('refuses an oversized host name', async () => {
    await assertFails(create({ host: seat(HOST, { displayName: 'x'.repeat(201) }) }));
  });

  it('refuses an absurd duration', async () => {
    await assertFails(create({ duration: 999999 }));
  });

  it('refuses unknown fields on a live seat write', async () => {
    await seedActive();
    await assertFails(
      updateDoc(doc(asUser(HOST), 'duels', DUEL), { host: seat(HOST, { reps: 12, junk: 'x' }) }),
    );
  });

  it('refuses a forfeit that renames the abandoned seat', async () => {
    await seedActive();
    await assertFails(
      updateDoc(doc(asUser(HOST), 'duels', DUEL), {
        host: seat(HOST, { reps: 12, done: true }),
        guest: seat(GUEST, { reps: 10, done: true, forfeited: true, displayName: 'loser' }),
        status: 'finished',
        winnerUid: HOST,
      }),
    );
  });
});

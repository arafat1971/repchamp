/**
 * `matchmaking/{ticketUid}` rules.
 *
 * The queue is the one place a client writes to *another athlete's* document:
 * `tryPair` flips a waiting stranger's ticket to `matched`. The rules bound that
 * to a real duel that actually seats both athletes, and freeze everything on the
 * ticket that the claimer has no business moving — now including the expiry
 * pair, which decides when the ticket is collected and whether it still counts
 * as pairable.
 */

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';

import { asAnon, asUser, clearData, seed, setupEnv, teardownEnv } from './harness';

const WAITER = 'waiter';
const SEEKER = 'seeker';
const DUEL = 'duel-1';
const EXPIRES_AT = 1_800_000_000_000;

beforeAll(async () => {
  await setupEnv();
});
afterAll(async () => {
  await teardownEnv();
});
beforeEach(async () => {
  await clearData();
});

function ticket(uid: string, over: Record<string, unknown> = {}) {
  return {
    uid,
    displayName: 'Athlete',
    avatarUrl: null,
    level: 3,
    exercise: 'push',
    duration: 20,
    status: 'waiting',
    duelId: null,
    expiresAt: EXPIRES_AT,
    ...over,
  };
}

/** A waiting ticket plus the active duel that justifies claiming it. */
async function seedClaimable() {
  await seed(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'matchmaking', WAITER), ticket(WAITER));
    await setDoc(doc(ctx.firestore(), 'duels', DUEL), {
      hostUid: WAITER,
      guestUid: SEEKER,
      targetUid: null,
      status: 'active',
      host: { uid: WAITER, reps: 0, done: false },
      guest: { uid: SEEKER, reps: 0, done: false },
    });
  });
}

describe('own ticket', () => {
  it('lets an athlete create their own ticket', async () => {
    await assertSucceeds(
      setDoc(doc(asUser(WAITER), 'matchmaking', WAITER), ticket(WAITER)),
    );
  });

  it("refuses creating a ticket under someone else's uid", async () => {
    await assertFails(
      setDoc(doc(asUser(SEEKER), 'matchmaking', WAITER), ticket(WAITER)),
    );
  });

  it('refuses an unauthenticated write', async () => {
    await assertFails(setDoc(doc(asAnon(), 'matchmaking', WAITER), ticket(WAITER)));
  });

  it('lets the owner re-stamp their own expiry (re-enqueue)', async () => {
    await seedClaimable();
    await assertSucceeds(
      updateDoc(doc(asUser(WAITER), 'matchmaking', WAITER), { expiresAt: EXPIRES_AT + 60_000 }),
    );
  });

  it('lets the owner delete their own ticket', async () => {
    await seedClaimable();
    await assertSucceeds(
      setDoc(doc(asUser(WAITER), 'matchmaking', WAITER), ticket(WAITER, { status: 'cancelled' })),
    );
  });
});

describe('claiming a stranger’s ticket', () => {
  it('allows the flip to matched when a real duel seats both athletes', async () => {
    await seedClaimable();
    await assertSucceeds(
      updateDoc(doc(asUser(SEEKER), 'matchmaking', WAITER), {
        status: 'matched',
        duelId: DUEL,
      }),
    );
  });

  it('refuses a claim pointing at a duel that does not exist', async () => {
    await seedClaimable();
    await assertFails(
      updateDoc(doc(asUser(SEEKER), 'matchmaking', WAITER), {
        status: 'matched',
        duelId: 'no-such-duel',
      }),
    );
  });

  it('refuses a claim by someone who is not the duel’s guest', async () => {
    await seedClaimable();
    await assertFails(
      updateDoc(doc(asUser('mallory'), 'matchmaking', WAITER), {
        status: 'matched',
        duelId: DUEL,
      }),
    );
  });

  it('refuses rewriting the waiting athlete’s identity while claiming', async () => {
    await seedClaimable();
    await assertFails(
      updateDoc(doc(asUser(SEEKER), 'matchmaking', WAITER), {
        status: 'matched',
        duelId: DUEL,
        displayName: 'Renamed',
      }),
    );
  });

  // The expiry pair is what the TTL policy and `canPair` both read. A claimer
  // who could move it could keep a rival's ticket alive forever, or expire it
  // out from under them.
  it('refuses extending the claimed ticket’s expiry', async () => {
    await seedClaimable();
    await assertFails(
      updateDoc(doc(asUser(SEEKER), 'matchmaking', WAITER), {
        status: 'matched',
        duelId: DUEL,
        expiresAt: EXPIRES_AT + 86_400_000,
      }),
    );
  });

  it('refuses expiring the claimed ticket on the spot', async () => {
    await seedClaimable();
    await assertFails(
      updateDoc(doc(asUser(SEEKER), 'matchmaking', WAITER), {
        status: 'matched',
        duelId: DUEL,
        expiresAt: 1,
      }),
    );
  });

  it('refuses deleting a stranger’s ticket', async () => {
    await seedClaimable();
    await assertFails(
      setDoc(doc(asUser(SEEKER), 'matchmaking', WAITER), ticket(WAITER, { status: 'cancelled' })),
    );
  });
});

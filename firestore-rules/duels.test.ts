/**
 * `duels/{duelId}` rules — the anti-cheat surface.
 *
 * Two things matter here: an athlete may only move their own seat, and reps may
 * only climb, in believable steps, up to a ceiling. The `done: true` waiver is
 * the deliberate exception — a finishing write may land the final score in one
 * shot so a dropped live tick cannot brick settlement.
 */

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

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
      }),
    );
  });
});

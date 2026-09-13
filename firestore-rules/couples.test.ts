/**
 * `couples/{coupleId}` rules.
 *
 * The couple document is the only place in the schema where two athletes write
 * to one doc, so "you may only touch your own slice" is the rule that carries
 * the weight — and it is the one that was quietly not being enforced.
 */

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

import {
  asUser,
  clearData,
  member,
  seed,
  setupEnv,
  teardownEnv,
} from './harness';

const ALICE = 'alice';
const BOB = 'bob';
const CODE = 'AB3D7K';

beforeAll(async () => {
  await setupEnv();
});
afterAll(async () => {
  await teardownEnv();
});
beforeEach(async () => {
  await clearData();
});

/** A paired couple: Alice in seat 0, Bob in seat 1. */
async function seedPaired() {
  await seed(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'couples', CODE), {
      id: CODE,
      memberUids: [ALICE, BOB],
      members: [member(ALICE), member(BOB)],
      pending: false,
      createdAt: 1,
    });
  });
}

/** A pending invite with only Alice seated. */
async function seedPending(aliceOver: Record<string, unknown> = {}) {
  await seed(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'couples', CODE), {
      id: CODE,
      memberUids: [ALICE],
      members: [member(ALICE, aliceOver)],
      pending: true,
      createdAt: 1,
    });
  });
}

describe('own-slice enforcement', () => {
  it('lets an athlete update their own member stats', async () => {
    await seedPaired();
    await assertSucceeds(
      updateDoc(doc(asUser(ALICE), 'couples', CODE), {
        members: [member(ALICE, { totalReps: 50, trainedDays: ['2026-08-07'] }), member(BOB)],
      }),
    );
  });

  it("refuses to let an athlete inflate their partner's reps", async () => {
    await seedPaired();
    await assertFails(
      updateDoc(doc(asUser(ALICE), 'couples', CODE), {
        members: [member(ALICE), member(BOB, { totalReps: 9999 })],
      }),
    );
  });

  // P1-2. On a single-member couple `onlyOwnMemberStatsChanged` compared
  // `resource.data.members[0].uid` to itself — a tautology — so the branch
  // enforced nothing beyond bare membership. This is the case that proves it.
  it('refuses a non-member writing the sole member slice of a pending couple', async () => {
    await seedPending();
    await assertFails(
      updateDoc(doc(asUser(BOB), 'couples', CODE), {
        members: [member(ALICE, { totalReps: 9999 })],
      }),
    );
  });

  it('lets the sole member update their own slice while pending', async () => {
    await seedPending();
    await assertSucceeds(
      updateDoc(doc(asUser(ALICE), 'couples', CODE), {
        members: [member(ALICE, { totalReps: 25 })],
      }),
    );
  });
});

describe('join', () => {
  it('lets a second athlete take the open seat', async () => {
    await seedPending();
    await assertSucceeds(
      updateDoc(doc(asUser(BOB), 'couples', CODE), {
        memberUids: [ALICE, BOB],
        members: [member(ALICE), member(BOB)],
        pending: false,
      }),
    );
  });

  it('refuses a joiner who seats themselves with reps already on the clock', async () => {
    await seedPending();
    await assertFails(
      updateDoc(doc(asUser(BOB), 'couples', CODE), {
        memberUids: [ALICE, BOB],
        members: [member(ALICE), member(BOB, { totalReps: 500 })],
        pending: false,
      }),
    );
  });

  it("refuses a joiner who rewrites the host's stats in the same write", async () => {
    await seedPending();
    await assertFails(
      updateDoc(doc(asUser(BOB), 'couples', CODE), {
        memberUids: [ALICE, BOB],
        members: [member(ALICE, { totalReps: 1 }), member(BOB)],
        pending: false,
      }),
    );
  });

  // P1-3. `isJoin()` validated the member entries but never constrained the key
  // set, so a joiner could smuggle arbitrary fields onto someone else's doc.
  it('refuses a joiner who injects an unrelated top-level field', async () => {
    await seedPending();
    await assertFails(
      updateDoc(doc(asUser(BOB), 'couples', CODE), {
        memberUids: [ALICE, BOB],
        members: [member(ALICE), member(BOB)],
        pending: false,
        injected: 'should not be writable',
      }),
    );
  });

  // Same gap: `createdAt` ordered the doc and nothing pinned it on join.
  it('refuses a joiner who rewrites createdAt', async () => {
    await seedPending();
    await assertFails(
      updateDoc(doc(asUser(BOB), 'couples', CODE), {
        memberUids: [ALICE, BOB],
        members: [member(ALICE), member(BOB)],
        pending: false,
        createdAt: 999999,
      }),
    );
  });

  // Backward compatibility with builds already in the field.
  //
  // `hasOnly` caps *changed* keys, not the payload: `affectedKeys()` reports
  // only what actually differs. So the shipped `joinCoupleByCode`, which merges
  // the entire document back (`id`, `createdAt`, and any `nudge` included),
  // still joins cleanly — the re-sent fields are identical and never register.
  // Worth pinning, because reading `hasOnly` as a cap on the payload is the
  // obvious misreading, and acting on it would mean either breaking every
  // installed app or loosening a rule that never needed loosening.
  it('accepts a joiner that re-sends unchanged id/createdAt (pre-update client)', async () => {
    await seedPending();
    await assertSucceeds(
      setDoc(
        doc(asUser(BOB), 'couples', CODE),
        {
          id: CODE,
          createdAt: 1,
          memberUids: [ALICE, BOB],
          members: [member(ALICE), member(BOB)],
          pending: false,
          pairedAt: 12345,
        },
        { merge: true },
      ),
    );
  });

  it('accepts that same whole-document merge when a nudge is already present', async () => {
    await seed(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'couples', CODE), {
        id: CODE,
        memberUids: [ALICE],
        members: [member(ALICE)],
        pending: true,
        createdAt: 1,
        nudge: { fromUid: ALICE, at: 5 },
      });
    });
    await assertSucceeds(
      setDoc(
        doc(asUser(BOB), 'couples', CODE),
        {
          id: CODE,
          createdAt: 1,
          nudge: { fromUid: ALICE, at: 5 },
          memberUids: [ALICE, BOB],
          members: [member(ALICE), member(BOB)],
          pending: false,
          pairedAt: 12345,
        },
        { merge: true },
      ),
    );
  });
});

describe('reads', () => {
  it('lets a member read their couple', async () => {
    await seedPaired();
    await assertSucceeds(getDoc(doc(asUser(ALICE), 'couples', CODE)));
  });

  it('refuses a stranger reading a paired couple', async () => {
    await seedPaired();
    await assertFails(getDoc(doc(asUser('mallory'), 'couples', CODE)));
  });

  // The pending-read rule is intentional — it is how a partner finds the invite
  // by code. P1-1 is the client-side counterpart: because this doc is reachable
  // by anyone holding a 6-char code, no push token may sit on it while pending.
  it('allows reading a pending invite by code (by design)', async () => {
    await seedPending();
    await assertSucceeds(getDoc(doc(asUser(BOB), 'couples', CODE)));
  });
});

describe('nudge', () => {
  it('lets a member write a nudge', async () => {
    await seedPaired();
    await assertSucceeds(
      updateDoc(doc(asUser(ALICE), 'couples', CODE), { nudge: { fromUid: ALICE, at: 123 } }),
    );
  });

  it('refuses a stranger writing a nudge', async () => {
    await seedPaired();
    await assertFails(
      updateDoc(doc(asUser('mallory'), 'couples', CODE), {
        nudge: { fromUid: 'mallory', at: 123 },
      }),
    );
  });
});

describe('reading a couple that does not exist yet', () => {
  /* `createCouple` opens its transaction with `tx.get(ref)` on a freshly
     minted pair code, so the very first thing it does is read a document that
     is definitionally absent. The get rule used to dereference `resource.data`
     unguarded, which threw `Null value error` and denied the read — creation
     failed before it attempted a single write, and surfaced to the athlete as
     `[firestore/unknown] PERMISSION_DENIED`, which reads like a write problem
     and is not one.

     Nothing covered this: every other get case seeds a document first. */
  it('allows a get on a missing doc, which is what create must do first', async () => {
    await assertSucceeds(getDoc(doc(asUser(ALICE), 'couples', 'NOSUCH1')));
  });

  it('still hides a couple the caller is not part of', async () => {
    await seedPaired();
    await assertFails(getDoc(doc(asUser('stranger'), 'couples', CODE)));
  });

  it('still lets a stranger read a pending invite by code', async () => {
    await seedPending();
    await assertSucceeds(getDoc(doc(asUser('stranger'), 'couples', CODE)));
  });
});

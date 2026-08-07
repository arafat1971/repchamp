/**
 * `leaderboard/{uid}` rules.
 *
 * The interesting case is `weekKey`: `scoreMonotonic()` waives the "weekly XP
 * only climbs" guard whenever the key changes, which is correct for a genuine
 * week rollover and a free pass for anything else. Pinning the key's shape is
 * what stops that waiver being trivially summonable, so it is tested directly.
 */

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

import { asAnon, asUser, clearData, seed, setupEnv, teardownEnv, weekKey } from './harness';

const ALICE = 'alice';
const BOB = 'bob';

beforeAll(async () => {
  await setupEnv();
});
afterAll(async () => {
  await teardownEnv();
});
beforeEach(async () => {
  await clearData();
});

function row(uid: string, over: Record<string, unknown> = {}) {
  return {
    uid,
    displayName: 'Athlete',
    weeklyXp: 100,
    totalXp: 1000,
    weekKey: weekKey(),
    ...over,
  };
}

async function seedRow(uid: string, over: Record<string, unknown> = {}) {
  await seed(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'leaderboard', uid), row(uid, over));
  });
}

describe('score rows', () => {
  it('lets an owner publish their own row', async () => {
    await assertSucceeds(setDoc(doc(asUser(ALICE), 'leaderboard', ALICE), row(ALICE)));
  });

  it("refuses writing another athlete's row", async () => {
    await assertFails(setDoc(doc(asUser(BOB), 'leaderboard', ALICE), row(ALICE)));
  });

  it('lets any signed-in athlete read the board', async () => {
    await seedRow(ALICE);
    await assertSucceeds(getDoc(doc(asUser(BOB), 'leaderboard', ALICE)));
  });

  it('refuses an unauthenticated read', async () => {
    await seedRow(ALICE);
    await assertFails(getDoc(doc(asAnon(), 'leaderboard', ALICE)));
  });

  it('refuses an absurd weekly score', async () => {
    await assertFails(
      setDoc(doc(asUser(ALICE), 'leaderboard', ALICE), row(ALICE, { weeklyXp: 999999 })),
    );
  });
});

describe('weekKey shape', () => {
  it('refuses a malformed weekKey', async () => {
    await assertFails(
      setDoc(doc(asUser(ALICE), 'leaderboard', ALICE), row(ALICE, { weekKey: 'whenever' })),
    );
  });

  // The bypass the shape check exists to close: junk in `weekKey` made the
  // keys differ, which waived monotonicity and let weeklyXp be written down.
  it('refuses using a junk weekKey to dodge weekly monotonicity', async () => {
    await seedRow(ALICE, { weeklyXp: 900 });
    await assertFails(
      setDoc(
        doc(asUser(ALICE), 'leaderboard', ALICE),
        row(ALICE, { weeklyXp: 1, weekKey: 'not-a-week' }),
      ),
    );
  });

  it('allows weeklyXp to reset on a genuine week rollover', async () => {
    await seedRow(ALICE, { weeklyXp: 900 });
    await assertSucceeds(
      setDoc(
        doc(asUser(ALICE), 'leaderboard', ALICE),
        row(ALICE, { weeklyXp: 10, weekKey: '2026-W32' }),
      ),
    );
  });
});

describe('monotonicity', () => {
  it('refuses lowering weeklyXp within the same week', async () => {
    await seedRow(ALICE, { weeklyXp: 900 });
    await assertFails(
      setDoc(doc(asUser(ALICE), 'leaderboard', ALICE), row(ALICE, { weeklyXp: 10 })),
    );
  });

  it('refuses lowering lifetime XP even across a week boundary', async () => {
    await seedRow(ALICE, { totalXp: 9000 });
    await assertFails(
      setDoc(
        doc(asUser(ALICE), 'leaderboard', ALICE),
        row(ALICE, { totalXp: 10, weekKey: '2026-W32' }),
      ),
    );
  });
});

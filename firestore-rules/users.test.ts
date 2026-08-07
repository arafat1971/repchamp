/**
 * `users/{uid}` rules — the public profile slice and its owner-only subtrees.
 */

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteField, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

import { asAnon, asUser, clearData, profile, seed, setupEnv, teardownEnv } from './harness';

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

async function seedProfile(uid: string, over: Record<string, unknown> = {}) {
  await seed(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', uid), profile(uid, over));
  });
}

describe('profile writes', () => {
  it('lets an owner create their own profile', async () => {
    await assertSucceeds(setDoc(doc(asUser(ALICE), 'users', ALICE), profile(ALICE)));
  });

  it('refuses writing to someone else’s profile', async () => {
    await assertFails(setDoc(doc(asUser(BOB), 'users', ALICE), profile(ALICE)));
  });

  it('refuses an unauthenticated write', async () => {
    await assertFails(setDoc(doc(asAnon(), 'users', ALICE), profile(ALICE)));
  });

  it('refuses a profile whose uid field does not match the doc id', async () => {
    await assertFails(setDoc(doc(asUser(ALICE), 'users', ALICE), profile(BOB)));
  });

  // This is the P0-2 failure mode, pinned: a bare merge to a doc that does not
  // exist is a create with no `uid`/`totalXp`, and the rules reject it. The fix
  // is in the client (`saveExpoPushToken` now checks existence first), so this
  // test documents *why* that guard has to be there.
  it('refuses a partial merge that creates a doc with no uid or totalXp', async () => {
    await assertFails(
      setDoc(doc(asUser(ALICE), 'users', ALICE), { expoPushToken: deleteField() }, { merge: true }),
    );
  });

  it('allows the same legacy-token strip once the profile exists', async () => {
    await seedProfile(ALICE, { expoPushToken: 'ExponentPushToken[legacy]' });
    await assertSucceeds(
      setDoc(doc(asUser(ALICE), 'users', ALICE), { expoPushToken: deleteField() }, { merge: true }),
    );
  });

  it('refuses storing a push token on the public profile', async () => {
    await assertSucceeds(setDoc(doc(asUser(ALICE), 'users', ALICE), profile(ALICE)));
    await assertFails(
      updateDoc(doc(asUser(ALICE), 'users', ALICE), {
        expoPushToken: 'ExponentPushToken[abc]',
      }),
    );
  });
});

describe('anti-tamper invariants', () => {
  it('refuses lowering lifetime XP', async () => {
    await seedProfile(ALICE, { totalXp: 5000 });
    await assertFails(
      setDoc(doc(asUser(ALICE), 'users', ALICE), profile(ALICE, { totalXp: 10 })),
    );
  });

  it('allows raising lifetime XP', async () => {
    await seedProfile(ALICE, { totalXp: 5000 });
    await assertSucceeds(
      setDoc(doc(asUser(ALICE), 'users', ALICE), profile(ALICE, { totalXp: 6000 })),
    );
  });

  it('refuses rewriting createdAt', async () => {
    await seedProfile(ALICE, { createdAt: 1000 });
    await assertFails(
      setDoc(doc(asUser(ALICE), 'users', ALICE), profile(ALICE, { createdAt: 2000 })),
    );
  });

  it('refuses an absurd XP value', async () => {
    await assertFails(
      setDoc(doc(asUser(ALICE), 'users', ALICE), profile(ALICE, { totalXp: 999999999999 })),
    );
  });

  it('allows a presence-only heartbeat', async () => {
    await seedProfile(ALICE);
    await assertSucceeds(
      updateDoc(doc(asUser(ALICE), 'users', ALICE), { lastActiveAt: Date.now() }),
    );
  });
});

describe('avatars', () => {
  it('accepts a base64 data-URI avatar', async () => {
    await assertSucceeds(
      setDoc(
        doc(asUser(ALICE), 'users', ALICE),
        profile(ALICE, { avatarUrl: 'data:image/png;base64,iVBORw0KGgo=' }),
      ),
    );
  });

  it('accepts clearing the avatar', async () => {
    await seedProfile(ALICE, { avatarUrl: 'data:image/png;base64,iVBORw0KGgo=' });
    await assertSucceeds(
      setDoc(doc(asUser(ALICE), 'users', ALICE), { avatarUrl: null }, { merge: true }),
    );
  });

  it('refuses an avatar payload beyond the document-safety ceiling', async () => {
    await assertFails(
      setDoc(
        doc(asUser(ALICE), 'users', ALICE),
        profile(ALICE, { avatarUrl: `data:image/png;base64,${'A'.repeat(70000)}` }),
      ),
    );
  });
});

describe('private subtree', () => {
  it('lets the owner read and write their own push token', async () => {
    await assertSucceeds(
      setDoc(doc(asUser(ALICE), 'users', ALICE, 'private', 'push'), {
        expoPushToken: 'ExponentPushToken[abc]',
      }),
    );
    await assertSucceeds(getDoc(doc(asUser(ALICE), 'users', ALICE, 'private', 'push')));
  });

  it("refuses another athlete reading someone's private push token", async () => {
    await seed(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', ALICE, 'private', 'push'), {
        expoPushToken: 'ExponentPushToken[abc]',
      });
    });
    await assertFails(getDoc(doc(asUser(BOB), 'users', ALICE, 'private', 'push')));
  });
});

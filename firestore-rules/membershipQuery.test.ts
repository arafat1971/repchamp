/**
 * `findMembershipId`'s list query against a REALISTIC collection.
 *
 * `createCouple` runs this query first, before it ever attempts a create:
 *
 *     couples.where('memberUids', 'array-contains', uid).limit(1)
 *
 * governed by `allow list: isAuthed() && request.auth.uid in resource.data.memberUids`.
 *
 * An earlier version of this test ran against an EMPTY collection and passed,
 * which proved nothing: with no documents in scope there is nothing for the
 * rule to reject. Production holds other athletes' pending invites, so these
 * cases seed foreign documents deliberately.
 */

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDocs, limit, query, setDoc, where } from 'firebase/firestore';

import { asUser, clearData, member, seed, setupEnv, teardownEnv } from './harness';

const ALICE = 'alice';
const BOB = 'bob';
const LONER = 'loner';

beforeAll(async () => {
  await setupEnv();
});
afterAll(async () => {
  await teardownEnv();
});
beforeEach(async () => {
  await clearData();
});

/** A couple that belongs to somebody else entirely. */
async function seedForeignCouple(id: string) {
  await seed(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'couples', id), {
      id,
      memberUids: [ALICE, BOB],
      members: [member(ALICE), member(BOB)],
      pending: false,
      createdAt: 1,
    });
  });
}

/** A pending invite owned by the caller. */
async function seedOwnInvite(id: string, uid: string) {
  await seed(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'couples', id), {
      id,
      memberUids: [uid],
      members: [member(uid)],
      pending: true,
      createdAt: 1,
    });
  });
}

function membershipQuery(uid: string) {
  return query(
    collection(asUser(uid), 'couples'),
    where('memberUids', 'array-contains', uid),
    limit(1),
  );
}

describe('findMembershipId list query', () => {
  it('succeeds against an empty collection (the misleading case)', async () => {
    await assertSucceeds(getDocs(membershipQuery(LONER)));
  });

  it('succeeds for an athlete with no couple while OTHER couples exist', async () => {
    await seedForeignCouple('FOREIGN1');
    await seedForeignCouple('FOREIGN2');
    await assertSucceeds(getDocs(membershipQuery(LONER)));
  });

  it('succeeds for an athlete who owns an invite, with foreign couples present', async () => {
    await seedForeignCouple('FOREIGN1');
    await seedOwnInvite('MINE01', LONER);
    await assertSucceeds(getDocs(membershipQuery(LONER)));
  });
});

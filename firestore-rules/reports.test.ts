/**
 * `reports/{reportId}` rules.
 *
 * The only collection in the rules file that had no suite at all — and the one
 * where a mistake is worst in both directions: too loose and it is a spam
 * funnel, too tight and someone being harassed cannot report it.
 *
 * The contract is write-only. A reporter may create their own report and
 * nothing else: no read, no update, no delete, by anyone. Review happens in the
 * console, so "the client can never read this back" is the privacy promise, not
 * an implementation detail.
 *
 * Field shapes mirror `createReport` in src/services/safetyService.ts.
 */

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { addDoc, collection, deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

import { asAnon, asUser, clearData, seed, setupEnv, teardownEnv } from './harness';

const REPORTER = 'reporter';
const TARGET = 'target';
const REPORT_ID = 'REPORT1';

beforeAll(async () => {
  await setupEnv();
});
afterAll(async () => {
  await teardownEnv();
});
beforeEach(async () => {
  await clearData();
});

/** The shape `createReport` actually sends. */
function report(over: Record<string, unknown> = {}) {
  return {
    reporterUid: REPORTER,
    targetUid: TARGET,
    reason: 'harassment',
    note: 'Repeated abusive messages.',
    context: 'duel',
    clientAt: 1,
    ...over,
  };
}

describe('creating a report', () => {
  it('lets a signed-in athlete report somebody else', async () => {
    await assertSucceeds(addDoc(collection(asUser(REPORTER), 'reports'), report()));
  });

  it('accepts a minimal report with no note or context', async () => {
    await assertSucceeds(
      addDoc(collection(asUser(REPORTER), 'reports'), {
        reporterUid: REPORTER,
        targetUid: TARGET,
        reason: 'spam',
      }),
    );
  });

  it('refuses an anonymous reporter', async () => {
    await assertFails(addDoc(collection(asAnon(), 'reports'), report()));
  });

  it('refuses a forged reporterUid — you may only report as yourself', async () => {
    await assertFails(
      addDoc(collection(asUser(REPORTER), 'reports'), report({ reporterUid: 'someone-else' })),
    );
  });

  it('refuses self-reporting', async () => {
    await assertFails(
      addDoc(collection(asUser(REPORTER), 'reports'), report({ targetUid: REPORTER })),
    );
  });
});

describe('payload caps keep spam small', () => {
  it('refuses an over-long reason', async () => {
    await assertFails(
      addDoc(collection(asUser(REPORTER), 'reports'), report({ reason: 'x'.repeat(41) })),
    );
  });

  it('refuses an over-long note', async () => {
    await assertFails(
      addDoc(collection(asUser(REPORTER), 'reports'), report({ note: 'x'.repeat(401) })),
    );
  });

  it('refuses an over-long context', async () => {
    await assertFails(
      addDoc(collection(asUser(REPORTER), 'reports'), report({ context: 'x'.repeat(81) })),
    );
  });

  it('refuses a non-string reason', async () => {
    await assertFails(addDoc(collection(asUser(REPORTER), 'reports'), report({ reason: 42 })));
  });
});

describe('reports are write-only to every client', () => {
  async function seedReport() {
    await seed(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'reports', REPORT_ID), report());
    });
  }

  it('hides a report from its own reporter', async () => {
    await seedReport();
    await assertFails(getDoc(doc(asUser(REPORTER), 'reports', REPORT_ID)));
  });

  it('hides a report from the person reported', async () => {
    await seedReport();
    await assertFails(getDoc(doc(asUser(TARGET), 'reports', REPORT_ID)));
  });

  it('refuses an update, even by the reporter', async () => {
    await seedReport();
    await assertFails(
      updateDoc(doc(asUser(REPORTER), 'reports', REPORT_ID), { reason: 'changed' }),
    );
  });

  it('refuses a delete, so a reporter cannot retract evidence', async () => {
    await seedReport();
    await assertFails(deleteDoc(doc(asUser(REPORTER), 'reports', REPORT_ID)));
  });
});

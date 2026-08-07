/**
 * Shared plumbing for the Firestore security-rules suites.
 *
 * These tests run the *real* `firestore.rules` against the emulator, so they
 * verify what production will actually enforce rather than what we believe it
 * enforces. That distinction matters here: several rules in this file read as
 * protective but were not, and only an executed test tells the difference.
 *
 * Seeding uses `withSecurityRulesDisabled` so a fixture can create state the
 * rules would refuse (a two-member couple, a duel mid-set) without the test
 * having to walk the whole legitimate flow to get there.
 */

import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
  type RulesTestContext,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';

export const PROJECT_ID = 'repchamp-rules-test';

let testEnv: RulesTestEnvironment | null = null;

export async function setupEnv(): Promise<RulesTestEnvironment> {
  if (testEnv) return testEnv;
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(__dirname, '..', 'firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
  return testEnv;
}

export async function teardownEnv(): Promise<void> {
  await testEnv?.cleanup();
  testEnv = null;
}

export async function clearData(): Promise<void> {
  // Guard rather than optional-chain: a silent no-op here would leak state
  // between tests and produce failures that look like rule bugs.
  if (!testEnv) throw new Error('setupEnv() must run first');
  await testEnv.clearFirestore();
}

/** Firestore handle for a signed-in athlete. */
export function asUser(uid: string) {
  if (!testEnv) throw new Error('setupEnv() must run first');
  return testEnv.authenticatedContext(uid).firestore();
}

/** Firestore handle for a signed-out caller. */
export function asAnon() {
  if (!testEnv) throw new Error('setupEnv() must run first');
  return testEnv.unauthenticatedContext().firestore();
}

/** Write fixture state with the rules switched off. */
export async function seed(fn: (ctx: RulesTestContext) => Promise<void>): Promise<void> {
  if (!testEnv) throw new Error('setupEnv() must run first');
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await fn(ctx);
  });
}

/* ------------------------------------------------------------------ *
 * Fixture builders — shapes mirror src/domain/*, kept minimal so a test
 * reads as "what the rule cares about" rather than a full document dump.
 * ------------------------------------------------------------------ */

export function profile(uid: string, over: Record<string, unknown> = {}) {
  return { uid, totalXp: 100, username: 'athlete', displayName: 'Athlete', ...over };
}

export function seat(uid: string, over: Record<string, unknown> = {}) {
  return {
    uid,
    displayName: 'Athlete',
    avatarUrl: null,
    level: 1,
    reps: 0,
    formScore: 0,
    done: false,
    forfeited: false,
    ...over,
  };
}

export function member(uid: string, over: Record<string, unknown> = {}) {
  return { uid, displayName: 'Athlete', totalReps: 0, trainedDays: [], ...over };
}

export function weekKey(): string {
  return '2026-W31';
}

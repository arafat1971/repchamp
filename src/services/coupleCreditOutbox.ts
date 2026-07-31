/**
 * Durable outbox for couple session credits.
 *
 * Session finish used to call `recordCoupleSession` only while `/session` was
 * mounted. If couple hydrate landed after navigation, or all in-memory retries
 * failed, the shared streak/reps were lost forever. This MMKV queue survives
 * unmount and is flushed from the root layout.
 */

import { storage } from '@/lib/storage';
import { recordCoupleSession } from '@/services/coupleService';

const OUTBOX_KEY = 'coupleCreditOutbox.v1';
const DONE_KEY = 'coupleCreditDone.v1';
/** Together set finished before the couple bond hydrated — promote when ready. */
const PENDING_KEY = 'coupleCreditPending.v1';

export type CoupleCreditItem = {
  id: string;
  coupleId: string;
  uid: string;
  reps: number;
  day: string;
};

export type PendingCoupleCredit = {
  uid: string;
  reps: number;
  day: string;
  startedAt: number;
};

function readList(key: string): CoupleCreditItem[] {
  try {
    const raw = storage.getString(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as CoupleCreditItem[]) : [];
  } catch {
    return [];
  }
}

function writeList(key: string, items: CoupleCreditItem[]): void {
  storage.set(key, JSON.stringify(items));
}

function readDone(): Set<string> {
  try {
    const raw = storage.getString(DONE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(parsed) ? (parsed as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeDone(ids: Set<string>): void {
  // Cap so a long-lived install cannot grow this forever.
  const trimmed = [...ids].slice(-200);
  storage.set(DONE_KEY, JSON.stringify(trimmed));
}

/** True when this credit id has already been written to the couple doc. */
export function isCoupleCreditDone(id: string): boolean {
  return !!id && readDone().has(id);
}

/** Enqueue a credit. Idempotent on `id`. */
export function enqueueCoupleCredit(item: CoupleCreditItem): void {
  if (!item.id || !item.coupleId || !item.uid) return;
  if (!Number.isFinite(item.reps) || item.reps <= 0) return;
  const done = readDone();
  if (done.has(item.id)) return;
  const list = readList(OUTBOX_KEY);
  if (list.some((x) => x.id === item.id)) return;
  writeList(OUTBOX_KEY, [...list, item]);
}

/**
 * Park a together-set credit when the couple bond hasn't hydrated yet.
 * Overwrites any prior pending stash (one unfinished together set at a time).
 */
export function stashPendingCoupleCredit(pending: PendingCoupleCredit): void {
  if (!pending.uid || !Number.isFinite(pending.reps) || pending.reps <= 0) return;
  storage.set(PENDING_KEY, JSON.stringify(pending));
}

/** Promote a stashed credit into the durable outbox once `coupleId` is known. */
export function promotePendingCoupleCredit(
  coupleId: string,
  uid: string,
): string | null {
  if (!coupleId || !uid) return null;
  try {
    const raw = storage.getString(PENDING_KEY);
    if (!raw) return null;
    const pending = JSON.parse(raw) as PendingCoupleCredit;
    if (!pending || pending.uid !== uid) return null;
    if (!Number.isFinite(pending.reps) || pending.reps <= 0) {
      storage.remove(PENDING_KEY);
      return null;
    }
    const creditId = `${coupleId}:${uid}:${pending.day}:${pending.reps}:${pending.startedAt}`;
    enqueueCoupleCredit({
      id: creditId,
      coupleId,
      uid,
      reps: pending.reps,
      day: pending.day,
    });
    storage.remove(PENDING_KEY);
    return creditId;
  } catch {
    return null;
  }
}

/** Flush pending credits. Safe to call from root / resume / result. */
export async function flushCoupleCreditOutbox(): Promise<void> {
  const list = readList(OUTBOX_KEY);
  if (list.length === 0) return;

  const done = readDone();
  const remaining: CoupleCreditItem[] = [];

  for (const item of list) {
    if (done.has(item.id)) continue;
    try {
      await recordCoupleSession(
        item.coupleId,
        item.uid,
        item.reps,
        item.day,
        item.id,
      );
      done.add(item.id);
    } catch {
      remaining.push(item);
    }
  }

  writeDone(done);
  writeList(OUTBOX_KEY, remaining);
}

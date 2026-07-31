/**
 * Detached live-duel settle — survives leaving the result screen *and* process
 * death (MMKV outbox). Done/Rematch used to tear down `watchDuel` while the
 * opponent seat was still open; kill-before-bank dropped XP entirely.
 */

import {
  ABANDON_SETTLE_GRACE_MS,
  bothSeatsDone,
  canForfeitOpenOpponent,
  duelStartedAtMs,
  resolveWinner,
  type Duel,
} from '@/domain/duel';
import { xpForSession, type SessionMode } from '@/domain/progression';
import { storage } from '@/lib/storage';
import { finishDuel, forceSettleAbandoned, seatFor, watchDuel } from '@/services/duelService';
import type { ExerciseId } from '@/vision/exercises';

export type LiveSettleBank = {
  won: boolean;
  drew: boolean;
  xp: number;
  opponentReps: number;
  opponentId?: string | null;
  opponentName?: string | null;
};

/** Fields needed to `recordSession` after a cold resume. */
export type LiveSettleRecord = {
  exercise: ExerciseId;
  sessionMode: SessionMode;
  reps: number;
  target: number | null;
  opponentId?: string | null;
  formScore: number;
  durationSec: number;
};

export type ArmLiveSettleInput = {
  duelId: string;
  uid: string;
  mode: 'versus' | 'together';
  outcome: { reps: number; formScore: number; forfeited?: boolean };
  local: { won: boolean; drew: boolean; xp: number; opponentReps: number };
  record: LiveSettleRecord;
  /**
   * Apply XP. Return `false` to keep the outbox armed (e.g. uid mismatch).
   * `void` / `true` means success.
   */
  onBank: (bank: LiveSettleBank) => boolean | void;
};

export type PersistedSettle = Omit<ArmLiveSettleInput, 'onBank'>;

const OUTBOX_KEY = 'liveSettleOutbox.v1';
const BANKED_KEY = 'liveSettleBanked.v1';

const active = new Map<string, () => void>();
const banked = loadBanked();

function settleKey(duelId: string, uid: string): string {
  return `${duelId}:${uid}`;
}

function loadBanked(): Set<string> {
  try {
    const raw = storage.getString(BANKED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(parsed) ? (parsed as string[]) : []);
  } catch {
    return new Set();
  }
}

function persistBanked(): void {
  storage.set(BANKED_KEY, JSON.stringify([...banked].slice(-200)));
}

function readOutbox(): PersistedSettle[] {
  try {
    const raw = storage.getString(OUTBOX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as PersistedSettle[]) : [];
  } catch {
    return [];
  }
}

function writeOutbox(items: PersistedSettle[]): void {
  storage.set(OUTBOX_KEY, JSON.stringify(items));
}

function upsertOutbox(item: PersistedSettle): void {
  const key = settleKey(item.duelId, item.uid);
  const list = readOutbox().filter((x) => settleKey(x.duelId, x.uid) !== key);
  list.push(item);
  writeOutbox(list);
}

function removeOutbox(duelId: string, uid: string): void {
  const key = settleKey(duelId, uid);
  writeOutbox(readOutbox().filter((x) => settleKey(x.duelId, x.uid) !== key));
}

/** True when this live set has already written XP (in-process or durable). */
export function wasLiveSettleBanked(duelId: string, uid: string): boolean {
  return banked.has(settleKey(duelId, uid));
}

/** True when a detached settle watcher is still running for this duel/uid. */
export function isLiveSettleArmed(duelId: string, uid: string): boolean {
  return active.has(settleKey(duelId, uid));
}

/**
 * Re-arm any settles that survived process death. Call once auth uid is known.
 * `onBank` should recordSession + pushProfile (uid-guarded); return false to retry.
 */
export function resumePendingLiveSettles(
  onBank: (item: PersistedSettle, bank: LiveSettleBank) => boolean | void,
): void {
  for (const item of readOutbox()) {
    if (banked.has(settleKey(item.duelId, item.uid))) {
      removeOutbox(item.duelId, item.uid);
      continue;
    }
    armLiveResultSettle({
      ...item,
      onBank: (bank) => onBank(item, bank),
    });
  }
}

/**
 * Immediately bank every pending settle with its local outcome (logout / wipe).
 * Tears down in-flight watchers first so timers cannot double-apply.
 */
export function forceBankPendingLiveSettles(
  apply: (item: PersistedSettle, bank: LiveSettleBank) => boolean | void,
): void {
  for (const teardown of active.values()) teardown();
  active.clear();

  for (const item of readOutbox()) {
    const key = settleKey(item.duelId, item.uid);
    if (banked.has(key)) {
      removeOutbox(item.duelId, item.uid);
      continue;
    }
    const payload: LiveSettleBank = {
      won: item.local.won,
      drew: item.local.drew,
      xp: item.local.xp,
      opponentReps: item.local.opponentReps,
    };
    if (apply(item, payload) === false) continue;
    banked.add(key);
    persistBanked();
    removeOutbox(item.duelId, item.uid);
  }
}

/**
 * Arm cloud settle for a live duel. Safe to call from the result screen on
 * mount; unmount must NOT cancel — leave the watcher running until banked.
 */
export function armLiveResultSettle(input: ArmLiveSettleInput): void {
  const key = settleKey(input.duelId, input.uid);
  if (banked.has(key) || active.has(key)) return;

  const { onBank, ...durable } = input;
  upsertOutbox(durable);

  let settled = false;
  let latestDuel: Duel | null = null;
  let forceTimer: ReturnType<typeof setTimeout> | null = null;
  let forceInterval: ReturnType<typeof setInterval> | null = null;
  let lastResort: ReturnType<typeof setTimeout> | null = null;
  let lastResortDueAt = 0;

  const teardown = () => {
    if (forceTimer) clearTimeout(forceTimer);
    if (forceInterval) clearInterval(forceInterval);
    if (lastResort) clearTimeout(lastResort);
    forceTimer = null;
    forceInterval = null;
    lastResort = null;
    unsub();
    active.delete(key);
  };

  const bank = (payload: LiveSettleBank) => {
    if (settled || banked.has(key)) return;
    // Latch against re-entry, but only durable-mark after onBank succeeds —
    // a uid-mismatch no-op must leave the outbox for resume.
    settled = true;
    let ok: boolean | void = false;
    try {
      ok = onBank(payload);
    } catch {
      ok = false;
    }
    if (ok === false) {
      settled = false;
      return;
    }
    banked.add(key);
    persistBanked();
    removeOutbox(input.duelId, input.uid);
    teardown();
  };

  const persistLocalFallback = () => {
    if (settled || banked.has(key)) return;
    const duel = latestDuel;
    if (duel && !bothSeatsDone(duel) && !canForfeitOpenOpponent(duel)) {
      scheduleLastResort(duel);
      return;
    }
    if (duel && bothSeatsDone(duel) && input.mode === 'versus') {
      const winner = resolveWinner(duel);
      const won = winner === input.uid;
      const drew = winner == null && !duel.cooperative;
      const other = duel.hostUid === input.uid ? duel.guest : duel.host;
      const xp = xpForSession('versus', won, {
        drew,
        reps: input.outcome.reps,
        forfeited: input.outcome.forfeited,
      });
      bank({
        won,
        drew,
        xp,
        opponentReps: other?.reps ?? input.local.opponentReps,
        opponentId: duel.hostUid === input.uid ? duel.guestUid : duel.hostUid,
        opponentName: other?.displayName ?? null,
      });
      return;
    }
    bank({
      won: input.local.won,
      drew: input.local.drew,
      xp: input.local.xp,
      opponentReps: input.local.opponentReps,
    });
  };

  const armLastResortIn = (delay: number) => {
    if (settled) return;
    const due = Date.now() + delay;
    if (lastResort && due >= lastResortDueAt) return;
    if (lastResort) clearTimeout(lastResort);
    lastResortDueAt = due;
    lastResort = setTimeout(() => {
      persistLocalFallback();
    }, delay);
  };

  const scheduleLastResort = (duel: Duel) => {
    let delay = 90_000;
    if (canForfeitOpenOpponent(duel)) {
      delay = 8_000;
    } else {
      const startMs = duelStartedAtMs(duel);
      if (startMs != null) {
        delay = Math.max(
          8_000,
          startMs + duel.duration * 1000 + ABANDON_SETTLE_GRACE_MS + 8_000 - Date.now(),
        );
      }
    }
    armLastResortIn(delay);
  };

  const applyFinished = (duel: Duel) => {
    if (settled || !bothSeatsDone(duel)) return;

    const other = duel.hostUid === input.uid ? duel.guest : duel.host;
    const otherUid = duel.hostUid === input.uid ? duel.guestUid : duel.hostUid;
    const opponentReps = other?.reps ?? input.local.opponentReps;

    const winner = input.mode === 'versus' ? resolveWinner(duel) : null;
    const cloudWon =
      input.mode === 'together'
        ? !input.outcome.forfeited && input.outcome.reps > 0
        : winner === input.uid;
    const cloudDrew =
      input.mode === 'versus' ? winner == null && !duel.cooperative : false;
    const xp = xpForSession(input.mode, cloudWon, {
      drew: cloudDrew,
      reps: input.outcome.reps,
      forfeited: input.outcome.forfeited,
    });

    bank({
      won: cloudWon,
      drew: cloudDrew,
      xp,
      opponentReps,
      opponentId: otherUid,
      opponentName: other?.displayName ?? null,
    });
  };

  /**
   * Cap the forfeit retries.
   *
   * This fires every 5s and is only cleared by `teardown()`, which runs on a
   * *successful* bank — so a duel that never settles (opponent gone, rules
   * rejecting the write) used to retry forever, a permanent Firestore write
   * loop for the life of the process with every rejection invisible. Roughly
   * two minutes of attempts is far past the 90s last-resort fallback, so if
   * it has not worked by then it is not going to.
   */
  const MAX_FORCE_ATTEMPTS = 24;
  let forceAttempts = 0;

  const attemptForce = () => {
    if (settled) return;
    if (forceAttempts >= MAX_FORCE_ATTEMPTS) {
      if (forceInterval) {
        clearInterval(forceInterval);
        forceInterval = null;
      }
      return;
    }
    forceAttempts += 1;
    // `forceSettleAbandoned` swallows its own errors and resolves false, so
    // there is nothing to catch here — the cap above is what bounds it.
    void forceSettleAbandoned(input.duelId, input.uid, input.outcome);
  };

  forceTimer = setTimeout(() => {
    attemptForce();
    forceInterval = setInterval(attemptForce, 5000);
  }, 8000);

  armLastResortIn(90_000);

  const unsub = watchDuel(input.duelId, (duel) => {
    if (!duel || settled) return;
    latestDuel = duel;
    scheduleLastResort(duel);

    if (!bothSeatsDone(duel)) {
      const seat = seatFor(duel, input.uid);
      const mine = seat === 'host' ? duel.host : seat === 'guest' ? duel.guest : null;
      if (seat && mine && !mine.done) {
        void finishDuel(input.duelId, seat, input.outcome);
      }
      return;
    }

    applyFinished(duel);
  });

  active.set(key, teardown);
}

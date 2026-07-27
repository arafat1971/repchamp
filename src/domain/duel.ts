/**
 * Live 1v1 duel model.
 *
 * The bot duel (see opponent.ts) simulates a rival with a paced curve. A *live*
 * duel replaces that curve with the real remote athlete's rep stream, synced
 * through a single Firestore document. This module is the pure core of that
 * feature: the document shape, its status transitions, winner resolution, and
 * the mapping from a remote player's profile onto the `Opponent` shape the
 * session HUD already renders. It has no Firebase dependency, so it is fully
 * unit-tested; `src/services/duelService.ts` is the thin I/O layer on top.
 *
 * Design note (see opponent.ts:10): the session screen consumes an `Opponent`
 * plus an `opponentReps` number. A live duel produces both — a synthetic
 * `Opponent` built from the remote profile, and `opponentReps` read from the
 * live doc — so nothing downstream of `setOpponentReps` has to change.
 */

import type { Opponent } from '@/domain/opponent';

/** How often a client is allowed to push its live state up, in ms (~3 Hz). */
export const DUEL_SYNC_INTERVAL_MS = 320;

/** Duel lifecycle. `pending` → both present → `active` → `finished`. */
export type DuelStatus = 'pending' | 'active' | 'finished';

/** The seats in a duel. The creator is always the host. */
export type DuelSeat = 'host' | 'guest';

/** One athlete's live slice of the duel document. */
export interface DuelPlayer {
  uid: string;
  displayName: string;
  avatarUrl: string | null;
  level: number;
  /** Live rep count, written a few times a second during the set. */
  reps: number;
  /** Rolling average form score 0..100. */
  formScore: number;
  /** True once this player has crossed the finish (clock out or forfeit). */
  done: boolean;
  /** True when this player gave up rather than finished. */
  forfeited: boolean;
}

/** The full duel document synced through Firestore. */
export interface Duel {
  id: string;
  exercise: string;
  /** Seconds on the clock. */
  duration: number;
  status: DuelStatus;
  hostUid: string;
  guestUid: string | null;
  /**
   * The uid this challenge is addressed to, or null for an open/code-shared
   * duel. Lets a friend see "X challenged you" in their inbox and accept it
   * asynchronously; a null target is joinable by anyone with the code.
   */
  targetUid: string | null;
  host: DuelPlayer;
  guest: DuelPlayer | null;
  /** uid of the winner, or null for a draw / not-yet-decided. */
  winnerUid: string | null;
  /**
   * A couple's *together* set rather than a duel: the same two-seat transport,
   * but cooperative. Nobody wins one, so `winnerUid` is left null and the
   * session renders the combined total instead of a tug-of-war.
   */
  cooperative?: boolean;
}

/** A fresh player slice at the start of a duel. */
export function makePlayer(input: {
  uid: string;
  displayName: string;
  avatarUrl?: string | null;
  level?: number;
}): DuelPlayer {
  return {
    uid: input.uid,
    displayName: input.displayName || 'Athlete',
    avatarUrl: input.avatarUrl ?? null,
    level: input.level ?? 1,
    reps: 0,
    formScore: 0,
    done: false,
    forfeited: false,
  };
}

/** The seat a given uid occupies, or null if they're not in this duel. */
export function seatOf(duel: Duel, uid: string): DuelSeat | null {
  if (duel.hostUid === uid) return 'host';
  if (duel.guestUid === uid) return 'guest';
  return null;
}

/** The opposing player from the viewpoint of `uid`, or null if unresolved. */
export function opponentOf(duel: Duel, uid: string): DuelPlayer | null {
  const seat = seatOf(duel, uid);
  if (seat === 'host') return duel.guest;
  if (seat === 'guest') return duel.host;
  return null;
}

/**
 * A duel is decided once both players are `done`.
 *
 * Winner is the higher rep count; a forfeit always loses (even on equal reps);
 * an exact tie with neither forfeiting is a draw (`null`). Kept pure so the
 * result screen and the writer agree without a round trip.
 */
export function resolveWinner(duel: Duel): string | null {
  const { host, guest } = duel;
  if (!guest) return null;
  if (!host.done || !guest.done) return null;

  if (host.forfeited && !guest.forfeited) return guest.uid;
  if (guest.forfeited && !host.forfeited) return host.uid;

  if (host.reps > guest.reps) return host.uid;
  if (guest.reps > host.reps) return guest.uid;
  return null; // draw
}

/**
 * Did `uid` win this duel? False for a draw, an undecided duel, or a uid not in
 * the duel — the caller only needs the boolean the session/result screen reads.
 */
export function didUidWin(duel: Duel, uid: string): boolean {
  return resolveWinner(duel) === uid;
}

/**
 * Project a live remote player onto the `Opponent` shape the duel HUD renders.
 *
 * The HUD only reads `name`, `initial`, `color`, `borderColor`, `repColor`,
 * `level`; a live duel drives `opponentReps` separately, so `repsPerMinute` is
 * irrelevant and set to 0. Colours reuse the rival-pink palette so a live
 * opponent looks the same as a bot one.
 */
export function opponentFromPlayer(player: DuelPlayer): Opponent {
  const name = player.displayName || 'Athlete';
  return {
    id: player.uid,
    name,
    initial: name.charAt(0).toUpperCase(),
    color: '#5b21b6',
    borderColor: '#a855f7',
    repColor: '#c4b5fd',
    level: player.level,
    online: true,
    repsPerMinute: 0,
  };
}

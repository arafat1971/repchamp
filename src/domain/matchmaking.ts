/**
 * Open-matchmaking queue — pure core.
 *
 * The lobby (friends.tsx / home) lets an athlete pick a specific rival. This is
 * the "find me *anyone*" path: an athlete drops a ticket in a shared queue and is
 * paired with the next athlete who's also waiting, then both are dropped into a
 * normal live duel (src/domain/duel.ts) — so nothing downstream of pairing is new.
 *
 * This module has no Firebase dependency and is fully unit-tested. The seat-race
 * (two athletes claiming the same waiting ticket at once) is resolved in a
 * transaction by the I/O layer, src/services/matchmakingService.ts; the rules
 * that decide *who is claimable* and *what duel a pairing produces* live here so
 * they can be tested without a backend.
 */

import { type Duel, makePlayer } from '@/domain/duel';

/** The exercise/format an open match is played at. Kept fixed and explicit so
 *  two strangers always agree on the rules without negotiation. */
export const OPEN_MATCH_EXERCISE = 'push';
export const OPEN_MATCH_DURATION = 20;

/** A queue ticket's lifecycle. `waiting` → paired → `matched` (carries duelId). */
export type TicketStatus = 'waiting' | 'matched' | 'cancelled';

/** One athlete's standing request for an open match. Keyed by uid in Firestore. */
export interface QueueTicket {
  uid: string;
  displayName: string;
  avatarUrl: string | null;
  level: number;
  /** The exercise this athlete wants to play. */
  exercise: string;
  /** Duration in seconds. */
  duration: number;
  status: TicketStatus;
  /** The duel this ticket was paired into, once `matched`. */
  duelId: string | null;
}

/** A fresh `waiting` ticket for an athlete entering the queue. */
export function makeTicket(input: {
  uid: string;
  displayName: string;
  avatarUrl?: string | null;
  level?: number;
  exercise?: string;
  duration?: number;
}): QueueTicket {
  return {
    uid: input.uid,
    displayName: input.displayName || 'Athlete',
    avatarUrl: input.avatarUrl ?? null,
    level: input.level ?? 1,
    exercise: input.exercise ?? OPEN_MATCH_EXERCISE,
    duration: input.duration ?? OPEN_MATCH_DURATION,
    status: 'waiting',
    duelId: null,
  };
}

/**
 * Can `seeker` pair with `candidate`?
 *
 * A candidate is claimable only if it's a *different* athlete who is still
 * `waiting`. Same-uid tickets (a stale ticket from this very athlete) and any
 * already-matched/cancelled ticket are skipped, so an athlete never matches
 * themselves and a claimed ticket is never double-booked.
 */
export function canPair(seekerUid: string, candidate: QueueTicket): boolean {
  return candidate.uid !== seekerUid && candidate.status === 'waiting';
}

/**
 * Pick the athlete to pair `seekerUid` with from a pool of tickets, or null if
 * none are claimable. Oldest-first is the caller's ordering concern (the query
 * orders by `enqueuedAt`); this just takes the first claimable one so the head of
 * the queue is served first.
 */
export function pickOpponent(seekerUid: string, pool: QueueTicket[]): QueueTicket | null {
  return pool.find((t) => canPair(seekerUid, t)) ?? null;
}

/**
 * Build the active duel document produced by pairing two tickets.
 *
 * The waiting athlete (already in the queue) becomes the host; the seeker who
 * claimed them becomes the guest — mirroring create/join, so the duel is born
 * `active` with both seats filled. Winner is undecided; the live session settles
 * it exactly as a friend duel does. `targetUid` is null: an open match belongs to
 * no one in particular.
 */
export function buildMatchDuel(id: string, host: QueueTicket, guest: QueueTicket): Duel {
  return {
    id,
    // The waiting athlete (host) sets the format; the seeker accepts it by pairing.
    exercise: host.exercise,
    duration: host.duration,
    status: 'active',
    hostUid: host.uid,
    guestUid: guest.uid,
    targetUid: null,
    host: makePlayer(host),
    guest: makePlayer(guest),
    winnerUid: null,
  };
}

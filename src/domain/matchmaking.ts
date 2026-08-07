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

/**
 * How long a ticket stays claimable before it counts as abandoned.
 *
 * A genuine wait is *seconds*: the queue screen falls back to an AI rival after
 * 8 (`WAIT_HINT_SEC` in app/duel/queue.tsx), so nobody sits here for minutes on
 * purpose. Anything older than this was left behind by a force-quit, a dropped
 * connection, or an uninstall — cases where the client never gets to run its own
 * cleanup. Ten minutes is far past any real wait while still leaving a wide
 * margin for a backgrounded app that resumes and re-enqueues.
 */
export const TICKET_TTL_MS = 10 * 60 * 1000;

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
  /**
   * Epoch ms after which this ticket counts as abandoned. Read by
   * `isTicketExpired` so a ghost cannot be paired with while it waits to be
   * collected. Optional so tickets written before this field existed parse.
   *
   * Note this is *not* the field the Firestore TTL policy reads — that one has
   * to be a real Timestamp (a number silently disables TTL for the document),
   * and this module stays free of any Firebase type. The service layer writes
   * the Timestamp twin, `expiresAtTs`, alongside this from the same deadline.
   */
  expiresAt?: number;
}

/**
 * Has this ticket aged out?
 *
 * Firestore's TTL service deletes expired documents but only *approximately* on
 * time — the documented bound is "typically within 24 hours" of expiry. That is
 * fine for reclaiming storage and useless for matchmaking, where a handful of
 * stale tickets at the head of the queue is exactly what breaks pairing (see
 * `tryPair`: it takes the five oldest, and stale ones sort first). So the
 * deadline is enforced here at read time, and the TTL policy is left to do the
 * one thing it is good at: stopping the collection growing without bound.
 *
 * Tickets with no `expiresAt` are treated as live: they predate this field, and
 * refusing to pair with them would strand anyone mid-upgrade.
 */
export function isTicketExpired(ticket: Pick<QueueTicket, 'expiresAt'>, now = Date.now()): boolean {
  return typeof ticket.expiresAt === 'number' && ticket.expiresAt <= now;
}

/** A fresh `waiting` ticket for an athlete entering the queue. */
export function makeTicket(input: {
  uid: string;
  displayName: string;
  avatarUrl?: string | null;
  level?: number;
  exercise?: string;
  duration?: number;
}, now = Date.now()): QueueTicket {
  return {
    uid: input.uid,
    displayName: input.displayName || 'Athlete',
    avatarUrl: input.avatarUrl ?? null,
    level: input.level ?? 1,
    exercise: input.exercise ?? OPEN_MATCH_EXERCISE,
    duration: input.duration ?? OPEN_MATCH_DURATION,
    status: 'waiting',
    duelId: null,
    expiresAt: now + TICKET_TTL_MS,
  };
}

/**
 * Can `seeker` pair with `candidate`?
 *
 * A candidate is claimable only if it's a *different* athlete who is still
 * `waiting` and hasn't aged out. Same-uid tickets (a stale ticket from this very
 * athlete) and any already-matched/cancelled ticket are skipped. When
 * `seekerFormat` is passed, exercise + duration must match so strangers don't
 * launch into different rules.
 *
 * The expiry check lives here rather than at the call sites because this is the
 * one predicate both the query filter *and* the claiming transaction run — so an
 * abandoned ticket cannot be paired with from either path while it waits for the
 * TTL service to collect it.
 */
export function canPair(
  seekerUid: string,
  candidate: QueueTicket,
  seekerFormat?: Pick<QueueTicket, 'exercise' | 'duration'>,
  now = Date.now(),
): boolean {
  if (candidate.uid === seekerUid || candidate.status !== 'waiting') return false;
  if (isTicketExpired(candidate, now)) return false;
  if (!seekerFormat) return true;
  return (
    candidate.exercise === seekerFormat.exercise &&
    candidate.duration === seekerFormat.duration
  );
}

/**
 * Pick the athlete to pair `seekerUid` with from a pool of tickets, or null if
 * none are claimable. Oldest-first is the caller's ordering concern (the query
 * orders by `enqueuedAt`); this just takes the first claimable one so the head of
 * the queue is served first.
 */
export function pickOpponent(
  seekerUid: string,
  pool: QueueTicket[],
  seekerFormat?: Pick<QueueTicket, 'exercise' | 'duration'>,
): QueueTicket | null {
  return pool.find((t) => canPair(seekerUid, t, seekerFormat)) ?? null;
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

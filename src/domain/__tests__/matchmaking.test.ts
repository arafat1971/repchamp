/**
 * Tests for the pure open-matchmaking core (src/domain/matchmaking.ts): who is
 * claimable, which opponent gets picked from a pool, and the duel document a
 * pairing produces. No Firebase — the transactional claim is exercised in
 * src/services/__tests__/matchmakingService.test.ts.
 */

import {
  OPEN_MATCH_DURATION,
  OPEN_MATCH_EXERCISE,
  buildMatchDuel,
  canPair,
  makeTicket,
  pickOpponent,
  type QueueTicket,
} from '../matchmaking';

function ticket(uid: string, over: Partial<QueueTicket> = {}): QueueTicket {
  return { ...makeTicket({ uid, displayName: uid, level: 2 }), ...over };
}

describe('makeTicket', () => {
  it('starts waiting, unmatched, with defaulted fields', () => {
    const t = makeTicket({ uid: 'a', displayName: '' });
    expect(t.status).toBe('waiting');
    expect(t.duelId).toBeNull();
    expect(t.displayName).toBe('Athlete');
    expect(t.avatarUrl).toBeNull();
    expect(t.level).toBe(1);
  });
});

describe('canPair', () => {
  it('accepts a different, still-waiting athlete', () => {
    expect(canPair('me', ticket('you'))).toBe(true);
  });

  it('rejects mismatched exercise or duration when format is required', () => {
    expect(
      canPair('me', ticket('you', { exercise: 'squat', duration: 20 }), {
        exercise: 'push',
        duration: 20,
      }),
    ).toBe(false);
    expect(
      canPair('me', ticket('you', { exercise: 'push', duration: 45 }), {
        exercise: 'push',
        duration: 20,
      }),
    ).toBe(false);
    expect(
      canPair('me', ticket('you', { exercise: 'push', duration: 20 }), {
        exercise: 'push',
        duration: 20,
      }),
    ).toBe(true);
  });

  it('rejects an already-matched ticket', () => {
    expect(canPair('me', ticket('you', { status: 'matched', duelId: 'd1' }))).toBe(false);
  });

  it('rejects a cancelled ticket', () => {
    expect(canPair('me', ticket('you', { status: 'cancelled' }))).toBe(false);
  });
});

describe('pickOpponent', () => {
  it('takes the first claimable ticket in the pool (queue head)', () => {
    const pool = [
      ticket('me'), // self — skipped
      ticket('early'),
      ticket('late'),
    ];
    expect(pickOpponent('me', pool)?.uid).toBe('early');
  });

  it('skips matched/cancelled tickets to find a live one', () => {
    const pool = [
      ticket('gone', { status: 'matched', duelId: 'd0' }),
      ticket('bailed', { status: 'cancelled' }),
      ticket('ready'),
    ];
    expect(pickOpponent('me', pool)?.uid).toBe('ready');
  });

  it('returns null when nobody is claimable', () => {
    expect(pickOpponent('me', [ticket('me'), ticket('done', { status: 'matched', duelId: 'd' })])).toBeNull();
  });

  it('returns null for an empty pool', () => {
    expect(pickOpponent('me', [])).toBeNull();
  });
});

describe('buildMatchDuel', () => {
  it('seats the waiting athlete as host and the seeker as guest, born active', () => {
    const host = ticket('waiter', { level: 4 });
    const guest = ticket('seeker', { level: 7 });
    const d = buildMatchDuel('d1', host, guest);

    expect(d.id).toBe('d1');
    expect(d.status).toBe('active');
    expect(d.hostUid).toBe('waiter');
    expect(d.guestUid).toBe('seeker');
    expect(d.host.level).toBe(4);
    expect(d.guest?.level).toBe(7);
    expect(d.host.reps).toBe(0);
    expect(d.guest?.done).toBe(false);
  });

  it('is an open duel (no target) at the fixed open-match format', () => {
    const d = buildMatchDuel('d1', ticket('a'), ticket('b'));
    expect(d.targetUid).toBeNull();
    expect(d.winnerUid).toBeNull();
    expect(d.exercise).toBe(OPEN_MATCH_EXERCISE);
    expect(d.duration).toBe(OPEN_MATCH_DURATION);
  });
});

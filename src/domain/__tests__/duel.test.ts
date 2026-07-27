import {
  DUEL_SYNC_INTERVAL_MS,
  didUidWin,
  makePlayer,
  opponentFromPlayer,
  opponentOf,
  resolveWinner,
  seatOf,
  type Duel,
  type DuelPlayer,
} from '../duel';

function player(uid: string, over: Partial<DuelPlayer> = {}): DuelPlayer {
  return { ...makePlayer({ uid, displayName: uid }), ...over };
}

function duel(over: Partial<Duel> = {}): Duel {
  return {
    id: 'd1',
    exercise: 'push',
    duration: 20,
    status: 'active',
    hostUid: 'h',
    guestUid: 'g',
    targetUid: null,
    host: player('h'),
    guest: player('g'),
    winnerUid: null,
    ...over,
  };
}

describe('makePlayer', () => {
  it('starts at zero reps and undone', () => {
    const p = makePlayer({ uid: 'x', displayName: 'Xena' });
    expect(p.reps).toBe(0);
    expect(p.done).toBe(false);
    expect(p.forfeited).toBe(false);
    expect(p.avatarUrl).toBeNull();
    expect(p.level).toBe(1);
  });

  it('falls back to a placeholder name rather than an empty string', () => {
    expect(makePlayer({ uid: 'x', displayName: '' }).displayName).toBe('Athlete');
  });
});

describe('seatOf / opponentOf', () => {
  it('resolves the seat for each uid', () => {
    const d = duel();
    expect(seatOf(d, 'h')).toBe('host');
    expect(seatOf(d, 'g')).toBe('guest');
    expect(seatOf(d, 'stranger')).toBeNull();
  });

  it('returns the other player from a uid, and null for a stranger', () => {
    const d = duel();
    expect(opponentOf(d, 'h')?.uid).toBe('g');
    expect(opponentOf(d, 'g')?.uid).toBe('h');
    expect(opponentOf(d, 'stranger')).toBeNull();
  });

  it('returns null opponent while the guest seat is empty', () => {
    const d = duel({ guestUid: null, guest: null });
    expect(opponentOf(d, 'h')).toBeNull();
  });
});

describe('resolveWinner', () => {
  it('is undecided until both players are done', () => {
    const d = duel({
      host: player('h', { reps: 10, done: true }),
      guest: player('g', { reps: 4, done: false }),
    });
    expect(resolveWinner(d)).toBeNull();
  });

  it('awards the win to the higher rep count', () => {
    const d = duel({
      host: player('h', { reps: 12, done: true }),
      guest: player('g', { reps: 9, done: true }),
    });
    expect(resolveWinner(d)).toBe('h');
    expect(didUidWin(d, 'h')).toBe(true);
    expect(didUidWin(d, 'g')).toBe(false);
  });

  it('is a draw on equal reps with no forfeit', () => {
    const d = duel({
      host: player('h', { reps: 8, done: true }),
      guest: player('g', { reps: 8, done: true }),
    });
    expect(resolveWinner(d)).toBeNull();
    expect(didUidWin(d, 'h')).toBe(false);
  });

  it('makes a forfeit lose even with more reps', () => {
    const d = duel({
      host: player('h', { reps: 20, done: true, forfeited: true }),
      guest: player('g', { reps: 3, done: true }),
    });
    expect(resolveWinner(d)).toBe('g');
  });

  it('is a draw only when neither forfeits; double-forfeit ties on reps', () => {
    const d = duel({
      host: player('h', { reps: 5, done: true, forfeited: true }),
      guest: player('g', { reps: 5, done: true, forfeited: true }),
    });
    expect(resolveWinner(d)).toBeNull();
  });

  it('never crowns a winner while the guest seat is empty', () => {
    const d = duel({ guestUid: null, guest: null, host: player('h', { done: true }) });
    expect(resolveWinner(d)).toBeNull();
  });
});

describe('opponentFromPlayer', () => {
  it('shapes a remote player into the HUD opponent', () => {
    const o = opponentFromPlayer(player('g', { displayName: 'Grace', level: 5 }));
    expect(o.id).toBe('g');
    expect(o.name).toBe('Grace');
    expect(o.initial).toBe('G');
    expect(o.level).toBe(5);
    expect(o.online).toBe(true);
    // Live duels drive reps from the doc, so the bot pace is irrelevant.
    expect(o.repsPerMinute).toBe(0);
  });

  it('handles a missing name without throwing on the initial', () => {
    const o = opponentFromPlayer(player('g', { displayName: '' }));
    expect(o.name).toBe('Athlete');
    expect(o.initial).toBe('A');
  });
});

describe('DUEL_SYNC_INTERVAL_MS', () => {
  it('throttles to a few writes a second, not per frame', () => {
    expect(DUEL_SYNC_INTERVAL_MS).toBeGreaterThanOrEqual(200);
    expect(DUEL_SYNC_INTERVAL_MS).toBeLessThanOrEqual(1000);
  });
});

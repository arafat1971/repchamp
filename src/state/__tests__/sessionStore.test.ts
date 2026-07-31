import type { RepRecord } from '@/vision/repCounter';
import { didWin, useSessionStore, type SessionConfig } from '../sessionStore';

const versus: SessionConfig = {
  exercise: 'push',
  mode: 'versus',
  duration: 20,
  target: null,
  opponentId: 'adrian',
};
const solo: SessionConfig = {
  exercise: 'push',
  mode: 'solo',
  duration: 30,
  target: 25,
  opponentId: null,
};
const practice: SessionConfig = {
  exercise: 'squat',
  mode: 'practice',
  duration: 45,
  target: null,
  opponentId: null,
};

function rep(index: number, fullDepth = true): RepRecord {
  return {
    index,
    peakDepth: fullDepth ? 0.9 : 0.72,
    fullDepth,
    durationMs: 1200,
    alignment: 0.9,
    completedAt: index * 1200,
  };
}

beforeEach(() => useSessionStore.getState().reset());

describe('didWin', () => {
  it('wins a duel by out-repping the opponent', () => {
    expect(didWin(versus, 12, 9)).toBe(true);
    expect(didWin(versus, 9, 12)).toBe(false);
  });

  it('awards a tie to the athlete against a bot', () => {
    expect(didWin(versus, 10, 10)).toBe(true);
  });

  it('treats a live-duel tie as a draw (mirrors cloud)', () => {
    expect(didWin({ ...versus, duelId: 'd1' }, 10, 10)).toBe(false);
    expect(didWin({ ...versus, duelId: 'd1' }, 11, 10)).toBe(true);
  });

  it('wins solo only by clearing the target', () => {
    expect(didWin(solo, 25, 0)).toBe(true);
    expect(didWin(solo, 24, 0)).toBe(false);
  });

  it('always counts practice as a win', () => {
    expect(didWin(practice, 0, 0)).toBe(true);
  });
});

describe('session lifecycle', () => {
  it('walks calibrate → countdown → active → finished', () => {
    const store = useSessionStore.getState();
    store.start(versus);
    expect(useSessionStore.getState().phase).toBe('calibrating');

    useSessionStore.getState().beginCountdown();
    expect(useSessionStore.getState().phase).toBe('countdown');

    useSessionStore.getState().beginActive();
    expect(useSessionStore.getState().phase).toBe('active');

    useSessionStore.getState().finish();
    expect(useSessionStore.getState().phase).toBe('finished');
  });

  it('resets counters when a new session starts', () => {
    useSessionStore.getState().start(versus);
    useSessionStore.getState().beginActive();
    useSessionStore.getState().applyPose({ depth: 0.9, tracking: true, completedRep: rep(1) });
    expect(useSessionStore.getState().reps).toBe(1);

    useSessionStore.getState().start(solo);
    expect(useSessionStore.getState().reps).toBe(0);
    expect(useSessionStore.getState().timeLeft).toBe(30);
  });

  it('ignores poses outside the active phase', () => {
    useSessionStore.getState().start(versus);
    // Still calibrating — a rep here would be counted before "GO".
    useSessionStore.getState().applyPose({ depth: 0.9, tracking: true, completedRep: rep(1) });
    expect(useSessionStore.getState().reps).toBe(0);
  });

  it('counts reps and stores their records', () => {
    useSessionStore.getState().start(versus);
    useSessionStore.getState().beginActive();
    [1, 2, 3].forEach((i) =>
      useSessionStore.getState().applyPose({ depth: 0.2, tracking: true, completedRep: rep(i) }),
    );

    expect(useSessionStore.getState().reps).toBe(3);
    expect(useSessionStore.getState().repRecords).toHaveLength(3);
  });

  it('nudges the athlete deeper after a partial rep', () => {
    useSessionStore.getState().start(versus);
    useSessionStore.getState().beginActive();
    useSessionStore
      .getState()
      .applyPose({ depth: 0.2, tracking: true, completedRep: rep(1, false) });

    expect(useSessionStore.getState().formCue).toBe('Go a little deeper');
  });

  it('finishes automatically when the clock runs out', () => {
    useSessionStore.getState().start({ ...versus, duration: 2 });
    useSessionStore.getState().beginActive();

    useSessionStore.getState().tickClock();
    expect(useSessionStore.getState().phase).toBe('active');

    useSessionStore.getState().tickClock();
    expect(useSessionStore.getState().phase).toBe('finished');
    expect(useSessionStore.getState().timeLeft).toBe(0);
  });

  it('awards XP and a form report on finish', () => {
    useSessionStore.getState().start(versus);
    useSessionStore.getState().beginActive();
    [1, 2, 3].forEach((i) =>
      useSessionStore.getState().applyPose({ depth: 0.2, tracking: true, completedRep: rep(i) }),
    );
    useSessionStore.getState().finish();

    const state = useSessionStore.getState();
    expect(state.won).toBe(true);
    expect(state.xpGained).toBe(200);
    expect(state.formReport?.score).toBeGreaterThan(0);
    expect(state.formReport?.bars).toHaveLength(3);
  });

  it('treats a forfeit as a loss regardless of the score', () => {
    useSessionStore.getState().start(versus);
    useSessionStore.getState().beginActive();
    useSessionStore.getState().applyPose({ depth: 0.2, tracking: true, completedRep: rep(1) });
    useSessionStore.getState().finish({ forfeited: true });

    expect(useSessionStore.getState().won).toBe(false);
    // Forfeit (and zero-rep) sessions award no XP — fair-play / abandon guard.
    expect(useSessionStore.getState().xpGained).toBe(0);
  });

  it('does not re-finish an already finished session', () => {
    useSessionStore.getState().start(versus);
    useSessionStore.getState().beginActive();
    useSessionStore.getState().finish();
    const xp = useSessionStore.getState().xpGained;

    useSessionStore.getState().finish({ forfeited: true });
    expect(useSessionStore.getState().xpGained).toBe(xp);
  });
});

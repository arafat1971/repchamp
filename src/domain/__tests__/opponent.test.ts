import { OPPONENTS, OpponentPacer, getOpponent } from '../opponent';

const adrian = OPPONENTS[0]!;
const mia = OPPONENTS[2]!;

describe('getOpponent', () => {
  it('finds a known opponent', () => {
    expect(getOpponent('zheng').name).toBe('Zheng');
  });

  it('falls back rather than returning undefined for an unknown id', () => {
    expect(getOpponent('nobody').id).toBe('adrian');
    expect(getOpponent(null).id).toBe('adrian');
  });
});

describe('OpponentPacer', () => {
  it('starts at zero reps', () => {
    expect(new OpponentPacer(adrian, 20).repsAt(0)).toBe(0);
  });

  it('accumulates reps monotonically over the duel', () => {
    const pacer = new OpponentPacer(adrian, 20);
    let previous = 0;
    for (let t = 0; t <= 20; t += 0.5) {
      const reps = pacer.repsAt(t);
      expect(reps).toBeGreaterThanOrEqual(previous);
      previous = reps;
    }
  });

  it('is deterministic for a given seed, so a duel can be replayed', () => {
    const a = new OpponentPacer(adrian, 20, 42);
    const b = new OpponentPacer(adrian, 20, 42);
    expect(a.finalReps).toBe(b.finalReps);
    expect(a.repsAt(11)).toBe(b.repsAt(11));
  });

  it('gives different opponents different scores from the same seed', () => {
    const slow = new OpponentPacer(adrian, 20, 7).finalReps;
    const fast = new OpponentPacer(mia, 20, 7).finalReps;
    expect(fast).toBeGreaterThan(slow);
  });

  it('lands within a believable range of the stated pace', () => {
    // Adrian is 58 rpm, so ~19 reps in 20s before fatigue and jitter.
    const reps = new OpponentPacer(adrian, 20, 3).finalReps;
    expect(reps).toBeGreaterThan(10);
    expect(reps).toBeLessThan(22);
  });

  it('never exceeds its final count once the duel ends', () => {
    const pacer = new OpponentPacer(mia, 20, 5);
    expect(pacer.repsAt(20)).toBe(pacer.finalReps);
    expect(pacer.repsAt(999)).toBe(pacer.finalReps);
  });
});

import {
  HEAT_WINDOW_MS,
  heatLabel,
  isFinalCountdown,
  readHeat,
} from '../raceMomentum';

const NOW = 100_000;
/** Reps landing `gaps` ms apart, the last one at `end`. */
function reps(count: number, gap: number, end = NOW): number[] {
  return Array.from({ length: count }, (_, i) => end - (count - 1 - i) * gap);
}

describe('readHeat', () => {
  it('calls my run when I out-pace them', () => {
    expect(readHeat(reps(3, 1500), reps(1, 1000), NOW)).toEqual({ kind: 'mine', run: 3 });
  });

  it('calls their run when they clearly out-pace me', () => {
    expect(readHeat(reps(1, 1000), reps(4, 1000), NOW)).toEqual({ kind: 'theirs', run: 4 });
  });

  /* The real duel that set RIVAL_SURGE_GAP: a normal human pace (2 in the
     window) against an AI partner's steady 3. Working a rep behind is not
     being out-surged. */
  it('does not call a rival’s ordinary pace a surge while I am working', () => {
    expect(readHeat(reps(2, 2500), reps(3, 1600), NOW)).toEqual({ kind: 'none' });
  });

  /* Both sprinting is a close race, not anyone's momentum. */
  it('says nothing when both keep the same pace', () => {
    expect(readHeat(reps(4, 1000), reps(4, 1000), NOW)).toEqual({ kind: 'none' });
  });

  it('needs a real run, not two quick reps', () => {
    expect(readHeat(reps(2, 500), [], NOW)).toEqual({ kind: 'none' });
  });

  /* A run from a while ago is history. */
  it('forgets reps outside the window', () => {
    const old = reps(5, 500, NOW - HEAT_WINDOW_MS - 1);
    expect(readHeat(old, [], NOW)).toEqual({ kind: 'none' });
  });

  it('counts only the recent part of a long set', () => {
    const history = [...reps(10, 500, NOW - 20_000), ...reps(3, 1500)];
    expect(readHeat(history, [], NOW)).toEqual({ kind: 'mine', run: 3 });
  });
});

describe('heatLabel', () => {
  it('escalates a long run and names the rival', () => {
    expect(heatLabel({ kind: 'mine', run: 3 }, 'Bea')).toBe('ON FIRE ×3');
    expect(heatLabel({ kind: 'mine', run: 5 }, 'Bea')).toBe('UNSTOPPABLE ×5');
    expect(heatLabel({ kind: 'theirs', run: 4 }, 'Bea')).toBe('BEA IS SURGING');
    expect(heatLabel({ kind: 'none' }, 'Bea')).toBe('');
  });
});

describe('isFinalCountdown', () => {
  it('covers the last ten seconds and not the end', () => {
    expect(isFinalCountdown(11)).toBe(false);
    expect(isFinalCountdown(10)).toBe(true);
    expect(isFinalCountdown(1)).toBe(true);
    expect(isFinalCountdown(0)).toBe(false);
  });
});

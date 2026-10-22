import { nextToClose } from '@/domain/nextToClose';

const base = {
  challenge: { best: 0, target: 30, label: 'Squat' },
  water: { ml: 0, goalMl: 1500 },
  steps: { steps: 0, goal: 8000 },
};

describe('nextToClose', () => {
  it('names the challenge on an untouched day', () => {
    expect(nextToClose(base)).toEqual({ kind: 'challenge', text: '30 squats to go' });
  });

  it('picks the ring nearest to closing', () => {
    const r = nextToClose({ ...base, water: { ml: 1250, goalMl: 1500 } });
    expect(r).toEqual({ kind: 'water', text: '1 glass of water to go' });
  });

  it('rounds water up to whole glasses', () => {
    const r = nextToClose({
      challenge: { best: 30, target: 30, label: 'Squat' },
      water: { ml: 1000, goalMl: 1500 },
      steps: null,
    });
    expect(r?.text).toBe('2 glasses of water to go');
  });

  it('says steps compactly', () => {
    const r = nextToClose({
      challenge: { best: 30, target: 30, label: 'Squat' },
      water: { ml: 1500, goalMl: 1500 },
      steps: { steps: 6800, goal: 8000 },
    });
    expect(r).toEqual({ kind: 'steps', text: '1.2k steps to go' });
  });

  it('uses the singular for one rep left', () => {
    const r = nextToClose({ ...base, challenge: { best: 29, target: 30, label: 'Push-Up' } });
    expect(r?.text).toBe('1 push-up to go');
  });

  it('calls a perfect day when everything that can close has', () => {
    const r = nextToClose({
      challenge: { best: 31, target: 30, label: 'Squat' },
      water: { ml: 1600, goalMl: 1500 },
      steps: null,
    });
    expect(r?.kind).toBe('perfect');
  });
});

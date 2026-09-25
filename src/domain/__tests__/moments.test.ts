import { clockTime, tallyScore, todayMoments } from '@/domain/moments';

const base = { name: 'Bea', myDrinks: [], mySets: [] };
const min = (n: number) => n * 60_000;

describe('todayMoments', () => {
  it('lists what happened, newest first, in plain words', () => {
    const m = todayMoments({
      ...base,
      theirDrink: { k: 'coffee', ml: 250, at: min(300) },
      myDrinks: [{ ml: 500, at: min(100), kind: null }],
      theirSet: { at: min(200), reps: 45, top: 'Squat' },
      mySets: [{ reps: 20, at: min(400), label: 'squats' }],
      fromThem: { at: min(500), emoji: null },
    });
    expect(m.map((x) => x.text)).toEqual([
      'Bea splashed you',
      'You did 20 squats',
      'Bea had a coffee · 250 ml',
      'Bea trained · 45 reps today (Squat)',
      'You had water · 500 ml',
    ]);
  });

  it('pairs a sip together, and names a reaction', () => {
    const m = todayMoments({
      ...base,
      theirDrink: { k: 'water', ml: 250, at: 1_000_000 },
      myDrinks: [{ ml: 250, at: 1_000_000 - 5 * 60_000 }],
      fromThem: { at: 900_000, emoji: '❤️' },
    });
    expect(m[0]).toMatchObject({ emoji: '🥂', text: 'You sipped together', who: 'us' });
    expect(m.find((x) => x.emoji === '❤️')?.text).toBe('Bea sent you ❤️');
  });

  it('caps the list and skips empty entries', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ ml: 250, at: i + 1 }));
    expect(todayMoments({ ...base, myDrinks: many }, 5)).toHaveLength(5);
    expect(todayMoments({ ...base, theirDrink: { ml: 0, at: 5 } })).toEqual([]);
  });
});

describe('clockTime', () => {
  it('reads twelve-hour', () => {
    expect(clockTime(new Date(2026, 8, 25, 15, 7).getTime())).toBe('3:07 PM');
    expect(clockTime(new Date(2026, 8, 25, 0, 30).getTime())).toBe('12:30 AM');
  });
});

describe('tallyScore', () => {
  it('counts only the metrics both show', () => {
    expect(
      tallyScore([
        { a: 1000, b: 1500, known: true },
        { a: 6000, b: 4000, known: true },
        { a: 0, b: 20, known: false },
      ]),
    ).toEqual({ mine: 1, theirs: 1 });
  });
});

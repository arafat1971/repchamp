import { setHighlight } from '@/domain/setHighlight';
import type { SessionSummary } from '@/state/profileStore';

let n = 0;
const s = (o: Partial<SessionSummary>): SessionSummary => ({
  id: `s${n++}`, exercise: 'pushup' as never, mode: 'solo' as never, reps: 10,
  opponentReps: null, opponentId: null, target: null, won: false, xp: 50,
  formScore: 70, durationSec: 60, completedAt: '2026-10-01T10:00:00Z', day: '2026-10-01', ...o,
});

describe('setHighlight', () => {
  it('says nothing on the very first set', () => {
    expect(setHighlight([s({})], 1, 'push-ups')).toBeNull();
  });
  it('flags a personal best', () => {
    const h = setHighlight([s({ reps: 14, day: '2026-10-02' }), s({ reps: 10 })], 2, 'push-ups');
    expect(h?.title).toBe('New personal best');
    expect(h?.body).toContain('4 more');
  });
  it('flags a streak milestone before anything else', () => {
    const h = setHighlight([s({ reps: 20, day: '2026-10-02' }), s({ reps: 10 })], 7, 'push-ups');
    expect(h?.title).toBe('7-day streak');
  });
  it('is null on an ordinary set', () => {
    const h = setHighlight([s({ reps: 8, day: '2026-10-02' }), s({ reps: 10 }), s({ reps: 12 })], 2, 'push-ups');
    expect(h).toBeNull();
  });
  it('flags a near miss just under the best', () => {
    const h = setHighlight([s({ reps: 23, day: '2026-10-02' }), s({ reps: 25 })], 2, 'push-ups');
    expect(h?.title).toBe('2 reps off your best');
    expect(h?.body).toBe('Your best is 25 push-ups. One more set could beat it.');
    expect(h?.beatTarget).toBe(25);
  });
  it('uses the singular for a one-rep miss', () => {
    const h = setHighlight([s({ reps: 9, day: '2026-10-02' }), s({ reps: 10 })], 2, 'push-ups');
    expect(h?.title).toBe('1 rep off your best');
  });
  it('widens the window for a big best', () => {
    // 15% of 40 is 6.
    expect(setHighlight([s({ reps: 34, day: '2026-10-02' }), s({ reps: 40 })], 2, 'squats')?.title)
      .toBe('6 reps off your best');
    expect(setHighlight([s({ reps: 33, day: '2026-10-02' }), s({ reps: 40 })], 2, 'squats')).toBeNull();
  });
  it('skips a near miss when the best is tiny', () => {
    expect(setHighlight([s({ reps: 3, day: '2026-10-02' }), s({ reps: 4 })], 2, 'push-ups')).toBeNull();
  });
  it('never calls a tie with the best a miss', () => {
    const h = setHighlight([s({ reps: 10, day: '2026-10-02' }), s({ reps: 10 }), s({ reps: 10, day: '2026-09-30' })], 2, 'push-ups');
    expect(h).toBeNull();
  });
  it('flags textbook form', () => {
    const h = setHighlight([s({ reps: 8, formScore: 95, day: '2026-10-02' }), s({ reps: 12 })], 2, 'push-ups');
    expect(h?.title).toBe('Textbook form');
  });
});

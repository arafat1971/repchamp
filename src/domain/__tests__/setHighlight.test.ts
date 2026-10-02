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
  it('flags textbook form', () => {
    const h = setHighlight([s({ reps: 8, formScore: 95, day: '2026-10-02' }), s({ reps: 12 })], 2, 'push-ups');
    expect(h?.title).toBe('Textbook form');
  });
});

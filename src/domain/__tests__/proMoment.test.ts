import {
  BACKOFF_DAYS,
  COOLDOWN_DAYS,
  chooseProMoment,
  type MomentSession,
  type ProMomentInput,
  type ProMomentRecord,
} from '../proMoment';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-03T12:00:00Z');
const TODAY = '2026-10-03';

const day = (ago: number) => new Date(NOW - ago * DAY).toISOString().slice(0, 10);
const set = (over: Partial<MomentSession> = {}): MomentSession => ({
  exercise: 'push',
  mode: 'solo',
  reps: 12,
  won: false,
  day: TODAY,
  ...over,
});

/** Three older push sets (best 10) on earlier days, plus whatever just finished. */
const withHistory = (latest: MomentSession, extra: MomentSession[] = []) => [
  latest,
  ...extra,
  set({ reps: 8, day: day(5) }),
  set({ reps: 10, day: day(6) }),
  set({ reps: 9, day: day(7) }),
];

const input = (over: Partial<ProMomentInput> = {}): ProMomentInput => ({
  isPro: false,
  sessions: withHistory(set()),
  history: [],
  now: NOW,
  today: TODAY,
  ...over,
});

const rec = (over: Partial<ProMomentRecord> = {}): ProMomentRecord => ({
  kind: 'personal-best',
  at: NOW - 10 * DAY,
  outcome: 'shown',
  ...over,
});

describe('chooseProMoment', () => {
  it('celebrates a real personal best with the athlete’s own numbers', () => {
    const m = chooseProMoment(input());
    expect(m?.kind).toBe('personal-best');
    expect(m?.headline).toBe('New best: 12 push-ups');
    expect(m?.body).toContain('last best of 10');
  });

  it('stays silent when the set did not beat the best', () => {
    expect(chooseProMoment(input({ sessions: withHistory(set({ reps: 10 })) }))).toBeNull();
  });

  it('never prompts Pro athletes', () => {
    expect(chooseProMoment(input({ isPro: true }))).toBeNull();
  });

  it('does not pitch before a habit exists', () => {
    expect(chooseProMoment(input({ sessions: [set(), set({ day: day(1), reps: 3 })] }))).toBeNull();
  });

  it('does not pitch on a tiny set or in together mode', () => {
    expect(chooseProMoment(input({ sessions: withHistory(set({ reps: 4 })) }))).toBeNull();
    expect(chooseProMoment(input({ sessions: withHistory(set({ mode: 'together' })) }))).toBeNull();
  });

  it('does not double up with the rep wall countdown', () => {
    expect(chooseProMoment(input({ nearingWall: true }))).toBeNull();
  });

  it('marks a streak milestone only on the first set of the day', () => {
    const run = [0, 1, 2].map((n) => set({ reps: 6, day: day(n) }));
    const first = chooseProMoment(
      input({ sessions: [...run, set({ reps: 6, day: day(20) })] }),
    );
    expect(first?.kind).toBe('streak-milestone');
    expect(first?.headline).toBe('3 days in a row');

    const second = chooseProMoment(
      input({ sessions: [set({ reps: 6 }), ...run, set({ reps: 6, day: day(20) })] }),
    );
    expect(second).toBeNull();
  });

  it('celebrates a first head-to-head win once', () => {
    const win = set({ mode: 'versus', won: true, reps: 6 });
    const base = [set({ reps: 7, day: day(1) }), set({ reps: 7, day: day(2) })];
    expect(chooseProMoment(input({ sessions: [win, ...base, set({ reps: 7, day: day(3) })] }))?.kind).toBe('first-win');
    const earlier = set({ mode: 'versus', won: true, reps: 6, day: day(4) });
    expect(chooseProMoment(input({ sessions: [win, ...base, earlier] }))).toBeNull();
  });

  it('ranks a personal best above a win', () => {
    const m = chooseProMoment(input({ sessions: withHistory(set({ mode: 'versus', won: true })) }));
    expect(m?.kind).toBe('personal-best');
  });
});

describe('pacing', () => {
  it('holds off inside the cooldown after any prompt', () => {
    const recent = rec({ at: NOW - (COOLDOWN_DAYS - 1) * DAY });
    expect(chooseProMoment(input({ history: [recent] }))).toBeNull();
  });

  it('does not repeat the same kind inside a month, but allows a different one', () => {
    const history = [rec({ at: NOW - 10 * DAY })];
    expect(chooseProMoment(input({ history }))).toBeNull();
  });

  it('backs off for two weeks after two dismissals in a row', () => {
    const history = [
      rec({ kind: 'streak-milestone', at: NOW - 6 * DAY, outcome: 'dismissed' }),
      rec({ kind: 'first-win', at: NOW - 20 * DAY, outcome: 'dismissed' }),
    ];
    expect(chooseProMoment(input({ history }))).toBeNull();

    const later = [
      rec({ kind: 'streak-milestone', at: NOW - BACKOFF_DAYS * DAY, outcome: 'dismissed' }),
      rec({ kind: 'first-win', at: NOW - 30 * DAY, outcome: 'dismissed' }),
    ];
    expect(chooseProMoment(input({ history: later }))?.kind).toBe('personal-best');
  });

  it('one dismissal is not a back-off', () => {
    const history = [rec({ kind: 'streak-milestone', at: NOW - 5 * DAY, outcome: 'dismissed' })];
    expect(chooseProMoment(input({ history }))?.kind).toBe('personal-best');
  });
});

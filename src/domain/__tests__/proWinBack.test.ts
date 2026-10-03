import {
  MAX_DAYS_LAPSED,
  MIN_DAYS_LAPSED,
  winBack,
  type WinBackInput,
} from '../proWinBack';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-03T12:00:00Z');
const iso = (agoDays: number) => new Date(NOW - agoDays * DAY).toISOString();

const input = (over: Partial<WinBackInput> = {}): WinBackInput => ({
  lapsed: {
    periodType: 'NORMAL',
    startedAt: NOW - 60 * DAY,
    endedAt: NOW - 10 * DAY,
    billingIssue: false,
  },
  sessions: [
    { reps: 20, completedAt: iso(40) },
    { reps: 15, completedAt: iso(30) },
    { reps: 12, completedAt: iso(20) },
  ],
  history: [],
  now: NOW,
  ...over,
});

describe('winBack', () => {
  it('shows what they did while subscribed, with their own numbers', () => {
    const d = winBack(input());
    expect(d?.kind).toBe('offer');
    expect(d?.body).toContain('3 times');
    expect(d?.body).toContain('47 reps');
  });

  it('promises no discount', () => {
    expect(winBack(input())?.body).toContain('same price');
  });

  it('stays silent with nothing honest to say about the Pro window', () => {
    const sessions = [{ reps: 20, completedAt: iso(40) }, { reps: 5, completedAt: iso(2) }];
    expect(winBack(input({ sessions }))).toBeNull();
  });

  it('ignores sets from outside the window', () => {
    const sessions = [
      { reps: 9, completedAt: iso(70) },
      { reps: 9, completedAt: iso(5) },
      { reps: 9, completedAt: iso(4) },
      { reps: 9, completedAt: iso(3) },
    ];
    expect(winBack(input({ sessions }))).toBeNull();
  });

  it('waits a few days and gives up after a quarter', () => {
    const base = input().lapsed!;
    expect(winBack(input({ lapsed: { ...base, endedAt: NOW - (MIN_DAYS_LAPSED - 1) * DAY } }))).toBeNull();
    expect(winBack(input({ lapsed: { ...base, endedAt: NOW - (MAX_DAYS_LAPSED + 1) * DAY } }))).toBeNull();
  });

  it('never pitches a billing failure — it says how to fix it', () => {
    const lapsed = { ...input().lapsed!, billingIssue: true };
    const d = winBack(input({ lapsed, sessions: [] }));
    expect(d?.kind).toBe('billing-issue');
    expect(d?.body).toContain('declined');
  });

  it('says "trial" when a trial is what ended', () => {
    const lapsed = { ...input().lapsed!, periodType: 'TRIAL' };
    expect(winBack(input({ lapsed }))?.body).toContain('your trial');
  });

  it('is rationed, and waits longer after a dismissal', () => {
    expect(winBack(input({ history: [{ at: NOW - 10 * DAY, outcome: 'shown' }] }))).toBeNull();
    expect(winBack(input({ history: [{ at: NOW - 31 * DAY, outcome: 'shown' }] }))).not.toBeNull();
    expect(winBack(input({ history: [{ at: NOW - 45 * DAY, outcome: 'dismissed' }] }))).toBeNull();
    const two = [100, 200].map((d) => ({ at: NOW - d * DAY, outcome: 'shown' as const }));
    expect(winBack(input({ history: two }))).toBeNull();
  });

  it('does nothing for athletes who were never subscribed', () => {
    expect(winBack(input({ lapsed: null }))).toBeNull();
  });
});

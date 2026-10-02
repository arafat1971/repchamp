import { dayFeed, type DayFeedInput } from '@/domain/dayFeed';

const base: DayFeedInput = {
  firstName: 'Sam', streak: 0, trainedToday: false, repsToday: 0, totalReps: 0,
  daysThisWeek: 1, weeklyGoal: 4,
  challenge: { name: 'Quick fifteen', label: 'Push-Ups', target: 15, best: 0, cleared: false },
  partner: null,
};
const ids = (i: DayFeedInput) => dayFeed(i).map((c) => c.id);

describe('dayFeed', () => {
  it('leads with the open challenge and ends on a next action for a new athlete', () => {
    const cards = dayFeed(base);
    expect(cards[0]?.id).toBe('challenge');
    expect(cards[cards.length - 1]?.action).toBe('train');
  });
  it('omits cards with nothing true to say', () => {
    expect(ids(base)).not.toContain('streak');
    expect(ids(base)).not.toContain('total');
    expect(ids(base)).not.toContain('partner');
  });
  it('shows streak, total and partner when they exist', () => {
    const got = ids({ ...base, streak: 5, totalReps: 1200, partner: { name: 'Alex', trainedToday: true } });
    expect(got).toEqual(expect.arrayContaining(['streak', 'total', 'partner']));
  });
  it('marks a cleared challenge and drops its CTA', () => {
    const c = dayFeed({ ...base, challenge: { ...base.challenge, best: 15, cleared: true } })[0];
    expect(c?.id).toBe('challenge-done');
    expect(c?.action).toBeNull();
  });
  it('invites a solo athlete only after they have trained', () => {
    expect(ids({ ...base, trainedToday: true })).toContain('invite');
    expect(ids(base)).not.toContain('invite');
  });
  it('never claims the weekly goal is short once met', () => {
    const w = dayFeed({ ...base, daysThisWeek: 4 }).find((c) => c.id === 'week');
    expect(w?.body).toContain('hit');
  });
});

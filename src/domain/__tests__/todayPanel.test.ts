import { streakLine } from '@/domain/todayPanel';

describe('streakLine', () => {
  it('invites day one instead of showing zero', () => {
    expect(streakLine(0, 0, 4)).toBe('Day 1 starts with one set');
  });
  it('counts toward the weekly goal', () => {
    expect(streakLine(3, 2, 4)).toBe('2/4 days · 2 to go');
  });
  it('celebrates the goal met', () => {
    expect(streakLine(5, 4, 4)).toBe('Weekly goal met · 4/4');
    expect(streakLine(5, 5, 4)).toBe('Weekly goal met · 5/4');
  });
  it('a carried streak on a fresh week still points forward', () => {
    expect(streakLine(6, 0, 3)).toBe('3 days to train this week');
  });
});

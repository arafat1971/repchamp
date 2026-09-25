import { buildWeeklyRecap } from '@/domain/reminderCopy';

describe('the weekly recap, together', () => {
  const base = { sessions: [], streak: 0 };

  it('stays the solo recap when unpaired or nothing together happened', () => {
    expect(buildWeeklyRecap(base).title).toBe('Your week in reps');
    expect(buildWeeklyRecap({ ...base, together: { name: 'Sam', perfectDays: 0, trend: null } }).title).toBe('Your week in reps');
  });

  it('celebrates perfect days and an upward trend', () => {
    expect(buildWeeklyRecap({ ...base, together: { name: 'Sam', perfectDays: 4, trend: { now: 4.2, before: 3 } } })).toEqual({
      title: 'Your week together',
      body: '4 perfect days with Sam 🏆 · +1.2 habits a day 📈',
    });
  });

  it('never puts a dip in a push', () => {
    const copy = buildWeeklyRecap({ ...base, together: { name: 'Sam', perfectDays: 1, trend: { now: 2, before: 4 } } });
    expect(copy.body).toBe('1 perfect day with Sam 🏆');
    expect(buildWeeklyRecap({ ...base, together: { name: 'Sam', perfectDays: 0, trend: { now: 2, before: 4 } } }).title).toBe('Your week in reps');
  });
});

import { aWeekBefore, compareWeeks, isoWeekRange } from '../weekRecap';

describe('isoWeekRange', () => {
  it('runs Monday to Sunday around a Tuesday', () => {
    const { start, end } = isoWeekRange(new Date(2026, 9, 27, 18, 30)); // Tue 27 Oct
    expect([start.getDate(), start.getDay()]).toEqual([26, 1]);
    expect([end.getDate(), end.getDay()]).toEqual([1, 0]);
    expect(start.getHours()).toBe(0);
  });

  it('keeps a Sunday in the week that started six days earlier', () => {
    const { start } = isoWeekRange(new Date(2026, 10, 1)); // Sun 1 Nov
    expect(start.getDate()).toBe(26);
  });

  it('starts on the day itself for a Monday', () => {
    expect(isoWeekRange(new Date(2026, 9, 26, 9)).start.getDate()).toBe(26);
  });
});

describe('aWeekBefore', () => {
  it('steps back seven days', () => {
    expect(aWeekBefore(new Date(2026, 9, 27)).getDate()).toBe(20);
  });
});

describe('compareWeeks', () => {
  it('says nothing when neither week has reps', () => {
    expect(compareWeeks(0, 0)).toBeNull();
  });

  it('turns an empty week into a target', () => {
    expect(compareWeeks(0, 120)).toBe('Last week: 120 reps. Beat it.');
  });

  it('marks a first week', () => {
    expect(compareWeeks(40, 0)).toBe('Your first week on the board.');
  });

  it('states a real gain as a percent', () => {
    expect(compareWeeks(150, 100)).toBe('Up 50% on last week.');
    expect(compareWeeks(1001, 1000)).toBe('Just ahead of last week.');
  });

  it('states a gap as reps to close it', () => {
    expect(compareWeeks(60, 100)).toBe('40 reps to match last week.');
  });

  it('notes a tie', () => {
    expect(compareWeeks(80, 80)).toBe('Level with last week.');
  });
});

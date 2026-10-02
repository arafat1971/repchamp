import type { Achievement } from '../achievements';
import { achievementPercent, nextUp, remainingLabel } from '../achievementFocus';

const make = (id: string, current: number, goal: number): Achievement => ({
  id,
  title: id,
  description: '',
  emoji: '',
  goal,
  current,
  earned: current >= goal,
  label: `${current}/${goal}`,
});

describe('achievementFocus', () => {
  it('never shows an unearned badge as complete', () => {
    expect(achievementPercent(make('a', 99, 100))).toBe(99);
    expect(achievementPercent(make('a', 100, 100))).toBe(100);
  });

  it('picks the unearned badge furthest along, ignoring earned ones', () => {
    const list = [make('done', 5, 5), make('far', 1, 25), make('close', 80, 100)];
    expect(nextUp(list)?.id).toBe('close');
  });

  it('breaks ties by order and returns null when everything is earned', () => {
    expect(nextUp([make('a', 1, 10), make('b', 1, 10)])?.id).toBe('a');
    expect(nextUp([make('a', 10, 10)])).toBeNull();
  });

  it('says how much is left', () => {
    expect(remainingLabel(make('a', 93, 100))).toBe('7 to go');
    expect(remainingLabel(make('a', 100, 100))).toBeNull();
  });
});

/**
 * Words for the Today panel's week row — forward-looking, never a bare zero.
 *
 * A new athlete used to meet "0 days", "0 XP" and "0/3" stacked above the
 * fold, which reads as an empty app. Every branch here names the next thing
 * that would change the number instead.
 */
export function streakLine(streak: number, daysTrained: number, goal: number): string {
  const g = Math.max(1, goal);
  if (daysTrained >= g) return `Weekly goal met · ${daysTrained}/${g}`;
  if (daysTrained === 0) return streak > 0 ? `${g} days to train this week` : 'Day 1 starts with one set';
  const left = g - daysTrained;
  return `${daysTrained}/${g} days · ${left} to go`;
}

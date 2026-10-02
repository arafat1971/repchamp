import { WALK_STEPS_PER_MIN } from '@/domain/stepsPace';

/**
 * Two people's steps, read together: a shared goal you fill as a team, who
 * leads, and one line that says what to do about it — in minutes of walking,
 * not raw step counts, because that is something a person can act on.
 */

/** Within this many steps, it's a tie. */
export const NECK_AND_NECK = 300;

export interface StepsDuo {
  /** Both counts added up, and the team goal (both goals added up). */
  together: number;
  togetherGoal: number;
  togetherPct: number;
  /** 'me' | 'them' | 'tie', or null while their count is unknown. */
  leader: 'me' | 'them' | 'tie' | null;
  /** The coaching line. */
  line: string;
  /** The tone of that line, for its colour. */
  tone: 'win' | 'push' | 'calm';
}

/** Minutes of brisk walking that cover `steps`, rounded up to 5. */
export function walkMinutes(steps: number): number {
  return Math.max(5, Math.ceil(steps / WALK_STEPS_PER_MIN / 5) * 5);
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export function stepsDuo({
  mine,
  theirs,
  myGoal,
  theirGoal,
  name,
}: {
  mine: number;
  /** null while they aren't sharing a count today. */
  theirs: number | null;
  myGoal: number;
  theirGoal: number;
  name: string;
}): StepsDuo {
  const known = theirs != null;
  const t = theirs ?? 0;
  const togetherGoal = myGoal + theirGoal;
  const together = mine + t;
  const togetherPct = togetherGoal > 0 ? Math.min(1, together / togetherGoal) : 0;
  if (!known) {
    return { together, togetherGoal, togetherPct, leader: null, line: `Waiting for ${name}'s steps`, tone: 'calm' };
  }
  const iMet = mine >= myGoal;
  const theyMet = t >= theirGoal;
  const gap = mine - t;
  const leader = Math.abs(gap) <= NECK_AND_NECK ? 'tie' : gap > 0 ? 'me' : 'them';
  if (iMet && theyMet) {
    return { together, togetherGoal, togetherPct, leader, line: 'You both hit your step goal 🏆', tone: 'win' };
  }
  if (leader === 'tie') {
    return { together, togetherGoal, togetherPct, leader, line: 'Neck and neck — first one out the door leads', tone: 'push' };
  }
  if (leader === 'them') {
    return {
      together,
      togetherGoal,
      togetherPct,
      leader,
      line: `${fmt(-gap)} behind ${name} — a ${walkMinutes(-gap)}-min walk takes the lead`,
      tone: 'push',
    };
  }
  const teamLeft = Math.max(0, togetherGoal - together);
  return {
    together,
    togetherGoal,
    togetherPct,
    leader,
    line:
      teamLeft > 0 && iMet
        ? `You're done — cheer ${name} through the last ${fmt(theirGoal - t)}`
        : `${fmt(gap)} ahead of ${name} — keep it going`,
    tone: iMet ? 'win' : 'calm',
  };
}

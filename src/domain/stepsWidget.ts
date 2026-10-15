/**
 * The Steps widget's payload — everything phrased here, so the Kotlin in
 * `plugins/stepsWidgetTemplates.js` only draws.
 *
 * Flat primitives only (the widget reads them with `opt*`). A count the phone
 * cannot give is -1, never 0: a zero would read as "didn't walk".
 */

import { formatSteps } from '@/domain/steps';
import { stepsDuo } from '@/domain/stepsDuo';
import { stepsPace } from '@/domain/stepsPace';

export interface StepsWidgetSnapshot {
  /** `YYYY-MM-DD`; another day reads as stale. */
  day: string;
  /** -1 when this phone has no count. */
  mine: number;
  myGoal: number;
  /** The partner's first name, or '' when unpaired. */
  name: string;
  /** -1 while they haven't shared today. */
  theirs: number;
  theirGoal: number;
  /** The small pill top-right: who leads, or the goal reached. '' hides it. */
  badge: string;
  /** One line under the bars. */
  line: string;
  updatedAt: number;
}

export function buildStepsWidgetSnapshot({
  day,
  mine,
  myGoal,
  partner,
  theirGoal,
  now,
}: {
  day: string;
  mine: number | null;
  myGoal: number;
  /** null when unpaired. */
  partner: { name: string; steps: number | null } | null;
  theirGoal: number;
  now: Date;
}): StepsWidgetSnapshot {
  const base = {
    day,
    mine: mine ?? -1,
    myGoal,
    theirGoal,
    updatedAt: now.getTime(),
  };
  if (!partner) {
    const pace = mine == null ? null : stepsPace(mine, myGoal, now);
    return {
      ...base,
      name: '',
      theirs: -1,
      badge: mine != null && mine >= myGoal ? 'Goal 🏆' : mine != null ? `${Math.min(100, Math.round((mine / myGoal) * 100))}%` : '',
      line: pace ? pace.line : 'Open RepChamp to start counting',
    };
  }
  const duo = stepsDuo({ mine: mine ?? 0, theirs: partner.steps, myGoal, theirGoal, name: partner.name });
  const badge =
    duo.leader === 'me' ? 'You lead' : duo.leader === 'them' ? `${partner.name} leads` : duo.leader === 'tie' ? 'Tied' : '';
  const teamLeft = Math.max(0, duo.togetherGoal - duo.together);
  const line =
    partner.steps == null
      ? duo.line
      : teamLeft === 0
        ? 'Team goal smashed — together 🎉'
        : `${duo.line} · ${formatSteps(teamLeft)} left as a team`;
  return { ...base, name: partner.name, theirs: partner.steps ?? -1, badge, line };
}

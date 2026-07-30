/**
 * Contextual home greetings — time of day + streak / deadline hooks so the
 * header feels like a coach, not a clock.
 */

export type HomeGreeting = {
  /** Short line above the name, e.g. "Ready for today's streak?" */
  hook: string;
  /** Classic time-of-day greeting. */
  timeOfDay: string;
  /** Optional urgency chip under the name. */
  bonus: string | null;
};

function timeOfDayLabel(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Pick a greeting from local clock + streak state.
 *
 * Bonus copy only appears before 18:00 when the athlete still needs a set
 * today — a small XP nudge, not a permanent badge.
 */
export function selectHomeGreeting(input: {
  hour?: number;
  streak: number;
  trainedToday: boolean;
  firstName: string;
}): HomeGreeting {
  const hour = input.hour ?? new Date().getHours();
  const timeOfDay = timeOfDayLabel(hour);
  const name = input.firstName.trim() || 'Champ';

  let hook: string;
  if (!input.trainedToday && input.streak > 0) {
    hook = hour < 12 ? '🔥 Ready for today’s streak?' : '🔥 Keep the streak alive';
  } else if (!input.trainedToday) {
    hook = hour < 12 ? 'Let’s bank some XP' : 'Your set is waiting';
  } else if (input.streak >= 3) {
    hook = `🔥 ${input.streak}-day streak — nice`;
  } else {
    hook = `Looking strong, ${name}`;
  }

  const bonus =
    !input.trainedToday && hour < 18
      ? '+5 XP if you finish before 6 PM'
      : !input.trainedToday && hour >= 18
        ? 'Night set still counts'
        : null;

  return { hook, timeOfDay, bonus };
}

/** First token of a display name for greetings. */
export function firstNameOf(displayName: string): string {
  const part = displayName.trim().split(/\s+/)[0];
  return part || 'Champ';
}

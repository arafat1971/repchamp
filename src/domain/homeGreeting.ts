/**
 * Contextual home greetings — time of day + streak / deadline hooks so the
 * header feels like a coach, not a clock.
 */

import { challengeXpReward } from '@/domain/dailyChallenge';

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
 * today — the real challenge reward, not a permanent badge.
 */
export function selectHomeGreeting(input: {
  hour?: number;
  streak: number;
  trainedToday: boolean;
  firstName: string;
}): HomeGreeting {
  const hour = input.hour ?? new Date().getHours();
  const timeOfDay = timeOfDayLabel(hour);

  /* Plain statements of where the day stands. Emoji and cheerleading
     ("Let's bank some XP", "— nice") read as generated copy; a coach says
     what is true and what to do. */
  let hook: string;
  if (!input.trainedToday && input.streak > 0) {
    hook = `Train today to keep your ${input.streak}-day streak`;
  } else if (!input.trainedToday) {
    hook = 'No set logged yet today';
  } else if (input.streak >= 3) {
    hook = `Trained today · ${input.streak}-day streak`;
  } else {
    hook = 'Trained today';
  }

  /* The chip names what clearing the challenge actually pays, read from the same
     rule the Daily screen uses. It used to promise "+5 XP if you finish before
     6 PM" — a bonus no code ever granted, so the app advertised XP it did not
     pay. */
  const bonus =
    !input.trainedToday && hour < 18
      ? `+${challengeXpReward()} XP for clearing it`
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

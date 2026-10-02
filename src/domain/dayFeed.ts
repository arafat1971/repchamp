/**
 * "Your day" feed — full-screen vertical cards, one idea each, swiped like a
 * short-video feed. Every card is built from this athlete's own data, so the
 * feed is never filler: a card with nothing true to say is simply not in it.
 *
 * Order is the design. The first card is what matters most right now, and the
 * last always points at the next action, so a swipe-through ends on a tap.
 */
export type FeedAction = 'challenge' | 'train' | 'invite' | 'partner' | null;

export interface FeedCard {
  id: string;
  emoji: string;
  kicker: string;
  /** The big line. */
  headline: string;
  body: string;
  cta: string | null;
  action: FeedAction;
  /** Gradient stops, top → bottom. */
  colors: [string, string];
}

export interface DayFeedInput {
  firstName: string;
  streak: number;
  trainedToday: boolean;
  repsToday: number;
  totalReps: number;
  daysThisWeek: number;
  weeklyGoal: number;
  challenge: { name: string; label: string; target: number; best: number; cleared: boolean };
  partner: { name: string; trainedToday: boolean } | null;
}

const GREEN: [string, string] = ['#16A34A', '#064E3B'];
const FIRE: [string, string] = ['#F97316', '#7C2D12'];
const VIOLET: [string, string] = ['#7C3AED', '#2E1065'];
const BLUE: [string, string] = ['#0EA5E9', '#0C4A6E'];
const PINK: [string, string] = ['#EC4899', '#831843'];

export function dayFeed(i: DayFeedInput): FeedCard[] {
  const cards: FeedCard[] = [];

  if (!i.challenge.cleared) {
    const left = Math.max(0, i.challenge.target - i.challenge.best);
    cards.push({
      id: 'challenge',
      emoji: '🎯',
      kicker: "TODAY'S CHALLENGE",
      headline: `${i.challenge.target} ${i.challenge.label}`,
      body:
        i.challenge.best > 0
          ? `${i.challenge.name}. ${left} to go — you've already done ${i.challenge.best}.`
          : `${i.challenge.name}. One set. Tomorrow it's something different.`,
      cta: 'Take it on',
      action: 'challenge',
      colors: GREEN,
    });
  } else {
    cards.push({
      id: 'challenge-done',
      emoji: '✅',
      kicker: "TODAY'S CHALLENGE",
      headline: 'Cleared',
      body: `${i.challenge.name} is done. A new one drops tomorrow.`,
      cta: null,
      action: null,
      colors: GREEN,
    });
  }

  if (i.streak > 0) {
    cards.push({
      id: 'streak',
      emoji: '🔥',
      kicker: 'YOUR STREAK',
      headline: `${i.streak} ${i.streak === 1 ? 'day' : 'days'}`,
      body: i.trainedToday
        ? "Locked in for today. Come back tomorrow and it grows."
        : `Train today to keep it alive${i.firstName ? `, ${i.firstName}` : ''}.`,
      cta: i.trainedToday ? null : 'Start a set',
      action: i.trainedToday ? null : 'train',
      colors: FIRE,
    });
  }

  if (i.partner) {
    cards.push({
      id: 'partner',
      emoji: i.partner.trainedToday ? '💪' : '👀',
      kicker: 'YOUR PARTNER',
      headline: i.partner.trainedToday ? `${i.partner.name} already trained` : `${i.partner.name} hasn't trained yet`,
      body: i.partner.trainedToday
        ? i.trainedToday
          ? 'Both of you showed up today.'
          : "Don't let them have the day to themselves."
        : i.trainedToday
          ? "You're ahead. Send a nudge."
          : 'First one in sets the pace.',
      cta: i.trainedToday && i.partner.trainedToday ? null : 'Open together',
      action: i.trainedToday && i.partner.trainedToday ? null : 'partner',
      colors: PINK,
    });
  }

  const left = Math.max(0, i.weeklyGoal - i.daysThisWeek);
  cards.push({
    id: 'week',
    emoji: '📅',
    kicker: 'THIS WEEK',
    headline: `${i.daysThisWeek} of ${i.weeklyGoal} days`,
    body:
      left === 0
        ? 'Weekly goal hit. Anything more is bonus.'
        : `${left} more ${left === 1 ? 'day' : 'days'} to hit your goal.`,
    cta: null,
    action: null,
    colors: BLUE,
  });

  if (i.totalReps > 0) {
    cards.push({
      id: 'total',
      emoji: '📈',
      kicker: 'ALL TIME',
      headline: `${i.totalReps.toLocaleString('en-US')} reps`,
      body: i.repsToday > 0 ? `${i.repsToday} of them today.` : 'Every one counted by your own camera.',
      cta: null,
      action: null,
      colors: VIOLET,
    });
  }

  if (!i.trainedToday) {
    cards.push({
      id: 'go',
      emoji: '⚡',
      kicker: 'READY?',
      headline: 'Two minutes.',
      body: 'That is all today asks.',
      cta: 'Start a set',
      action: 'train',
      colors: GREEN,
    });
  } else if (!i.partner) {
    cards.push({
      id: 'invite',
      emoji: '🤝',
      kicker: 'BETTER TOGETHER',
      headline: 'Train with someone',
      body: 'A shared streak only survives if you both show up.',
      cta: 'Invite a partner',
      action: 'invite',
      colors: PINK,
    });
  }

  return cards;
}

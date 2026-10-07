/**
 * How an AI partner talks — a friend and coach, never a rival to be afraid of.
 *
 * The partners are labelled AI and always women (see `phantomRoster`). Their
 * voice is warm and encouraging: they cheer when you pass them, say "good
 * race" when you lose, and never trash-talk, flirt, or claim to be a person.
 *
 * Pure: the screens pass in the partner's id and name and get a line back.
 * `seed` picks a variant deterministically so a line is stable across renders.
 */

import { PHANTOM_USERS } from '@/domain/phantomRoster';

export type PartnerMoment = 'tookLead' | 'win' | 'loss' | 'draw';

/** Built-in rivals (Ada, Zara, Mia) are AI partners too. */
const BUILT_IN_AI: ReadonlySet<string> = new Set(['adrian', 'zheng', 'mia']);

/** True when the opponent id is one of the app's AI friends, not a human. */
export function isAiPartner(id: string | null | undefined): boolean {
  if (!id) return false;
  return BUILT_IN_AI.has(id) || PHANTOM_USERS.some((u) => u.id === id);
}

// `{you}` is the athlete's first name. The partner never names itself: the
// screen already shows who is talking.
const LINES: Record<PartnerMoment, readonly string[]> = {
  tookLead: ['You passed me — go {you}!', 'Look at you go!', 'That pace is great, keep it up!'],
  win: [
    'You beat me, {you} — I\'m so proud of you!',
    'That was a strong set, {you}. Well earned!',
    'You out-paced me today. Great work!',
  ],
  loss: [
    'Good race, {you}! You get stronger every set.',
    'So close — I\'ll pace you again whenever you want.',
    'Proud of you for showing up. Rematch?',
  ],
  draw: ['Dead level, {you} — we make a great team!', 'A tie! Rematch to settle it?'],
};

/** A line for the moment, or null when the opponent is not an AI partner. */
export function partnerLine(
  id: string | null | undefined,
  moment: PartnerMoment,
  userName: string | undefined,
  seed = 0,
): string | null {
  if (!isAiPartner(id)) return null;
  const options = LINES[moment];
  const line = options[Math.abs(Math.trunc(seed)) % options.length] as string;
  return line.replace('{you}', userName || 'champ');
}

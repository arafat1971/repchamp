/**
 * Today's moments: what happened between the two of us today, newest first —
 * the partner's latest drink and set, my drinks and sets, a splash or a
 * reaction they sent, and the times we sipped within minutes of each other.
 *
 * Only facts this phone has: the partner's side is what the couple document
 * carries (their latest drink, their latest set, their latest nudge to me),
 * mine is my own log. Nothing is inferred beyond pairing up two drinks.
 */

import { DRINK_META, parseDrinkKind } from '@/domain/drinkKinds';
import { formatMl } from '@/domain/hydration';

export interface Moment {
  at: number;
  emoji: string;
  text: string;
  who: 'me' | 'them' | 'us';
}

export interface MomentsInput {
  name: string;
  /** Their latest drink today. */
  theirDrink?: { k?: string | null; ml: number; at: number } | null;
  /** Their latest set today, with the day's reps so far. */
  theirSet?: { at: number; reps: number; top?: string | null } | null;
  /** My drinks today. */
  myDrinks: readonly { ml: number; at: number; kind?: string | null }[];
  /** My sets today. */
  mySets: readonly { reps: number; at: number; label: string }[];
  /** Their latest nudge to me today: a splash, or a reaction with its emoji. */
  fromThem?: { at: number; emoji?: string | null } | null;
}

/** Two drinks this close count as a sip together. */
const TOGETHER_MS = 10 * 60 * 1000;

function drinkWords(kind: string | null | undefined): { emoji: string; noun: string } {
  const k = parseDrinkKind(kind);
  const meta = DRINK_META[k];
  const noun = k === 'water' ? 'water' : k === 'milk' ? 'some milk' : `a ${meta.label.toLowerCase()}`;
  return { emoji: meta.emoji, noun };
}

export function todayMoments(input: MomentsInput, limit = 8): Moment[] {
  const out: Moment[] = [];
  const { name } = input;

  if (input.theirDrink && input.theirDrink.ml > 0) {
    const d = drinkWords(input.theirDrink.k);
    out.push({ at: input.theirDrink.at, emoji: d.emoji, text: `${name} had ${d.noun} · ${formatMl(input.theirDrink.ml)}`, who: 'them' });
  }
  for (const d of input.myDrinks) {
    if (!(d.ml > 0)) continue;
    const w = drinkWords(d.kind);
    out.push({ at: d.at, emoji: w.emoji, text: `You had ${w.noun} · ${formatMl(d.ml)}`, who: 'me' });
  }
  if (input.theirSet && input.theirSet.reps > 0) {
    out.push({
      at: input.theirSet.at,
      emoji: '💪',
      text: `${name} trained · ${input.theirSet.reps} reps today${input.theirSet.top ? ` (${input.theirSet.top})` : ''}`,
      who: 'them',
    });
  }
  for (const s of input.mySets) {
    if (!(s.reps > 0)) continue;
    out.push({ at: s.at, emoji: '🏋️', text: `You did ${s.reps} ${s.label}`, who: 'me' });
  }
  if (input.fromThem && input.fromThem.at > 0) {
    out.push({
      at: input.fromThem.at,
      emoji: input.fromThem.emoji || '💦',
      text: input.fromThem.emoji ? `${name} sent you ${input.fromThem.emoji}` : `${name} splashed you`,
      who: 'them',
    });
  }
  // A sip together: their latest drink within minutes of one of mine.
  if (input.theirDrink && input.theirDrink.ml > 0) {
    const theirs = input.theirDrink.at;
    const close = input.myDrinks.find((d) => d.ml > 0 && Math.abs(d.at - theirs) <= TOGETHER_MS);
    if (close) out.push({ at: Math.max(theirs, close.at) + 1, emoji: '🥂', text: 'You sipped together', who: 'us' });
  }

  return out.filter((m) => Number.isFinite(m.at) && m.at > 0).sort((a, b) => b.at - a.at).slice(0, limit);
}

/** "3:42 PM", in the phone's twelve-hour style. */
export function clockTime(at: number): string {
  const d = new Date(at);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Who is winning today across the metrics both of us show. */
export function tallyScore(rows: readonly { a: number; b: number; known: boolean }[]): { mine: number; theirs: number } {
  let mine = 0;
  let theirs = 0;
  for (const r of rows) {
    if (!r.known) continue;
    if (r.b > r.a) mine += 1;
    else if (r.a > r.b) theirs += 1;
  }
  return { mine, theirs };
}

/**
 * Counted nouns, in one place.
 *
 * "1 reps" has been fixed by hand eight times on this branch —
 * `teaserLockLine`, `startingPointProof`, the per-rep depth header, the couple
 * contribution line, the history row, the notifications row, the Home exercise
 * tile — and every one shipped past a green suite. One of them was *asserted as
 * correct* by a test written alongside it.
 *
 * It recurs because the rule lives nowhere. Each author writes the ternary
 * inline for the line in front of them and misses the next one:
 * `app/couple/index.tsx` carried `{days === 1 ? 'day' : 'days'}` and a bare
 * `{reps} reps` in the *same sentence*. There are also two competing idioms in
 * the codebase — `x === 1 ? 'rep' : 'reps'` and `rep${x === 1 ? '' : 's'}` —
 * so there is no single shape to grep for or to copy correctly.
 *
 * This is the shape. It is deliberately tiny: the value of a shared helper here
 * is not that the arithmetic is hard, it is that "did anyone think about one?"
 * becomes visible at the call site instead of invisible by omission.
 *
 * Pure and dependency-free, like the rest of `domain/`.
 */

/**
 * `count` followed by the right form of `noun` — "1 rep", "2 reps".
 *
 * Regular plurals take the `s`; anything else passes its own plural:
 * `pluralise(1, 'entry', 'entries')`.
 */
export function pluralise(count: number, noun: string, plural?: string): string {
  return `${count} ${count === 1 ? noun : (plural ?? `${noun}s`)}`;
}

/**
 * Just the noun, for JSX that renders the number separately.
 *
 * `{n} {pluralNoun(n, 'rep')}` keeps the count in its own `<Text>` — which some
 * of these rows do deliberately, to style the number differently from the word.
 */
export function pluralNoun(count: number, noun: string, plural?: string): string {
  return count === 1 ? noun : (plural ?? `${noun}s`);
}

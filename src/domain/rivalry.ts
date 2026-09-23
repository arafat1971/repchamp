/**
 * The running score between two athletes.
 *
 * Every live duel already banks the other athlete's uid on the session record
 * (`liveResultSettle` resolves it from the duel's two seats), but nothing ever
 * added them up. "You lead Bea 7–4" is the single most rematch-worthy line a
 * rivalry can produce, and it was sitting in the history unsaid.
 *
 * Computed from this phone's own history, so it needs no new sync: each side
 * banks the same duels from its own seat, so the two records mirror each other.
 *
 * Pure: the screens pass the profile's sessions in.
 */

export type DuelOutcome = 'won' | 'lost' | 'drew';

export interface RivalrySession {
  mode: string;
  opponentId: string | null;
  won: boolean;
  drew?: boolean;
  /** ISO timestamp; used only to order when the input is not newest-first. */
  completedAt: string;
}

export interface Rivalry {
  wins: number;
  losses: number;
  draws: number;
  played: number;
  last: DuelOutcome | null;
  /** The current unbroken run of wins or losses, when it is at least two. */
  run: { outcome: 'won' | 'lost'; count: number } | null;
}

function outcomeOf(s: RivalrySession): DuelOutcome {
  if (s.drew) return 'drew';
  return s.won ? 'won' : 'lost';
}

/** Head-to-head against one opponent, from versus sessions only. */
export function rivalryWith(
  sessions: readonly RivalrySession[],
  opponentId: string | null | undefined,
): Rivalry {
  const empty: Rivalry = { wins: 0, losses: 0, draws: 0, played: 0, last: null, run: null };
  if (!opponentId) return empty;

  const duels = sessions
    .filter((s) => s.mode === 'versus' && s.opponentId === opponentId)
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  if (duels.length === 0) return empty;

  const outcomes = duels.map(outcomeOf);
  const count = (o: DuelOutcome) => outcomes.filter((x) => x === o).length;

  const first = outcomes[0] as DuelOutcome;
  let run: Rivalry['run'] = null;
  if (first !== 'drew') {
    let n = 0;
    while (n < outcomes.length && outcomes[n] === first) n++;
    if (n >= 2) run = { outcome: first, count: n };
  }

  return {
    wins: count('won'),
    losses: count('lost'),
    draws: count('drew'),
    played: duels.length,
    last: first,
    run,
  };
}

/** The headline, or '' before the first duel. Draws are shown, never folded in. */
export function rivalryLine(r: Rivalry, name: string): string {
  if (r.played === 0) return '';
  const score = `${Math.max(r.wins, r.losses)}–${Math.min(r.wins, r.losses)}`;
  const drawNote = r.draws ? ` (${r.draws} drawn)` : '';
  if (r.wins === r.losses) return `All square with ${name} at ${r.wins}–${r.losses}${drawNote}`;
  if (r.wins > r.losses) return `You lead ${name} ${score}${drawNote}`;
  return `${name} leads ${score}${drawNote}`;
}

/** The nudge under the score, aimed at the next race. */
export function rivalryNudge(r: Rivalry, name: string): string {
  if (r.played === 0) return `No duels yet. Be the first to put one on the board.`;
  if (r.run?.outcome === 'won') return `${r.run.count} wins in a row. ${name} wants this back.`;
  if (r.run?.outcome === 'lost') return `${name} has won ${r.run.count} straight. Time to end it.`;
  if (r.last === 'won') return `You took the last one. Make it two.`;
  if (r.last === 'lost') return `${name} took the last one. Even it up.`;
  return `The last one was a draw. Settle it.`;
}

/**
 * Live activity label — an honest "who's here right now" line for the header.
 *
 * The header pill used to read a hardcoded "26 competing now", which is a fake
 * engagement number. This replaces it with a truthful, self-describing label:
 *
 *  - While the app is seeding AI partners (a fresh community), it reads
 *    "N training partners ready" — honest, because those AI partners genuinely
 *    are available to race this instant.
 *  - Once a real community exists, it reads "N athletes active" using a real
 *    count sourced from Firestore (online friends + open matchmaking).
 *
 * Pure and framework-free so it can be unit-tested; the count itself is supplied
 * by the caller (from `useLiveActivity`, which reads the real number).
 */

export interface LiveActivity {
  /** The number to show. */
  count: number;
  /** The honest label, e.g. "training partners ready" or "athletes active". */
  label: string;
  /** Whether this reflects AI partners (seeding) vs real athletes. */
  seeded: boolean;
}

/**
 * Build the honest activity label.
 *
 * @param realActive  Count of real athletes recently active (0 when unknown).
 * @param aiReady     Count of AI training partners available to race.
 * @param seeding     Whether AI-partner seeding is active (few real users).
 */
export function liveActivity(realActive: number, aiReady: number, seeding: boolean): LiveActivity {
  // Real community: report real athletes, honestly.
  if (!seeding || realActive >= aiReady) {
    return {
      count: Math.max(0, realActive),
      label: realActive === 1 ? 'athlete active' : 'athletes active',
      seeded: false,
    };
  }
  // Fresh community: the AI partners genuinely are ready to race right now.
  // Labelled honestly — never dressed up as live humans "competing now".
  return {
    count: aiReady,
    label: aiReady === 1 ? 'training partner ready' : 'training partners ready',
    seeded: true,
  };
}

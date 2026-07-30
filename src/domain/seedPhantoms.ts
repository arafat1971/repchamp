/**
 * AI-partner seeding — the honest cold-start gate.
 *
 * When RepChamp has only a few real users the arena feels empty. This module
 * decides when to surface the roster of **AI training partners** (defined in
 * `phantomRoster.ts`) so a newcomer always has someone to race — and when to
 * step them aside as a real community grows.
 *
 * **Design rules (honesty first):**
 * - The partners are AI, and every surface labels them so (`isAI: true`, "AI"
 *   badge). We never present them as real humans, and never use real people's
 *   photos — avatars are app-owned emoji art. This keeps us inside App Store
 *   3.2.2 / Google Play fake-engagement policy and out of likeness-law trouble.
 * - AI partners are NEVER written to Firebase. They exist only in-memory.
 * - Once 5+ real users publish weekly leaderboard scores, `shouldSeed()` returns
 *   false and the AI partners step aside so the real community leads.
 * - Racing an AI partner routes to the existing bot-paced opponent engine — the
 *   same honest pacer used everywhere else.
 *
 * The pure roster, types, sample challenges, and the partner → Opponent bridge
 * all live in `phantomRoster.ts` (framework-free, so pure-domain code can require
 * it without dragging in a native module). This module owns only the
 * Firebase-backed gate and the React hook, and re-exports the roster so existing
 * callers keep a single import site.
 */

import { useEffect, useState } from 'react';

import { isFirebaseConfigured } from '@/lib/firebase';
import {
  PHANTOM_CHALLENGES,
  PHANTOM_USERS,
  type PhantomChallenge,
  type PhantomUser,
} from '@/domain/phantomRoster';

// Re-export the roster surface so existing import sites (which import from
// `seedPhantoms`) keep working against the single source of truth.
export {
  PHANTOM_CHALLENGES,
  PHANTOM_USERS,
  getPhantomOpponent,
  phantomToOpponent,
  type PhantomChallenge,
  type PhantomUser,
} from '@/domain/phantomRoster';

// ---------------------------------------------------------------------------
//  Seeding gate — should we still show AI partners?
// ---------------------------------------------------------------------------

let _seedCacheResult: boolean | null = null;
let _seedCacheTime = 0;
const SEED_CACHE_TTL = 60_000; // 60 seconds

/**
 * Whether AI-partner seeding should be active.
 *
 * Pre-provisioning (no Firebase) we always seed so the app is never empty in
 * development. Once Firebase is live we read the real user count and seed only
 * while fewer than 5 real users exist. Cached for 60s to avoid repeated reads.
 */
export async function shouldSeed(): Promise<boolean> {
  const now = Date.now();
  if (_seedCacheResult !== null && now - _seedCacheTime < SEED_CACHE_TTL) {
    return _seedCacheResult;
  }

  // Pre-provisioning: always seed so the app isn't empty during development.
  if (!isFirebaseConfigured()) {
    _seedCacheResult = true;
    _seedCacheTime = now;
    return true;
  }

  try {
    // Count live weekly leaderboard rows as the community size proxy — no Cloud
    // Function / metadata doc required. Once 5+ real athletes publish scores,
    // AI partners step aside.
    const firestore = (await import('@react-native-firebase/firestore')).default;
    const { currentWeekKey } = await import('@/services/userService');
    const snap = await firestore()
      .collection('leaderboard')
      .where('weekKey', '==', currentWeekKey())
      .limit(5)
      .get();
    _seedCacheResult = snap.size < 5;
    _seedCacheTime = now;
    return _seedCacheResult;
  } catch {
    // On any error, keep seeding so a permissions hiccup never empties the app.
    _seedCacheResult = true;
    _seedCacheTime = now;
    return true;
  }
}

// ---------------------------------------------------------------------------
//  React hook — the single integration point for screens
// ---------------------------------------------------------------------------

export interface PhantomSeedData {
  /** True when AI-partner data should be shown. */
  isSeeding: boolean;
  /** AI partners to display in the Friends tab. */
  phantomFriends: readonly PhantomUser[];
  /** AI partners available to race right now, for the "ready" row/count. */
  phantomOnline: readonly PhantomUser[];
  /** Sample AI-vs-AI exhibition challenges for the Home tab. */
  phantomChallenges: readonly PhantomChallenge[];
  /** AI partners for the Arena leaderboard while the community is small. */
  phantomLeaderboard: readonly PhantomUser[];
}

/**
 * Returns AI-partner seed data when the app needs it; empty arrays otherwise
 * (zero-cost once a real community exists).
 */
export function usePhantomSeed(): PhantomSeedData {
  const [isSeeding, setIsSeeding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void shouldSeed().then((result) => {
      if (!cancelled) setIsSeeding(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isSeeding) {
    return {
      isSeeding: false,
      phantomFriends: [],
      phantomOnline: [],
      phantomChallenges: [],
      phantomLeaderboard: [],
    };
  }

  return {
    isSeeding: true,
    phantomFriends: PHANTOM_USERS,
    phantomOnline: PHANTOM_USERS.filter((u) => u.online),
    phantomChallenges: PHANTOM_CHALLENGES,
    phantomLeaderboard: PHANTOM_USERS.slice(0, 8),
  };
}

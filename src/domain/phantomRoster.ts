/**
 * AI training partners — the honest cold-start roster.
 *
 * A brand-new competitive app with only a handful of real users feels empty, and
 * an empty competitive app churns hard. The industry-standard *honest* fix
 * (Peloton ghost riders, Zwift pace bots, Strava segment ghosts) is to give
 * newcomers clearly-labelled AI opponents to race — never fake humans.
 *
 * That is what this module provides: a roster of **AI training partners** with
 * app-owned illustrated avatars (emoji + brand tints — no real people's photos),
 * coach/bot-persona names, and honest pacing. Every entry is `isAI: true`, and
 * the UI renders an "AI" badge so a user always knows they're racing the app, not
 * a stranger. When enough real users exist the roster steps aside (see
 * `seedPhantoms.shouldSeed`).
 *
 * Why AI partners and NOT fake human profiles:
 *  - Depicting fake "users" with real faces (randomuser.me / stock portraits)
 *    violates App Store guideline 3.2.2 and Google Play's fake-engagement policy,
 *    and breaches right-of-publicity/likeness law — apps get pulled and developer
 *    accounts terminated for exactly this. Racing a *labelled* AI is a legitimate,
 *    expected game feature.
 *  - A fake "human" that never truly responds shatters trust the instant a user
 *    notices (an unanswered duel, a streak that only ever breaks on one side). An
 *    AI pacer that is honestly an AI is fun, like any video-game bot.
 *
 * This file is pure and framework-free (no React, no Firebase) so pure-domain
 * code such as `opponent.ts` can require it without dragging a native module into
 * a unit test. The Firebase-backed "should we still show AI partners?" gate and
 * the React hook live in `seedPhantoms.ts`, which re-exports everything here.
 */

import type { Opponent } from '@/domain/opponent';

// ---------------------------------------------------------------------------
//  AI training-partner roster
// ---------------------------------------------------------------------------

/**
 * An AI training partner. (Named `PhantomUser` only so existing import sites keep
 * working; every instance is `isAI: true` and shown with an AI badge.)
 */
export interface PhantomUser {
  id: string;
  /** A coach/bot persona name — never a fabricated real person. */
  name: string;
  initial: string;
  /** Emoji avatar (app-owned art). Never real-person photography. */
  emoji: string;
  /** Always true — these are AI, and the UI labels them so. */
  isAI: boolean;
  /** Honest one-line descriptor, e.g. "AI · Steady pace". */
  tagline: string;
  level: number;
  xp: number;
  /**
   * "Available to challenge." An AI partner is always ready, so this is honestly
   * true — it means "ready to race", not "a human is online right now".
   */
  online: boolean;
  /** Sustained pace for bot-paced duels, reps per minute. */
  repsPerMinute: number;
  /** Avatar tint. */
  tintBg: string;
  tintColor: string;
}

/**
 * The AI partner roster — a spread of difficulty tiers so a newcomer always has
 * someone to race at their level, and a ladder to climb. All are clearly AI
 * personas with app-owned emoji avatars; no external photos, no fake humans.
 */
export const PHANTOM_USERS: readonly PhantomUser[] = [
  {
    id: 'ai_spark',
    name: 'Coach Spark',
    initial: 'S',
    emoji: '⚡',
    isAI: true,
    tagline: 'AI · Warm-up pace',
    level: 2,
    xp: 120,
    online: true,
    repsPerMinute: 44,
    tintBg: '#fef3c7',
    tintColor: '#b45309',
  },
  {
    id: 'ai_pulse',
    name: 'Pulse Bot',
    initial: 'P',
    emoji: '🫀',
    isAI: true,
    tagline: 'AI · Steady pace',
    level: 3,
    xp: 240,
    online: true,
    repsPerMinute: 52,
    tintBg: '#dbeafe',
    tintColor: '#1e40af',
  },
  {
    id: 'ai_nova',
    name: 'Nova',
    initial: 'N',
    emoji: '🌟',
    isAI: true,
    tagline: 'AI · Balanced pace',
    level: 5,
    xp: 420,
    online: true,
    repsPerMinute: 60,
    tintBg: '#ede9fe',
    tintColor: '#5b21b6',
  },
  {
    id: 'ai_titan',
    name: 'Titan',
    initial: 'T',
    emoji: '🛡️',
    isAI: true,
    tagline: 'AI · Strong pace',
    level: 7,
    xp: 610,
    online: true,
    repsPerMinute: 70,
    tintBg: '#dcfce7',
    tintColor: '#15803d',
  },
  {
    id: 'ai_blaze',
    name: 'Blaze',
    initial: 'B',
    emoji: '🔥',
    isAI: true,
    tagline: 'AI · Fast pace',
    level: 9,
    xp: 820,
    online: true,
    repsPerMinute: 80,
    tintBg: '#ffe4e6',
    tintColor: '#be123c',
  },
  {
    id: 'ai_apex',
    name: 'Apex',
    initial: 'A',
    emoji: '👑',
    isAI: true,
    tagline: 'AI · Elite pace',
    level: 12,
    xp: 1180,
    online: true,
    repsPerMinute: 92,
    tintBg: '#e0f2fe',
    tintColor: '#0369a1',
  },
];

// ---------------------------------------------------------------------------
//  Sample AI-vs-AI exhibition matches — a hook for an empty arena
// ---------------------------------------------------------------------------

export interface PhantomChallenge {
  id: string;
  exercise: string;
  title: string;
  /** Always true — rendered with an "AI" tag so it's never mistaken for a live human match. */
  isAI: boolean;
  player1: PhantomUser;
  player2: PhantomUser;
  score1: number;
  score2: number;
  /** Progress fraction for the bar (0-1). */
  progress: number;
  timeLeft: string;
}

/**
 * Exhibition AI-vs-AI matches — a "watch, then race one yourself" hook for an
 * arena with no real duels yet. Labelled AI so no user thinks two strangers are
 * live.
 */
export const PHANTOM_CHALLENGES: readonly PhantomChallenge[] = [
  {
    id: 'pc_1',
    exercise: 'push',
    title: 'Push-Up Challenge',
    isAI: true,
    player1: PHANTOM_USERS[2]!, // Nova
    player2: PHANTOM_USERS[3]!, // Titan
    score1: 32,
    score2: 28,
    progress: 0.53,
    timeLeft: '12:45',
  },
  {
    id: 'pc_2',
    exercise: 'squat',
    title: 'Squat Battle',
    isAI: true,
    player1: PHANTOM_USERS[1]!, // Pulse Bot
    player2: PHANTOM_USERS[4]!, // Blaze
    score1: 18,
    score2: 22,
    progress: 0.45,
    timeLeft: '8:30',
  },
];

// ---------------------------------------------------------------------------
//  AI partner → Opponent bridge for bot-paced duels
// ---------------------------------------------------------------------------

/**
 * Convert an AI partner into an Opponent so the existing `OpponentPacer` drives
 * the duel exactly as it does for any bot-paced match.
 */
export function phantomToOpponent(phantom: PhantomUser): Opponent {
  return {
    id: phantom.id,
    name: phantom.name,
    initial: phantom.initial,
    color: phantom.tintColor,
    borderColor: phantom.tintBg,
    repColor: phantom.tintBg,
    level: phantom.level,
    online: phantom.online,
    repsPerMinute: phantom.repsPerMinute,
  };
}

/**
 * Resolve an AI partner by id. Returns undefined when the id isn't one of ours,
 * so the caller falls through to the built-in opponents / real players.
 */
export function getPhantomOpponent(id: string): Opponent | undefined {
  const phantom = PHANTOM_USERS.find((u) => u.id === id);
  return phantom ? phantomToOpponent(phantom) : undefined;
}

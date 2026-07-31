/**
 * The couple bond — two athletes who train together, on their own phones.
 *
 * Framework-free and synchronous on purpose, exactly like `duel.ts`: this module
 * owns the document shape, the pair code, the shared-streak rule and the
 * in-sync/milestone maths, while `services/coupleService.ts` is the thin
 * Firestore wire on top. That split is what lets the rules that actually matter
 * for retention be proven in `couple.test.ts` without a network or a device.
 *
 * The defining rule: **a couple streak only advances on days BOTH partners
 * trained.** That is the whole hook — neither partner wants to be the one who
 * breaks it — and it is why couple mode cannot be used alone.
 */

import { calculateStreak } from './progression';

/** One half of a couple. */
export interface CoupleMember {
  uid: string;
  displayName: string;
  avatarUrl: string | null;
  /** ISO `YYYY-MM-DD` days this member trained, used for the shared streak. */
  trainedDays: string[];
  /** All-time reps this member has contributed to the couple. */
  totalReps: number;
  /**
   * Optional Expo push token — written only by this member onto the couple doc
   * so the partner can nudge without reading a world-readable profile field.
   */
  expoPushToken?: string | null;
  /**
   * Recent outbox credit ids applied to this member — prevents double
   * `totalReps` when a flush crashes between write and local "done".
   */
  creditedIds?: string[];
}

export interface Couple {
  /** Doc id — also the human-typed pair code. */
  id: string;
  /** Both member uids, denormalised so Firestore rules can check membership. */
  memberUids: string[];
  members: CoupleMember[];
  /** Set while the invite is open and nobody has taken the second seat. */
  pending: boolean;
  /**
   * The most recent poke from one partner to the other. `at` is a Firestore
   * timestamp, kept structurally typed so this module stays free of any Firebase
   * import — the whole point of the domain/service split.
   */
  nudge?: {
    fromUid: string;
    at?: { toMillis?: () => number } | null;
  } | null;
}

/**
 * Millisecond stamp of a nudge, or null when it is absent or still resolving.
 *
 * A freshly written nudge briefly carries an unresolved server timestamp, which
 * is exactly when we must *not* treat it as new — hence the guarded read rather
 * than trusting the field's presence.
 */
export function nudgeAt(couple: Couple | null): number | null {
  const at = couple?.nudge?.at;
  if (!at || typeof at.toMillis !== 'function') return null;
  const millis = at.toMillis();
  return Number.isFinite(millis) ? millis : null;
}

/* ------------------------------------------------------------------ *
 * Pair code
 * ------------------------------------------------------------------ */

/**
 * Unambiguous alphabet — no I/O/0/1, which are the characters people misread
 * when copying a code off someone else's screen.
 */
export const PAIR_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PAIR_CODE_LENGTH = 6;

/** A fresh pair code. `random` is injectable so tests are deterministic. */
export function makePairCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < PAIR_CODE_LENGTH; i++) {
    const index = Math.floor(random() * PAIR_CODE_ALPHABET.length) % PAIR_CODE_ALPHABET.length;
    code += PAIR_CODE_ALPHABET[index];
  }
  return code;
}

/**
 * Canonicalise a code a human typed or pasted: upper-cased, with the spaces and
 * dashes people add for readability stripped. Returns '' when nothing usable is
 * left, so callers can treat empty as "not a code".
 */
export function normalizePairCode(input: string): string {
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return cleaned.length === PAIR_CODE_LENGTH ? cleaned : '';
}

/**
 * Pull a pair code from typed input, a share URL, or pasted invite text.
 * Prefer this at redeem boundaries so "paste what I got" works.
 */
export function extractPairCode(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const fromUrl = parseInviteCode(trimmed);
  if (fromUrl) return fromUrl;
  const direct = normalizePairCode(trimmed);
  if (direct) return direct;
  // Share blurb: "… join with ABC234" / trailing token in a longer paste.
  const tokens = trimmed.toUpperCase().match(/[A-Z0-9]{6}/g) ?? [];
  for (const token of tokens) {
    const code = normalizePairCode(token);
    if (code) return code;
  }
  return '';
}

/* ------------------------------------------------------------------ *
 * Invite links
 * ------------------------------------------------------------------ */

/**
 * The web host for couple invites. Must match Firebase Hosting (`WEB_BASE` in
 * `src/lib/urls.ts`). Shared text uses this HTTPS URL so it is tappable in any
 * messenger; the hosted page redirects into the app via the `repchamp://`
 * scheme (or the Play Store if the app isn't installed).
 */
export const INVITE_WEB_BASE = 'https://repchamp.web.app';

/**
 * Build the shareable invite link for a pair code.
 *
 * A web URL rather than a bare `repchamp://` scheme so it's tappable in any
 * messenger and still means something if the recipient hasn't installed the app
 * yet (it can land on a "get RepChamp" page). The app maps the same path to its
 * pairing flow.
 */
export function inviteLink(code: string): string {
  return `${INVITE_WEB_BASE}/couple/join?code=${encodeURIComponent(code)}`;
}

/**
 * The app's own URL scheme — must match `expo.scheme` in `app.json`.
 */
export const APP_SCHEME = 'repchamp';

/**
 * The deep link that opens the *installed* app straight into pairing.
 *
 * This is what the on-screen QR should encode. A native phone camera (iOS
 * Camera, Google Lens, Android) scanning a custom-scheme URL offers to open the
 * app directly — no configured associated domain required — whereas the web
 * `inviteLink` lands on a hosted redirect page that tries the deep link and
 * falls back to the Play Store. The web link stays the right choice for
 * *shared text* (it means something to someone without the app yet), so the
 * two links serve two different surfaces on purpose.
 */
export function inviteDeepLink(code: string): string {
  return `${APP_SCHEME}://couple/join?code=${encodeURIComponent(code)}`;
}

/**
 * Pull a pair code out of an invite URL (or return null if there isn't one).
 *
 * Tolerant of both the web link and the `repchamp://couple/join?code=...` scheme,
 * and normalises whatever it finds — so a lightly-mangled link still pairs.
 */
export function parseInviteCode(url: string): string | null {
  const match = /[?&]code=([^&#]+)/.exec(url);
  if (!match) return null;
  const code = normalizePairCode(decodeURIComponent(match[1] as string));
  return code || null;
}

/* ------------------------------------------------------------------ *
 * Membership
 * ------------------------------------------------------------------ */

export function memberOf(couple: Couple, uid: string): CoupleMember | null {
  return couple.members.find((m) => m.uid === uid) ?? null;
}

/** The *other* person. Null while the couple is still waiting for a partner. */
export function partnerOf(couple: Couple, uid: string): CoupleMember | null {
  return couple.members.find((m) => m.uid !== uid) ?? null;
}

export function isPaired(couple: Couple | null): boolean {
  return couple != null && couple.members.length === 2 && !couple.pending;
}

/* ------------------------------------------------------------------ *
 * Totals, streak, milestones
 * ------------------------------------------------------------------ */

/** Every rep the two of them have logged together, all time. */
export function combinedReps(couple: Couple): number {
  return couple.members.reduce((total, m) => total + m.totalReps, 0);
}

/**
 * The shared streak: days on which **both** partners trained.
 *
 * Implemented as the solo streak over the *intersection* of the two day sets,
 * so it inherits the app's existing promise that a single rest day does not
 * break a streak (see `calculateStreak`) — the couple is held to the same
 * standard as an individual, just with two people on the hook for each day.
 */
export function calculateCoupleStreak(couple: Couple, today: string): number {
  if (couple.members.length < 2) return 0;

  const [first, second] = couple.members as [CoupleMember, CoupleMember];
  const secondDays = new Set(second.trainedDays);
  const bothTrained = first.trainedDays.filter((day) => secondDays.has(day));

  return calculateStreak(bothTrained, today);
}

/** True when the shared streak dies unless someone trains today. */
export function streakAtRisk(couple: Couple, today: string): boolean {
  if (!isPaired(couple)) return false;
  const bothToday = couple.members.every((m) => m.trainedDays.includes(today));
  return !bothToday && calculateCoupleStreak(couple, today) > 0;
}

/**
 * Whichever partner has not logged today yet — the one a nudge should go to.
 * Null when both are done (nothing to nudge about).
 */
export function memberBehindToday(couple: Couple, today: string): CoupleMember | null {
  return couple.members.find((m) => !m.trainedDays.includes(today)) ?? null;
}

/* ------------------------------------------------------------------ *
 * Home bond presentation — smart, hooked copy for the Couple strip
 * ------------------------------------------------------------------ */

/** Visual / urgency tone for the home Couple Bond strip. */
export type CoupleBondTone = 'fresh' | 'nudge' | 'waiting' | 'locked' | 'risk' | 'steady';

/**
 * Glanceable status for a paired couple on Home.
 *
 * One job: turn the shared streak rule into a clear hook — empty bonds invite
 * the first set, half-days nudge the missing partner, at-risk streaks warn
 * without drama, and locked days congratulate without noise.
 */
export interface CoupleBondPresentation {
  /** Small label above the status line (tier or mode name). */
  eyebrow: string;
  /** The hook — one short line the athlete should act on (or feel). */
  headline: string;
  /** Soft CTA under the week row; null when no action is needed. */
  cta: string | null;
  tone: CoupleBondTone;
  /**
   * What tapping the strip should do.
   * - `train` — start / open a together set
   * - `nudge` — open bond controls to poke the partner
   * - `open` — open the couple detail (default / celebrate)
   */
  action: 'train' | 'nudge' | 'open';
  /** e.g. "58 / 100 reps" toward the next milestone. */
  milestoneLabel: string | null;
  /** 0..1 progress toward the next combined-rep milestone. */
  milestoneProgress: number;
}

/**
 * Derive the Couple Bond strip's copy from live pair state.
 *
 * Pure so Home and tests share one source of truth. `viewerUid` decides whose
 * "your move" vs "waiting on them" framing to use.
 */
export function coupleBondPresentation(input: {
  me: CoupleMember | null;
  partner: CoupleMember | null;
  streak: number;
  combined: number;
  atRisk: boolean;
  today: string;
  levelName: string;
}): CoupleBondPresentation {
  const partnerName = (input.partner?.displayName ?? 'Partner').trim() || 'Partner';
  const firstName = partnerName.split(/\s+/)[0] ?? partnerName;
  const iTrained = !!input.me?.trainedDays.includes(input.today);
  const theyTrained = !!input.partner?.trainedDays.includes(input.today);
  const milestone = nextMilestone(input.combined);
  const prev =
    milestone == null
      ? COMBINED_MILESTONES[COMBINED_MILESTONES.length - 1]!
      : (COMBINED_MILESTONES.filter((m) => m < milestone).pop() ?? 0);
  const milestoneProgress =
    milestone == null
      ? 1
      : Math.min(1, Math.max(0, (input.combined - prev) / (milestone - prev)));
  const milestoneLabel =
    milestone == null
      ? null
      : `${input.combined.toLocaleString()} / ${milestone.toLocaleString()} reps`;

  // Brand-new bond — zeros should invite, not look broken.
  if (input.combined === 0 && input.streak === 0) {
    return {
      eyebrow: input.levelName,
      headline: 'First shared set locks your bond',
      cta: 'Train together',
      tone: 'fresh',
      action: 'train',
      milestoneLabel,
      milestoneProgress: 0,
    };
  }

  if (input.atRisk && input.streak > 0) {
    if (iTrained && !theyTrained) {
      return {
        eyebrow: 'Streak at risk',
        headline: `${firstName} still needs a set — ${input.streak}-day streak ends tonight`,
        cta: `Nudge ${firstName}`,
        tone: 'risk',
        action: 'nudge',
        milestoneLabel,
        milestoneProgress,
      };
    }
    if (!iTrained && theyTrained) {
      return {
        eyebrow: 'Streak at risk',
        headline: `${firstName} trained — your set protects the streak`,
        cta: 'Train now',
        tone: 'risk',
        action: 'train',
        milestoneLabel,
        milestoneProgress,
      };
    }
    return {
      eyebrow: 'Streak at risk',
      headline: `${input.streak}-day streak needs both of you today`,
      cta: 'Train together',
      tone: 'risk',
      action: 'train',
      milestoneLabel,
      milestoneProgress,
    };
  }

  if (iTrained && theyTrained) {
    return {
      eyebrow: input.levelName,
      headline:
        input.streak > 0
          ? `Day locked · ${input.streak}-day shared streak`
          : 'Both trained today — bond on',
      cta: null,
      tone: 'locked',
      action: 'open',
      milestoneLabel,
      milestoneProgress,
    };
  }

  if (iTrained && !theyTrained) {
    return {
      eyebrow: input.levelName,
      headline: `Waiting on ${firstName} to lock today`,
      cta: `Nudge ${firstName}`,
      tone: 'waiting',
      action: 'nudge',
      milestoneLabel,
      milestoneProgress,
    };
  }

  if (!iTrained && theyTrained) {
    return {
      eyebrow: input.levelName,
      headline: `${firstName} already trained — your move`,
      cta: 'Train now',
      tone: 'nudge',
      action: 'train',
      milestoneLabel,
      milestoneProgress,
    };
  }

  // Neither trained today, streak safe (or zero).
  if (input.streak > 0) {
    return {
      eyebrow: input.levelName,
      headline: `${input.streak}-day shared streak · keep it alive`,
      cta: 'Train together',
      tone: 'steady',
      action: 'train',
      milestoneLabel,
      milestoneProgress,
    };
  }

  return {
    eyebrow: input.levelName,
    headline: milestone
      ? `${milestone - input.combined} reps to your next milestone`
      : 'Show up together — streak starts today',
    cta: 'Train together',
    tone: 'steady',
    action: 'train',
    milestoneLabel,
    milestoneProgress,
  };
}

/**
 * Combined-rep milestones. These are the shareable moments ("we've done 1,000
 * push-ups together"), so they are spaced to stay reachable rather than
 * doubling away into the distance.
 */
export const COMBINED_MILESTONES = [100, 250, 500, 1_000, 2_500, 5_000, 10_000] as const;

/** The next milestone above `total`, or null once they've passed them all. */
export function nextMilestone(total: number): number | null {
  return COMBINED_MILESTONES.find((m) => m > total) ?? null;
}

/** The highest milestone `total` has reached, or null before the first one. */
export function lastMilestoneReached(total: number): number | null {
  let reached: number | null = null;
  for (const m of COMBINED_MILESTONES) {
    if (total >= m) reached = m;
  }
  return reached;
}

/* ------------------------------------------------------------------ *
 * Couple levels
 *
 * A shared level the couple climbs together — the sense of "we're building
 * something" that a solo XP bar can't give. Level is earned from combined reps
 * (the work) plus a bonus per streak day (the consistency), so a couple that
 * shows up every day out-levels one that binges once. Kept a pure calculation so
 * the thresholds are testable and easy to retune.
 * ------------------------------------------------------------------ */

/** Named tiers, each with the minimum couple-points to reach it. */
export const COUPLE_TIERS = [
  { level: 1, name: 'New Duo', min: 0 },
  { level: 2, name: 'Training Partners', min: 250 },
  { level: 3, name: 'In Step', min: 750 },
  { level: 4, name: 'Power Couple', min: 2_000 },
  { level: 5, name: 'Unstoppable', min: 5_000 },
  { level: 6, name: 'Legends', min: 12_000 },
] as const;

/** Each streak day is worth this many points on top of the raw reps. */
const STREAK_POINT_BONUS = 50;

/** Combined-effort points: every rep, plus a bonus for each shared streak day. */
export function couplePoints(combined: number, streak: number): number {
  return combined + streak * STREAK_POINT_BONUS;
}

export interface CoupleLevel {
  level: number;
  name: string;
  points: number;
  /** Points at the start of the current tier. */
  tierMin: number;
  /** Points needed to reach the next tier, or null at the top. */
  nextAt: number | null;
  /** 0..1 progress through the current tier (1 at the top tier). */
  progress: number;
}

/** Resolve combined reps + streak into the couple's live level and progress. */
export function coupleLevel(combined: number, streak: number): CoupleLevel {
  const points = couplePoints(combined, streak);

  // Typed as the tier element (not the first tier's narrow literal) so it can be
  // reassigned as we walk up the ladder.
  let tier: (typeof COUPLE_TIERS)[number] = COUPLE_TIERS[0];
  for (const t of COUPLE_TIERS) {
    if (points >= t.min) tier = t;
  }
  const next = COUPLE_TIERS.find((t) => t.min > tier.min) ?? null;
  const span = next ? next.min - tier.min : 0;
  const progress = next ? Math.min(1, (points - tier.min) / span) : 1;

  return {
    level: tier.level,
    name: tier.name,
    points,
    tierMin: tier.min,
    nextAt: next?.min ?? null,
    progress,
  };
}

/* ------------------------------------------------------------------ *
 * Badges — one-off shared achievements the couple unlocks.
 * ------------------------------------------------------------------ */

export interface CoupleBadge {
  id: string;
  emoji: string;
  title: string;
  /** One-line description of how it's earned. */
  detail: string;
  earned: boolean;
}

/**
 * The couple's badge shelf, each marked earned or not from the current state.
 *
 * Pure derivation — no persisted "unlocked" flags — so a badge can never get out
 * of sync with reality, and the rules stay in one testable place.
 */
export function coupleBadges(combined: number, streak: number): CoupleBadge[] {
  return [
    {
      id: 'first-together',
      emoji: '🤝',
      title: 'First Steps',
      detail: 'Logged your first reps together',
      earned: combined > 0,
    },
    {
      id: 'week-streak',
      emoji: '🔥',
      title: 'One Week Strong',
      detail: 'A 7-day shared streak',
      earned: streak >= 7,
    },
    {
      id: 'month-streak',
      emoji: '📅',
      title: 'Monthly Duo',
      detail: 'A 30-day shared streak',
      earned: streak >= 30,
    },
    {
      id: 'thousand',
      emoji: '💪',
      title: 'Thousand Club',
      detail: '1,000 reps together',
      earned: combined >= 1_000,
    },
    {
      id: 'five-thousand',
      emoji: '🏆',
      title: 'Five Thousand',
      detail: '5,000 reps together',
      earned: combined >= 5_000,
    },
    {
      id: 'power-couple',
      emoji: '⚡',
      title: 'Power Couple',
      detail: 'Reached couple level 4',
      earned: coupleLevel(combined, streak).level >= 4,
    },
  ];
}

/* ------------------------------------------------------------------ *
 * Live "in sync"
 * ------------------------------------------------------------------ */

/**
 * How recently both partners must have completed a rep to count as in sync.
 *
 * Long enough to survive the pause at the top of a push-up, short enough that
 * it stops glowing when one of them actually stops.
 */
export const IN_SYNC_WINDOW_MS = 3_000;

/**
 * True while both partners are actively repping — the signal the together HUD
 * glows on. Either side never having repped is not "in sync".
 */
export function isInSync(
  now: number,
  myLastRepAt: number | null,
  partnerLastRepAt: number | null,
): boolean {
  if (myLastRepAt === null || partnerLastRepAt === null) return false;
  return now - myLastRepAt <= IN_SYNC_WINDOW_MS && now - partnerLastRepAt <= IN_SYNC_WINDOW_MS;
}

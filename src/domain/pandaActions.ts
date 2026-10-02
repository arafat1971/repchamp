/**
 * What the two pandas can do to each other, live.
 *
 * Each gesture plays on both phones: the sender's panda gives it, the
 * partner's panda receives it — in the app (over the couple document's live
 * poke slot) and on the home-screen widget (over a silent push). The poke
 * slot is shared with the emoji pokes, so a gesture travels as a short code
 * ("p:hg") that older builds simply don't recognise and ignore.
 */

export const PANDA_ACTIONS = ['tickle', 'boop', 'hug', 'highfive', 'cheers'] as const;
export type PandaAction = (typeof PANDA_ACTIONS)[number];

interface ActionMeta {
  emoji: string;
  label: string;
  /** The burst between the two pandas. */
  burst: string;
  /** Short code in the live poke slot (rules cap it at 8 characters). */
  code: string;
  /** Shown to the sender. */
  sent: (name: string) => string;
  /** Shown to the receiver. */
  got: (name: string) => string;
}

export const ACTION_META: Record<PandaAction, ActionMeta> = {
  tickle: {
    emoji: '🤭',
    label: 'Tickle',
    burst: '🤭',
    code: 'p:tk',
    sent: (n) => `You tickled ${n}`,
    got: (n) => `${n} tickled you`,
  },
  boop: {
    emoji: '👉',
    label: 'Boop',
    burst: '💫',
    code: 'p:bp',
    sent: (n) => `Boop! on ${n}'s nose`,
    got: (n) => `${n} booped your nose`,
  },
  hug: {
    emoji: '🤗',
    label: 'Hug',
    burst: '💞',
    code: 'p:hg',
    sent: (n) => `You hugged ${n}`,
    got: (n) => `${n} sent you a hug`,
  },
  highfive: {
    emoji: '✋',
    label: 'High five',
    burst: '✨',
    code: 'p:hf',
    sent: (n) => `High five, ${n}!`,
    got: (n) => `${n} high-fived you`,
  },
  cheers: {
    emoji: '🥂',
    label: 'Cheers',
    burst: '💦',
    code: 'p:ch',
    sent: (n) => `Cheers with ${n} — drink up!`,
    got: (n) => `${n} says cheers — take a sip!`,
  },
};

export const PANDA_POKE_PREFIX = 'p:';

/** The live-poke code for a gesture. */
export function actionCode(action: PandaAction): string {
  return ACTION_META[action].code;
}

/** A gesture from a live-poke code, or null for anything else. */
export function actionFromCode(code: unknown): PandaAction | null {
  if (typeof code !== 'string' || !code.startsWith(PANDA_POKE_PREFIX)) return null;
  return PANDA_ACTIONS.find((a) => ACTION_META[a].code === code) ?? null;
}

/** A gesture from a push or a stored name, or null. */
export function parseAction(raw: unknown): PandaAction | null {
  return typeof raw === 'string' && (PANDA_ACTIONS as readonly string[]).includes(raw) ? (raw as PandaAction) : null;
}

/** A gesture poke `{ e, at }` cleaned for the live slot, or null. */
export function cleanActionPoke(raw: unknown): { e: string; at: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const { e, at } = raw as { e?: unknown; at?: unknown };
  if (!actionFromCode(e)) return null;
  if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0) return null;
  return { e: e as string, at };
}

/** Both drank within this of each other, recently: time to clink. */
export const CHEERS_WINDOW_MS = 15 * 60_000;
/** Behind pace by at least this, a hug says "you've got this". */
export const HUG_BEHIND_ML = 300;

/**
 * The gesture that fits the moment, for the suggested chip:
 * - they just hit their goal → a high five;
 * - you both drank in the last quarter hour → cheers;
 * - they're falling behind → a hug;
 * - otherwise → a tickle, the playful default.
 */
export function smartAction({
  now,
  myLastSipAt,
  theirLastSipAt,
  theyMet,
  theirBehindMl,
}: {
  now: number;
  myLastSipAt: number | null;
  theirLastSipAt: number | null;
  theyMet: boolean;
  theirBehindMl: number;
}): PandaAction {
  if (theyMet) return 'highfive';
  const recent = (at: number | null) => at != null && at > 0 && now - at >= 0 && now - at <= CHEERS_WINDOW_MS;
  if (recent(myLastSipAt) && recent(theirLastSipAt)) return 'cheers';
  if (theirBehindMl >= HUG_BEHIND_ML) return 'hug';
  return 'tickle';
}

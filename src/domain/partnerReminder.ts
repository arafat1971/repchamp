/**
 * What a partner can remind the other to do.
 *
 * The couple nudge used to say one thing — "<name> is training" — which is a
 * poke to train and nothing else. Partners look after each other in more
 * ways than that: drink some water, get out for a walk, stretch. Each kind
 * rides the same nudge (the couple doc's `nudge` field plus an Expo push),
 * so there is one delivery path, one rate limit and one foreground de-dup.
 *
 * Pure: copy and parsing only. A nudge written by an older app has no `kind`
 * and still reads as "train", its original meaning.
 */

export const REMINDER_KINDS = ['water', 'walk', 'run', 'stretch', 'train'] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

interface ReminderDef {
  emoji: string;
  /** Button label on the sender's side. */
  label: string;
  /** Notification title after the sender's name. */
  title: (name: string) => string;
  body: string;
}

const DEFS: Record<ReminderKind, ReminderDef> = {
  water: {
    emoji: '💧',
    label: 'Water',
    title: (n) => `${n} says: drink some water 💧`,
    body: 'A glass now keeps you on track for today’s goal.',
  },
  walk: {
    emoji: '🚶',
    label: 'Walk',
    title: (n) => `${n} says: time for a walk 🚶`,
    body: 'Ten minutes on your feet — your steps will thank you.',
  },
  run: {
    emoji: '🏃',
    label: 'Run',
    title: (n) => `${n} says: let’s go for a run 🏃`,
    body: 'Lace up — even a short one counts.',
  },
  stretch: {
    emoji: '🧘',
    label: 'Stretch',
    title: (n) => `${n} says: take a stretch break 🧘`,
    body: 'Two minutes to loosen up. Your body will feel it.',
  },
  train: {
    emoji: '💪',
    label: 'Train',
    title: (n) => `${n} is training`,
    body: 'Jump in and keep your streak alive.',
  },
};

/** Anything unknown or missing is the original nudge: a call to train. */
export function parseReminderKind(raw: unknown): ReminderKind {
  return typeof raw === 'string' && (REMINDER_KINDS as readonly string[]).includes(raw)
    ? (raw as ReminderKind)
    : 'train';
}

export function reminderButton(kind: ReminderKind): { emoji: string; label: string } {
  const d = DEFS[kind];
  return { emoji: d.emoji, label: d.label };
}

export function reminderNotification(kind: ReminderKind, senderName: string): { title: string; body: string } {
  const name = senderName.trim() || 'Your partner';
  const d = DEFS[kind];
  return { title: d.title(name), body: d.body };
}

/** Confirmation on the sender's side. */
export function reminderSentLine(kind: ReminderKind, partnerName: string): string {
  const d = DEFS[kind];
  return kind === 'train'
    ? `${partnerName} will get a push to come train.`
    : `${d.emoji} ${partnerName} will get your ${d.label.toLowerCase()} reminder.`;
}

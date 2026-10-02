/**
 * Voice-guided meditations: an open sit with a script of spoken prompts, laid
 * out over whatever length was chosen. The paced-breathing sessions live in
 * `domain/mindful` and the breathe screen; these are the ones with no breath to
 * pace — a body scan, counting, kind wishes — where the voice is the guide.
 * Pure, so the timing is testable without a clock.
 */

export type GuidedId = 'body-scan' | 'focus' | 'kindness';

export interface GuidedMeditation {
  id: GuidedId;
  title: string;
  blurb: string;
  emoji: string;
  /** Lengths offered, minutes. The first is the default. */
  minutes: readonly number[];
  /** Said in order over the first minute or so. */
  opening: readonly string[];
  /** Cycled through the middle, one every `every` seconds. */
  middle: readonly string[];
  every: number;
  /** Said over the last half-minute. */
  closing: readonly string[];
}

const CLOSING = ['Let the practice go. Let your breath return to its own pace.', 'Notice how you feel now. Gently open your eyes when you are ready.'];

export const GUIDED: readonly GuidedMeditation[] = [
  {
    id: 'body-scan',
    title: 'Body scan',
    blurb: 'Move attention slowly from head to toe and let each part soften.',
    emoji: '🫧',
    minutes: [10, 5, 15],
    opening: ['Lie down or sit back, and let your eyes close.', 'Take three slow breaths, and let the body grow heavy.'],
    middle: [
      'Bring your attention to the top of your head, and your forehead. Let it soften.',
      'Notice your jaw and your neck. Let them loosen.',
      'Move down to your shoulders. Let them drop away from your ears.',
      'Feel your arms and your hands. Heavy and warm.',
      'Notice your chest and belly rising and falling.',
      'Bring your attention to your lower back and hips. Let them release.',
      'Move down through your legs, your knees, your calves.',
      'Feel your feet, all the way to the tips of your toes.',
      'Now feel the whole body at once, resting and breathing.',
    ],
    every: 50,
    closing: CLOSING,
  },
  {
    id: 'focus',
    title: 'Focus',
    blurb: 'Count breaths from one to ten. Begin again whenever you drift.',
    emoji: '🎯',
    minutes: [5, 10, 15],
    opening: ['Sit tall and let your gaze rest, or close your eyes.', 'Count each out-breath, from one up to ten, and then begin again.'],
    middle: ['If you lost count, that is fine. Start again at one.', 'Notice the breath at the tip of your nose.', 'Thoughts will come. Let them pass, and return to the count.'],
    every: 75,
    closing: CLOSING,
  },
  {
    id: 'kindness',
    title: 'Loving-kindness',
    blurb: 'Kind wishes for yourself, someone close, and everyone.',
    emoji: '💛',
    minutes: [10, 5, 15],
    opening: ['Sit comfortably and bring a hand to your heart if you like.', 'Silently say to yourself: may I be happy, may I be well.'],
    middle: [
      'May I be safe. May I be at ease.',
      'Bring to mind someone you love. May you be happy. May you be well.',
      'Think of someone you barely know. May you be happy too.',
      'Think of someone you find difficult. May you be free from suffering.',
      'Let the wish spread to everyone, everywhere. May all beings be at peace.',
    ],
    every: 70,
    closing: CLOSING,
  },
];

export function getGuided(id: string | undefined): GuidedMeditation | undefined {
  return GUIDED.find((m) => m.id === id);
}

export interface Prompt {
  /** Seconds from the start. */
  at: number;
  text: string;
}

/**
 * When each prompt is said, over `totalSec`.
 *
 * Opening lines are 12 s apart from a 2 s start; closing lines are 12 s apart
 * and end 8 s before the bell; the middle cycles through its lines every
 * `every` seconds in the space between, keeping clear of both ends. A short
 * session simply says fewer middle lines.
 */
export function promptSchedule(med: GuidedMeditation, totalSec: number): Prompt[] {
  const GAP = 12;
  const out: Prompt[] = med.opening.map((text, i) => ({ at: 2 + i * GAP, text }));
  const openEnd = 2 + med.opening.length * GAP;
  const closeStart = Math.max(openEnd, totalSec - 8 - (med.closing.length - 1) * GAP);

  let i = 0;
  for (let at = openEnd + med.every / 2; at < closeStart - GAP; at += med.every) {
    out.push({ at: Math.round(at), text: med.middle[i % med.middle.length]! });
    i += 1;
  }
  med.closing.forEach((text, j) => out.push({ at: closeStart + j * GAP, text }));
  return out.filter((p) => p.at < totalSec);
}

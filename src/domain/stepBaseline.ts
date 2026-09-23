/**
 * Turning Android's boot-relative step counter into "steps today".
 *
 * `TYPE_STEP_COUNTER` reports steps since the device last rebooted — cumulative,
 * monotonic, and counted in hardware, so it keeps running while the app is
 * closed. That last property is what makes a real daily total possible on
 * Android, and it is the thing I got wrong when I first made steps iPhone-only:
 * `watchStepCount` only reports *deltas while subscribed*, but the counter
 * underneath it never stopped.
 *
 * What it does not give is a day boundary. The only reading is "since boot", so
 * today's total is `now - the reading at midnight`. This module owns that
 * subtraction and the two cases where it cannot be done honestly.
 *
 * ## The reboot case, which is the whole reason this is not one line
 *
 * A reboot resets the counter to zero. Any steps taken before it are gone —
 * not reduced, unrecoverable, because nothing persisted them. So after a
 * reboot the honest answer is "this is what we can see since the phone
 * restarted", never a total presented as the day's.
 *
 * A reboot is detected by the reading going *backwards*: the counter is
 * monotonic within a boot, so `current < baseline` can only mean it restarted.
 */

/** What we persist to anchor the day. */
export interface StepBaseline {
  /** `YYYY-MM-DD` the baseline was taken on. */
  day: string;
  /** The sensor reading at that moment — steps since boot. */
  reading: number;
}

export type StepsToday =
  /** A full day's count, anchored to a baseline taken today. */
  | { kind: 'total'; steps: number }
  /**
   * Steps since the phone restarted today. Less than the day's true total,
   * and labelled so, because the pre-reboot steps cannot be recovered.
   */
  | { kind: 'since-reboot'; steps: number }
  /** No baseline for today yet — the first reading establishes one. */
  | { kind: 'starting' };

/**
 * Today's steps from a raw reading and whatever baseline we stored.
 *
 * Pure, so every branch is provable without a device or a sensor.
 */
export function stepsToday(
  reading: number,
  baseline: StepBaseline | null,
  today: string,
): { result: StepsToday; nextBaseline: StepBaseline } {
  const safe = Number.isFinite(reading) && reading >= 0 ? Math.floor(reading) : 0;

  /* No baseline, or one from a previous day: today starts here. The first
     reading of a new day becomes its anchor, so the count begins at zero
     rather than inheriting yesterday's. */
  if (!baseline || baseline.day !== today) {
    return {
      result: { kind: 'starting' },
      nextBaseline: { day: today, reading: safe },
    };
  }

  /* The counter went backwards, which within a single boot is impossible —
     so the device restarted. The steps before the reboot are unrecoverable;
     re-anchor at zero and label what we can still see. */
  if (safe < baseline.reading) {
    return {
      result: { kind: 'since-reboot', steps: safe },
      nextBaseline: { day: today, reading: 0 },
    };
  }

  return {
    result: { kind: 'total', steps: safe - baseline.reading },
    nextBaseline: baseline,
  };
}

/** The number to show, or null when there is nothing honest to show yet. */
export function displayableSteps(result: StepsToday): number | null {
  switch (result.kind) {
    case 'total':
      return result.steps;
    case 'since-reboot':
      return result.steps;
    case 'starting':
      /* Zero here would read as "you have not moved today" when the truth is
         "we only started counting a moment ago". The ring stays empty and the
         caption says so instead. */
      return null;
  }
}

/**
 * Whether the figure understates the day, so the UI can say so.
 *
 * Only the reboot case: a fresh baseline is not an undercount, it is simply
 * the start of measuring.
 */
export function isPartialDay(result: StepsToday): boolean {
  return result.kind === 'since-reboot';
}

import {
  type StepBaseline,
  displayableSteps,
  isPartialDay,
  stepsToday,
} from '../stepBaseline';

const TODAY = '2026-09-24';
const YESTERDAY = '2026-09-23';

const base = (day: string, reading: number): StepBaseline => ({ day, reading });

describe('anchoring the day', () => {
  it('takes the first reading of a new day as the baseline', () => {
    const { result, nextBaseline } = stepsToday(12_000, null, TODAY);
    expect(result).toEqual({ kind: 'starting' });
    expect(nextBaseline).toEqual({ day: TODAY, reading: 12_000 });
  });

  /* Yesterday's anchor would make today's count include yesterday's walking,
     which is the failure a day boundary exists to prevent. */
  it('re-anchors when the stored baseline is from another day', () => {
    const { result, nextBaseline } = stepsToday(12_000, base(YESTERDAY, 3_000), TODAY);
    expect(result).toEqual({ kind: 'starting' });
    expect(nextBaseline).toEqual({ day: TODAY, reading: 12_000 });
  });

  it('counts from the baseline once one exists', () => {
    const { result } = stepsToday(12_500, base(TODAY, 12_000), TODAY);
    expect(result).toEqual({ kind: 'total', steps: 500 });
  });

  it('keeps the baseline unchanged on an ordinary reading', () => {
    const anchor = base(TODAY, 12_000);
    const { nextBaseline } = stepsToday(12_500, anchor, TODAY);
    expect(nextBaseline).toEqual(anchor);
  });

  it('reports zero rather than a negative when nothing has moved', () => {
    const { result } = stepsToday(12_000, base(TODAY, 12_000), TODAY);
    expect(result).toEqual({ kind: 'total', steps: 0 });
  });
});

describe('a reboot mid-day', () => {
  /* The counter is monotonic within a boot, so a reading below the baseline
     can only mean the device restarted. */
  it('is detected by the reading going backwards', () => {
    const { result } = stepsToday(400, base(TODAY, 12_000), TODAY);
    expect(result).toEqual({ kind: 'since-reboot', steps: 400 });
  });

  it('re-anchors at zero so the count keeps rising from the reboot', () => {
    const { nextBaseline } = stepsToday(400, base(TODAY, 12_000), TODAY);
    expect(nextBaseline).toMatchObject({ day: TODAY, reading: 0 });

    const { result } = stepsToday(900, nextBaseline, TODAY);
    expect(result).toMatchObject({ steps: 900 });
  });

  /* The bug this replaced: only the one read where the counter visibly went
     backwards was marked partial. Every later read that day re-derived
     nothing, and presented a post-reboot count as the full day's total. */
  it('stays partial for the rest of the day, not just the first read', () => {
    const { nextBaseline } = stepsToday(400, base(TODAY, 12_000), TODAY);
    const later = stepsToday(900, nextBaseline, TODAY).result;
    expect(later).toEqual({ kind: 'since-reboot', steps: 900 });
    expect(isPartialDay(later)).toBe(true);
  });

  /* The native service marks the baseline partial itself when it sees a
     reboot by boot count, which catches the case "went backwards" cannot:
     enough post-reboot walking to exceed the old baseline. */
  it('honours a partial flag written by the service', () => {
    const { result } = stepsToday(15_000, { day: TODAY, reading: 0, partial: true }, TODAY);
    expect(result).toEqual({ kind: 'since-reboot', steps: 15_000 });
  });

  it('starts a new day whole again', () => {
    const { result } = stepsToday(20_000, { day: YESTERDAY, reading: 0, partial: true }, TODAY);
    expect(result).toEqual({ kind: 'starting' });
  });

  /* The pre-reboot steps are gone, so the figure understates the day. Saying
     so is the whole point — a silent undercount is the failure that made this
     iPhone-only in the first place. */
  it('is marked as an understatement of the day', () => {
    const { result } = stepsToday(400, base(TODAY, 12_000), TODAY);
    expect(isPartialDay(result)).toBe(true);
  });

  it('an ordinary count is not marked partial', () => {
    const { result } = stepsToday(12_500, base(TODAY, 12_000), TODAY);
    expect(isPartialDay(result)).toBe(false);
  });

  it('a fresh baseline is not marked partial either', () => {
    const { result } = stepsToday(12_000, null, TODAY);
    expect(isPartialDay(result)).toBe(false);
  });
});

describe('what the UI may show', () => {
  it('shows a real total', () => {
    expect(displayableSteps({ kind: 'total', steps: 4_200 })).toBe(4_200);
  });

  it('shows the post-reboot figure, which the caller labels', () => {
    expect(displayableSteps({ kind: 'since-reboot', steps: 400 })).toBe(400);
  });

  /* Null, not zero. "0 steps" reads as "you have not moved today" when the
     truth is "we started counting a moment ago" — the same distinction the
     steps ring already draws on a phone that cannot count at all. */
  it('shows nothing at all while the day is still being anchored', () => {
    expect(displayableSteps({ kind: 'starting' })).toBeNull();
  });
});

describe('a sensor that misbehaves', () => {
  it('treats a negative reading as zero rather than rendering it', () => {
    const { result } = stepsToday(-5, null, TODAY);
    expect(result).toEqual({ kind: 'starting' });
  });

  it('treats a garbage reading as zero', () => {
    const { nextBaseline } = stepsToday(Number.NaN, null, TODAY);
    expect(nextBaseline.reading).toBe(0);
  });

  it('floors a fractional reading', () => {
    const { result } = stepsToday(12_500.7, base(TODAY, 12_000), TODAY);
    expect(result).toEqual({ kind: 'total', steps: 500 });
  });
});

import {
  EMPTY_FAB_HINT,
  FAB_HINT_MAX_SHOWS,
  markFabHintShown,
  markFabHintUsed,
  parseFabHint,
  shouldShowFabHint,
} from '../fabHint';

describe('shouldShowFabHint', () => {
  it('shows on a fresh install', () => {
    expect(shouldShowFabHint(EMPTY_FAB_HINT)).toBe(true);
  });

  it('shows for the first few launches', () => {
    for (let shows = 0; shows < FAB_HINT_MAX_SHOWS; shows += 1) {
      expect(shouldShowFabHint({ shows, used: false })).toBe(true);
    }
  });

  it('stops once the cap is reached', () => {
    expect(shouldShowFabHint({ shows: FAB_HINT_MAX_SHOWS, used: false })).toBe(false);
  });

  /*
   * The point of the hint is teaching the gesture. An athlete who has used it
   * has learned it, and showing the hint again on a button they press every
   * session is nagging rather than teaching.
   */
  it('stops permanently once the gesture has been used, even on the first launch', () => {
    expect(shouldShowFabHint({ shows: 0, used: true })).toBe(false);
  });
});

describe('markFabHintShown', () => {
  it('counts a display', () => {
    expect(markFabHintShown(EMPTY_FAB_HINT)).toEqual({ shows: 1, used: false });
  });

  it('never counts past the cap, so the number cannot grow forever', () => {
    const capped = { shows: FAB_HINT_MAX_SHOWS, used: false };
    expect(markFabHintShown(capped)).toEqual(capped);
  });

  it('does not count once the gesture is known', () => {
    const used = { shows: 1, used: true };
    expect(markFabHintShown(used)).toBe(used);
  });
});

describe('markFabHintUsed', () => {
  it('retires the hint', () => {
    const next = markFabHintUsed({ shows: 1, used: false });
    expect(next.used).toBe(true);
    expect(shouldShowFabHint(next)).toBe(false);
  });
});

describe('parseFabHint', () => {
  it('round-trips a stored state', () => {
    const state = { shows: 2, used: false };
    expect(parseFabHint(JSON.stringify(state))).toEqual(state);
  });

  it('treats a missing value as a fresh install', () => {
    expect(parseFabHint(null)).toEqual(EMPTY_FAB_HINT);
    expect(parseFabHint(undefined)).toEqual(EMPTY_FAB_HINT);
    expect(parseFabHint('')).toEqual(EMPTY_FAB_HINT);
  });

  /*
   * This runs inside the tab layout on every launch. Throwing here would take
   * the whole navigator down, so every malformed shape has to land somewhere
   * safe rather than propagate.
   */
  it('survives corrupt or hostile values without throwing', () => {
    expect(parseFabHint('{not json')).toEqual(EMPTY_FAB_HINT);
    expect(parseFabHint('null')).toEqual(EMPTY_FAB_HINT);
    expect(parseFabHint('42')).toEqual(EMPTY_FAB_HINT);
    expect(parseFabHint('"a string"')).toEqual(EMPTY_FAB_HINT);
    expect(parseFabHint('[]')).toEqual({ shows: 0, used: false });
    expect(parseFabHint('{"shows":"lots","used":"yes"}')).toEqual({ shows: 0, used: false });
    expect(parseFabHint('{"shows":-5}')).toEqual({ shows: 0, used: false });
    expect(parseFabHint('{"shows":1e9}')).toEqual({ shows: FAB_HINT_MAX_SHOWS, used: false });
    expect(parseFabHint('{"shows":1.7}')).toEqual({ shows: 1, used: false });
  });

  it('only accepts a real boolean for used', () => {
    expect(parseFabHint('{"used":1}').used).toBe(false);
    expect(parseFabHint('{"used":"true"}').used).toBe(false);
    expect(parseFabHint('{"used":true}').used).toBe(true);
  });
});

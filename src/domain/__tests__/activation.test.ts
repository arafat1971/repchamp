import { firstRepOutcome } from '../activation';

/**
 * The rule that makes install → first counted rep computable.
 *
 * The failure mode being guarded is a double-fire: an event named
 * `first_rep_ever` that fires twice is worse than no event at all, because the
 * activation count silently exceeds the install count and nobody notices a
 * ratio above 1 until they are already reasoning from it.
 */

const NOW = () => '2026-09-13T10:00:00.000Z';

describe('firstRepOutcome', () => {
  it('fires on the very first rep of an athlete with no marker', () => {
    expect(firstRepOutcome(1, null, NOW)).toEqual({
      isFirstEver: true,
      markAt: '2026-09-13T10:00:00.000Z',
    });
  });

  it('treats an unset marker read (undefined) the same as null', () => {
    // MMKV's getString returns undefined for a missing key, not null.
    expect(firstRepOutcome(1, undefined, NOW).isFirstEver).toBe(true);
  });

  it('never fires twice, which is the whole point of the marker', () => {
    const first = firstRepOutcome(1, null, NOW);
    // The marker written by the first call is what the second call reads.
    expect(firstRepOutcome(1, first.markAt, NOW)).toEqual({
      isFirstEver: false,
      markAt: null,
    });
  });

  it('ignores every rep after the first of a set', () => {
    // Rep 2 of the first-ever session is still not a first-ever rep.
    expect(firstRepOutcome(2, null, NOW)).toEqual({
      isFirstEver: false,
      markAt: null,
    });
    expect(firstRepOutcome(50, null, NOW).isFirstEver).toBe(false);
  });

  it('stays silent for an already-activated athlete starting a new set', () => {
    expect(firstRepOutcome(1, '2026-08-01T09:00:00.000Z', NOW).isFirstEver).toBe(false);
  });

  it('offers no timestamp to persist when it does not fire', () => {
    // A caller writing markAt unconditionally must not be able to overwrite
    // the original activation time with a later one.
    expect(firstRepOutcome(1, '2026-08-01T09:00:00.000Z', NOW).markAt).toBeNull();
  });
});

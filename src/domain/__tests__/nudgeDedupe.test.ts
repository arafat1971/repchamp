import { IN_APP_NUDGE_DEDUPE_MS, isDuplicateNudge } from '../nudgeDedupe';

const base = { type: 'couple-nudge', local: undefined, suppressing: true, msSinceInApp: 500 };

describe('isDuplicateNudge', () => {
  it('hides the remote push that lands just after the in-app nudge', () => {
    expect(isDuplicateNudge(base)).toBe(true);
  });

  /* The bug: the in-app nudge was hidden by its own dedupe stamp. */
  it('never hides the in-app nudge itself', () => {
    expect(isDuplicateNudge({ ...base, local: true })).toBe(false);
  });

  it('shows a remote push when no in-app nudge was shown recently', () => {
    expect(isDuplicateNudge({ ...base, msSinceInApp: IN_APP_NUDGE_DEDUPE_MS + 1 })).toBe(false);
  });

  it('only applies to couple nudges, and only while suppressing', () => {
    expect(isDuplicateNudge({ ...base, type: 'challenge' })).toBe(false);
    expect(isDuplicateNudge({ ...base, suppressing: false })).toBe(false);
  });
});

import { MAX_REASON_LENGTH, flush, identify, track, truncateReason } from '../analytics';

/**
 * The analytics wrapper's core safety guarantee: with no key configured (the
 * test/default environment), every entry point is an inert no-op. Instrumenting
 * the app must never throw or fire network calls just because analytics isn't
 * set up — that's what makes `track()` safe to sprinkle everywhere.
 */
describe('analytics — unconfigured no-op', () => {
  const fetchSpy = jest.spyOn(globalThis, 'fetch');

  afterEach(() => fetchSpy.mockClear());

  it('track() does not throw and sends nothing without a key', () => {
    expect(() => {
      track('app_opened');
      track('session_started', { exercise: 'push', mode: 'practice' });
      track('home_hero_shown', { kind: 'streak-at-risk' });
    }).not.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('identify() is safe with a uid or null', () => {
    expect(() => {
      identify('user-123');
      identify(null);
    }).not.toThrow();
  });

  it('flush() resolves and makes no request when unconfigured', async () => {
    await expect(flush()).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

/*
 * `purchase_failed.reason` is the only free-text property in the catalogue —
 * everything else is a number or a short enum. It carries a store SDK's error
 * message straight through, so its length and content are decided by a third
 * party. Nothing downstream bounds a single property: `MAX_BATCH` and
 * `MAX_QUEUE` cap how many events are sent, not how large one is.
 */
describe('truncateReason', () => {
  it('passes a real store message through untouched', () => {
    for (const real of [
      'Invalid Play Store credentials.',
      'BILLING_UNAVAILABLE',
      'The device or user is not allowed to make the purchase.',
    ]) {
      expect(truncateReason(real)).toBe(real);
    }
  });

  it('bounds a pathological message and marks the cut', () => {
    const out = truncateReason('x'.repeat(5000));
    expect(out.length).toBe(MAX_REASON_LENGTH);
    expect(out.endsWith('…')).toBe(true);
  });

  it('keeps the distinguishing head of a long message', () => {
    const out = truncateReason(`InvalidCredentialsError: ${'detail '.repeat(200)}`);
    expect(out.startsWith('InvalidCredentialsError:')).toBe(true);
  });

  /* A missing reason is itself worth seeing — the event should still record
     that a purchase failed, and an empty string reads as a broken chart. */
  it('reports an absent or blank reason as unknown', () => {
    expect(truncateReason(undefined)).toBe('unknown');
    expect(truncateReason(null)).toBe('unknown');
    expect(truncateReason('   ')).toBe('unknown');
  });

  it('does not alter a message sitting exactly on the limit', () => {
    const exact = 'y'.repeat(MAX_REASON_LENGTH);
    expect(truncateReason(exact)).toBe(exact);
  });
});

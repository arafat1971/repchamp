import { flush, identify, track } from '../analytics';

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

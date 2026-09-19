/**
 * Every funnel event must actually fire somewhere.
 *
 * `paywall_dismissed` was declared in the event catalogue from the start,
 * documented there as "the other half of the funnel" — and for the whole life of
 * the paywall modal it was only ever fired by `onboarding`. The modal is reached
 * from sixteen call sites (the rep wall, the exercise library, form reports,
 * programmes, duels, Profile) and from every one of them a decline was
 * invisible. Views and purchases were counted; refusals were not.
 *
 * That is the worst shape an analytics gap can take, because the dashboard looks
 * populated. A source that nobody reaches and a source that everybody rejects
 * both show a low `subscribed` count, and without the decline event there is
 * nothing to tell them apart.
 *
 * Nothing in the type system links a declared event to a call site — the
 * catalogue is a type, and an unused key is not an error. So this reads the
 * source and asserts the link, the same technique and for the same stated
 * reason as `notificationRouting.test.ts`. It is cheap to delete the day these
 * events are fired through a single instrumented wrapper instead.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..');

const analyticsSource = readFileSync(join(ROOT, 'src', 'lib', 'analytics.ts'), 'utf8');
const paywallSource = readFileSync(join(ROOT, 'app', 'modal', 'paywall.tsx'), 'utf8');

/** Event names declared in the `AnalyticsEvents` catalogue. */
function declaredEvents(source: string): Set<string> {
  const body = source.slice(
    source.indexOf('AnalyticsEvents'),
    source.indexOf('share_opened'),
  );
  return new Set([...body.matchAll(/^\s{2}([a-z][a-z0-9_]*):/gm)].map((m) => m[1] as string));
}

/** Event names passed to `track(...)` anywhere in the repo's app + src trees. */
function firedEvents(sources: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const source of sources) {
    for (const m of source.matchAll(/track\(\s*'([a-z][a-z0-9_]*)'/g)) {
      out.add(m[1] as string);
    }
  }
  return out;
}

describe('the paywall funnel is fully instrumented', () => {
  /* The three outcomes that matter. A view with no outcome event is an athlete
     who vanished from the data. */
  it.each([
    ['paywall_dismissed', 'the athlete saw the price and left'],
    ['purchase_cancelled', 'the store sheet opened and they backed out'],
    ['purchase_failed', 'the payment was attempted and did not complete'],
  ])('fires %s — %s', (event) => {
    expect(paywallSource).toContain(`track('${event}'`);
  });

  /* `paywall_viewed` is the denominator; without it every rate is undefined. */
  it('still fires the view that the others are measured against', () => {
    expect(paywallSource).toContain("track('paywall_viewed'");
  });

  /* The regression that started this: a decline must be attributable to the
     surface that produced it, or a per-source conversion rate cannot be built. */
  it('attributes every outcome to the source that opened the paywall', () => {
    for (const event of ['paywall_dismissed', 'purchase_cancelled', 'purchase_failed']) {
      const at = paywallSource.indexOf(`track('${event}'`);
      expect(at).toBeGreaterThan(-1);
      // The call's payload — generous window, these are multi-line objects.
      expect(paywallSource.slice(at, at + 260)).toContain('params.source');
    }
  });

  /* Success must NOT be counted as a dismissal. `leave()` is the exit after a
     purchase too, so firing the decline event there would make the number
     meaningless — every subscriber would also be a refusal. */
  it('does not count a subscriber as a dismissal', () => {
    const at = paywallSource.indexOf("track('subscribed'");
    expect(at).toBeGreaterThan(-1);
    expect(paywallSource.slice(at, at + 200)).not.toContain('paywall_dismissed');
  });
});

describe('the event catalogue has no dead entries', () => {
  /* The general form of the bug. An event declared and never fired is a
     measurement someone believed they had — worse than one that was never
     designed, because nobody goes looking for it. */
  it('fires every paywall and purchase event it declares', () => {
    const sources = [
      paywallSource,
      readFileSync(join(ROOT, 'app', 'onboarding.tsx'), 'utf8'),
      readFileSync(join(ROOT, 'app', '(tabs)', 'profile.tsx'), 'utf8'),
    ];
    const fired = firedEvents(sources);

    const funnel = [...declaredEvents(analyticsSource)].filter(
      (e) => e.startsWith('paywall_') || e.startsWith('purchase_') || e === 'subscribed',
    );

    expect(funnel.length).toBeGreaterThan(0);
    const dead = funnel.filter((e) => !fired.has(e));
    expect(dead).toEqual([]);
  });
});

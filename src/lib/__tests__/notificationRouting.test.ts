/**
 * Every notification type that gets sent must have somewhere to land.
 *
 * `dormant-reminder` shipped without an arm in the routing chain: the slot
 * emitted its type, `routeFromData` in `app/_layout.tsx` had no branch for it,
 * and a tap fell through the whole `if`/`else if` chain without calling
 * `router.push` at all. The athlete landed on whatever screen happened to be
 * mounted — and because `track('notification_opened')` fires *before* the
 * chain, the analytics recorded a successful open the entire time. A tap that
 * goes nowhere while reporting that it went somewhere is the worst shape this
 * bug can take, since the dashboard says the feature works.
 *
 * Neither the type checker nor 967 unit tests caught it. Nothing links the two
 * files: one writes a string into a notification payload, the other compares
 * strings out of it, and `app/` has no tests at all — there is no
 * `@testing-library/react-native` in this project, so the routing chain cannot
 * be imported and exercised the way a normal unit test would.
 *
 * So this reads both files as text and checks the two sets agree. That is an
 * unusual thing for a test to do, and it is deliberate: a grep-shaped assertion
 * that runs on every push is worth more than a perfectly-shaped one that does
 * not exist. It is also cheap to delete — the day this project gains real
 * component tests, a test that mounts the layout and asserts the navigation
 * subsumes this entirely.
 *
 * What it cannot see: whether a branch routes somewhere *sensible*. It proves
 * every type is handled, not that it is handled well.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..');

const notificationsSource = readFileSync(join(ROOT, 'src', 'lib', 'notifications.ts'), 'utf8');
const layoutSource = readFileSync(join(ROOT, 'app', '_layout.tsx'), 'utf8');

/** Types written into a notification payload — `data: { type: '...' }`. */
function emittedTypes(source: string): Set<string> {
  return new Set(
    [...source.matchAll(/data:\s*\{\s*type:\s*'([a-z-]+)'/g)].map((m) => m[1] as string),
  );
}

/** Types the tap handler compares against — `type === '...'`. */
function routedTypes(source: string): Set<string> {
  return new Set(
    [...source.matchAll(/type === '([a-z-]+)'/g)]
      .map((m) => m[1] as string)
      // `typeof type === 'string'` is the analytics guard, not a route.
      .filter((t) => t !== 'string'),
  );
}

describe('notification routing coverage', () => {
  /* The guard itself. Read from source rather than hardcoded, so a slot added
     next year is covered without anyone remembering this file exists. */
  it('routes every notification type that is emitted', () => {
    const emitted = emittedTypes(notificationsSource);
    const routed = routedTypes(layoutSource);

    const unroutable = [...emitted].filter((t) => !routed.has(t)).sort();
    expect(unroutable).toEqual([]);
  });

  /* The specific regression. Named on its own so a failure says which feature
     broke rather than only that some set difference is non-empty. */
  it('routes the three-day dormant reminder', () => {
    expect(emittedTypes(notificationsSource).has('dormant-reminder')).toBe(true);
    expect(routedTypes(layoutSource).has('dormant-reminder')).toBe(true);
  });

  /* A win-back push must not open a sales page, which is the entire reason it
     shares the reminder branch rather than getting one of its own: its copy
     promises progress the athlete already banked, so a paywall is the sharpest
     possible contradiction of what the notification just said. */
  it('sends the dormant reminder down the walled-aware reminder branch', () => {
    const branch = /type === 'workout-reminder' \|\|\s*type === 'streak-reminder' \|\|\s*type === 'dormant-reminder'/;
    expect(layoutSource).toMatch(branch);
  });

  /* Guards the extractors, not the app: if a refactor changes how payloads are
     written or compared, these regexes could quietly match nothing and the
     suite above would pass by finding no work to do. */
  it('actually finds types in both files', () => {
    expect(emittedTypes(notificationsSource).size).toBeGreaterThanOrEqual(6);
    expect(routedTypes(layoutSource).size).toBeGreaterThanOrEqual(6);
  });
});

/**
 * The navigation and intent events must actually fire, and mean what they say.
 *
 * Same failure mode `paywallFunnel.test.ts` was written for, one layer out:
 * nothing in the type system links a declared event to a call site, so an event
 * added to the catalogue and never fired is a measurement someone believes they
 * have. That test filters to `paywall_*`/`purchase_*`, so these four events sit
 * outside it — exactly the gap it warns about, just past its filter.
 *
 * The `isAI` assertions are the ones worth having. A roster padded with
 * labelled AI opponents reading back as organic social activity is the single
 * most believable and most misleading number this app could report, and the
 * honest-cold-start rule exists to stop the product making that claim to
 * users. `friend_invited` is where the same claim could be made to ourselves.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..');

const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), 'utf8');

const analyticsSource = read('src', 'lib', 'analytics.ts');
const tabViewSource = read('src', 'lib', 'useTabView.ts');
const trainSource = read('app', '(tabs)', 'train.tsx');
const arenaSource = read('app', '(tabs)', 'arena.tsx');
const friendsSource = read('app', '(tabs)', 'friends.tsx');
const profileSource = read('app', '(tabs)', 'profile.tsx');

describe('every tab reports that it was viewed', () => {
  /* The denominator. A surface missing from this list looks unvisited rather
     than uninstrumented, and the two are indistinguishable downstream. */
  it.each([
    ['train', trainSource],
    ['arena', arenaSource],
    ['friends', friendsSource],
    ['profile', profileSource],
  ])('%s calls useTabView', (tab, source) => {
    expect(source).toContain(`useTabView('${tab}')`);
  });

  it('declares exactly the four tabs that exist', () => {
    const at = analyticsSource.indexOf('tab_viewed:');
    expect(at).toBeGreaterThan(-1);
    const decl = analyticsSource.slice(at, at + 120);
    for (const tab of ['train', 'arena', 'friends', 'profile']) {
      expect(decl).toContain(`'${tab}'`);
    }
  });

  /* On focus, not on mount. A tab screen stays mounted once visited, so a mount
     effect fires once per app run and undercounts every return — which inverts
     the meaning of a retention number rather than merely dulling it. */
  it('counts views rather than first opens', () => {
    expect(tabViewSource).toContain('useFocusEffect');
    expect(tabViewSource).not.toMatch(/useEffect\(/);
  });

  /* `track` queues unconditionally — it has no dedupe — so the firing rule is
     the only thing standing between this and an inflated count. The callback
     depends on `tab` alone, a per-screen constant, so its identity is stable
     across re-renders and the effect re-runs only on a real focus change. */
  it('does not re-fire on every re-render', () => {
    expect(tabViewSource).toMatch(/useCallback\([\s\S]*\[tab\]/);
  });
});

describe('intent events fire from the surfaces they describe', () => {
  it('records a reach for a workout, both modes', () => {
    expect(trainSource).toContain("track('train_intent'");
    expect(trainSource).toContain("mode: 'practice'");
    expect(trainSource).toContain("mode: 'together'");
  });

  /* Recorded before the wall check. A tap that bounces to the paywall is still
     an athlete reaching to train, and dropping it would make the wall look
     free of demand it is actually suppressing. */
  it('counts a walled tap as intent', () => {
    const at = trainSource.indexOf("track('train_intent'");
    const walled = trainSource.indexOf('isWalled(');
    expect(at).toBeGreaterThan(-1);
    expect(walled).toBeGreaterThan(at);
  });

  it('distinguishes the three Arena destinations', () => {
    for (const destination of ['leaderboard', 'daily', 'opponent-picker']) {
      expect(arenaSource).toContain(`destination: '${destination}'`);
    }
  });
});

describe('AI opponents are never counted as organic social activity', () => {
  /* The rule this protects: labelled AI partners exist so a cold start is not
     an empty app, and they are marked as AI to the athlete. A funnel that
     silently folds them into friend invites tells us the social loop works
     when what works is the padding. */
  it('marks every friend_invited call as AI or not', () => {
    const calls = [...friendsSource.matchAll(/track\('friend_invited'[\s\S]{0,160}?\}\)/g)];
    expect(calls.length).toBeGreaterThan(0);
    for (const [call] of calls) {
      expect(call).toMatch(/isAI:\s*(true|false)/);
    }
  });

  it('has both a human and an AI call site', () => {
    expect(friendsSource).toMatch(/isAI:\s*false/);
    expect(friendsSource).toMatch(/isAI:\s*true/);
  });

  /* Bots and phantoms both route into a versus session against a non-human.
     Either one recorded as `isAI: false` is the exact misreport above. */
  it('never reports a versus-bot session as a human invite', () => {
    for (const m of friendsSource.matchAll(/track\('friend_invited'[\s\S]{0,400}?router\.push\([\s\S]{0,300}?\)/g)) {
      const [call] = m;
      if (call.includes("mode: 'versus'")) {
        expect(call).toMatch(/isAI:\s*true/);
      }
    }
  });
});

describe('the new events are not dead entries', () => {
  it('fires every navigation and intent event it declares', () => {
    const sources = [trainSource, arenaSource, friendsSource, profileSource, tabViewSource];
    const fired = new Set<string>();
    for (const source of sources) {
      for (const m of source.matchAll(/track\(\s*'([a-z][a-z0-9_]*)'/g)) {
        fired.add(m[1] as string);
      }
    }

    const declared = ['tab_viewed', 'train_intent', 'arena_opened', 'friend_invited'];
    for (const event of declared) {
      expect(analyticsSource).toContain(`${event}:`);
    }
    expect(declared.filter((e) => !fired.has(e))).toEqual([]);
  });
});

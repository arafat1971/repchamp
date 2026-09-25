import {
  ANDROID_WIDGET_IDS,
  WIDGET_IDS,
  WIDGET_SNAPSHOT_KEY,
  WIDGET_SNAPSHOT_KEYS,
  WIDGET_STALE_AFTER_MS,
  buildWidgetSnapshot,
  isSnapshotStale,
} from '@/domain/widgetSnapshot';
import type { PartnerWidget } from '@/domain/coupleExercises';

const w = (over: Partial<PartnerWidget> = {}): PartnerWidget => ({
  pulse: { kind: 'recent', daysAgo: 2 },
  theirDays: 3,
  myDays: 4,
  sharedDays: 2,
  myReps: 120,
  strip: 'NTMBNTB',
  letters: 'FSSMTWT',
  ...over,
});

describe('buildWidgetSnapshot', () => {
  it('phrases today, shared and solo differently', () => {
    expect(
      buildWidgetSnapshot('Sam', w({ pulse: { kind: 'trained-today', sharedToday: true } }))
        .headline,
    ).toBe('You both trained today');
    expect(
      buildWidgetSnapshot('Sam', w({ pulse: { kind: 'trained-today', sharedToday: false } }))
        .headline,
    ).toBe('Sam trained today');
  });

  it('says yesterday rather than "1 days ago"', () => {
    expect(buildWidgetSnapshot('Sam', w({ pulse: { kind: 'recent', daysAgo: 1 } })).headline).toBe(
      'Sam trained yesterday',
    );
    expect(buildWidgetSnapshot('Sam', w({ pulse: { kind: 'recent', daysAgo: 3 } })).headline).toBe(
      'Sam trained 3 days ago',
    );
  });

  it('handles the quiet and no-history cases', () => {
    expect(buildWidgetSnapshot('Sam', w({ pulse: { kind: 'quiet', daysAgo: 6 } })).headline).toContain(
      'quiet 6 days',
    );
    expect(buildWidgetSnapshot('Sam', w({ pulse: { kind: 'no-history' } })).headline).toBe(
      'Sam has not logged a set yet',
    );
  });

  it('falls back when the partner has no usable name', () => {
    expect(buildWidgetSnapshot('   ', w()).partnerName).toBe('Your partner');
    expect(buildWidgetSnapshot('', w({ pulse: { kind: 'no-history' } })).headline).toBe(
      'Your partner has not logged a set yet',
    );
  });

  /* The asymmetry must survive the trip into a different process: the widget
     has no partner rep count because this device has none to give it. */
  it('carries no partner rep count into the payload', () => {
    const snap = buildWidgetSnapshot('Sam', w());
    expect(Object.keys(snap)).not.toContain('theirReps');
    expect(JSON.stringify(snap)).not.toMatch(/theirReps|partnerReps/);
  });

  /* The payload lands in SharedPreferences, readable by the app's own
     processes. It must carry nothing identifying beyond the name already on
     screen. */
  it('leaks no identifiers', () => {
    const json = JSON.stringify(buildWidgetSnapshot('Sam', w()));
    for (const forbidden of ['uid', 'token', 'pairCode', 'email', 'coupleId']) {
      expect(json.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it('flags freshness only for a claim about today', () => {
    expect(
      buildWidgetSnapshot('Sam', w({ pulse: { kind: 'trained-today', sharedToday: false } }))
        .freshToday,
    ).toBe(true);
    expect(buildWidgetSnapshot('Sam', w({ pulse: { kind: 'recent', daysAgo: 1 } })).freshToday).toBe(
      false,
    );
  });

  it('is a flat payload of primitives only', () => {
    for (const value of Object.values(buildWidgetSnapshot('Sam', w()))) {
      expect(['string', 'number', 'boolean']).toContain(typeof value);
    }
  });
});

describe('isSnapshotStale', () => {
  /* A widget silently showing week-old numbers is worse than one admitting it
     is out of date — the athlete cannot tell the difference otherwise. */
  it('is fresh inside the window and stale past it', () => {
    const snap = buildWidgetSnapshot('Sam', w(), 1_000_000);
    expect(isSnapshotStale(snap, 1_000_000 + WIDGET_STALE_AFTER_MS - 1)).toBe(false);
    expect(isSnapshotStale(snap, 1_000_000 + WIDGET_STALE_AFTER_MS + 1)).toBe(true);
  });

  it('tolerates an overnight gap', () => {
    const snap = buildWidgetSnapshot('Sam', w(), 0);
    expect(isSnapshotStale(snap, 10 * 60 * 60 * 1000)).toBe(false);
  });
});

/**
 * The JS→Kotlin contract, checked as text.
 *
 * The payload crosses a language and a process boundary: this module writes
 * JSON, and `PartnerWidgetProvider.kt` reads it with `optString`/`optInt` keys
 * typed by hand. Nothing in either toolchain links the two — rename a field
 * here and the widget silently draws blanks, because `opt*` returns a default
 * rather than throwing.
 *
 * The Kotlin lives in a config plugin (`plugins/withPartnerWidget.js`), which
 * is committed, so the source of truth is readable from here. `android/` itself
 * is generated and gitignored, so this reads the plugin rather than the output.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

describe('the widget payload matches what the provider reads', () => {
  const plugin = readFileSync(
    join(__dirname, '..', '..', '..', 'plugins', 'withPartnerWidget.js'),
    'utf8',
  );

  it('writes every key the Kotlin provider asks for', () => {
    const read = [...plugin.matchAll(/opt(?:String|Int|Long)\("([a-zA-Z]+)"/g)].map(
      (m) => m[1] as string,
    );
    expect(read.length).toBeGreaterThan(0);

    const written = Object.keys(buildWidgetSnapshot('Sam', w()));
    for (const key of new Set(read)) {
      expect(written).toContain(key);
    }
  });

  /* The storage key is duplicated across the boundary by necessity — the
     provider cannot import a TS constant. If they drift the widget reads
     nothing and shows its empty state forever. */
  it('agrees with the provider on the storage key', () => {
    expect(plugin).toContain(WIDGET_SNAPSHOT_KEY);
  });

  /* The widget id is the argument the bridge dispatches on. A rename on one
     side resolves to `null` in the Kotlin `when` and publishes nowhere — no
     crash, no log, just a card that never updates again. Nothing else would
     catch that, so assert both directions. */
  it('agrees with the plugin on every widget id Android ships', () => {
    const declared = [...plugin.matchAll(/id:\s*'([a-z-]+)'/g)].map((m) => m[1] as string);
    expect(declared.length).toBeGreaterThan(0);
    expect([...ANDROID_WIDGET_IDS].sort()).toEqual([...declared].sort());
  });

  it('agrees with the plugin on every storage key Android ships', () => {
    for (const id of ANDROID_WIDGET_IDS) {
      expect(plugin).toContain(WIDGET_SNAPSHOT_KEYS[id]);
    }
  });

  /* Every id must belong to one platform or the other — an id in neither
     list is one nothing can render, which is the silent-publish failure
     these tests exist to prevent. */
  it('ships every declared id somewhere', () => {
    const ios = readFileSync(
      join(__dirname, '..', '..', '..', 'plugins', 'withDailyWidgetIOS.js'),
      'utf8',
    );
    for (const id of WIDGET_IDS) {
      const onAndroid = ANDROID_WIDGET_IDS.includes(id);
      const onIos = ios.includes(WIDGET_SNAPSHOT_KEYS[id]);
      expect(onAndroid || onIos).toBe(true);
    }
  });

  /* Same for the staleness window: the provider hardcodes it in milliseconds
     because it cannot read the constant either. */
  it('agrees with the provider on the staleness window', () => {
    expect(WIDGET_STALE_AFTER_MS).toBe(12 * 60 * 60 * 1000);
    expect(plugin).toMatch(/12L \* 60L \* 60L \* 1000L/);
  });
});

/*
 * The nudge line — what turns a scoreboard into a reason to act.
 *
 * The constraint that keeps it honest: every branch restates something already
 * visible on the widget. No invented deadline, no countdown, nothing about what
 * the partner will think. The rest of this app refuses manufactured urgency and
 * a home-screen widget is the last place to start.
 */
describe('nudge', () => {
  it('names the one genuinely actionable state', () => {
    const snap = buildWidgetSnapshot(
      'Sam',
      w({ pulse: { kind: 'trained-today', sharedToday: false } }),
    );
    expect(snap.nudge).toBe('Your turn — train to make it a shared day');
  });

  it('names what a shared day bought', () => {
    const snap = buildWidgetSnapshot(
      'Sam',
      w({ pulse: { kind: 'trained-today', sharedToday: true }, sharedDays: 3 }),
    );
    expect(snap.nudge).toBe('3 shared days this week');
  });

  it('says "1 shared day", not "1 shared days"', () => {
    const snap = buildWidgetSnapshot(
      'Sam',
      w({ pulse: { kind: 'trained-today', sharedToday: true }, sharedDays: 1 }),
    );
    expect(snap.nudge).toBe('1 shared day this week');
  });

  it('states who is ahead, in either direction', () => {
    expect(
      buildWidgetSnapshot('Sam', w({ pulse: { kind: 'recent', daysAgo: 1 }, theirDays: 4, myDays: 2 }))
        .nudge,
    ).toBe('Sam is ahead this week');
    expect(
      buildWidgetSnapshot('Sam', w({ pulse: { kind: 'recent', daysAgo: 1 }, theirDays: 2, myDays: 4 }))
        .nudge,
    ).toContain('You are ahead');
  });

  it('points at a real feature when the bond goes quiet', () => {
    expect(
      buildWidgetSnapshot('Sam', w({ pulse: { kind: 'quiet', daysAgo: 5 } })).nudge,
    ).toBe('Open RepChamp to send a nudge');
  });

  /* Filler is worse than silence: a line that means nothing trains the athlete
     to stop reading the line that does. */
  it('says nothing rather than filler', () => {
    expect(buildWidgetSnapshot('Sam', w({ pulse: { kind: 'no-history' } })).nudge).toBe('');
    expect(
      buildWidgetSnapshot('Sam', w({ pulse: { kind: 'trained-today', sharedToday: true }, sharedDays: 0 }))
        .nudge,
    ).toBe('');
  });

  /* The honesty guard. No branch may invent a deadline, threaten a loss, or
     speak for the partner. */
  it('never manufactures urgency', () => {
    const pulses: PartnerWidget['pulse'][] = [
      { kind: 'trained-today', sharedToday: true },
      { kind: 'trained-today', sharedToday: false },
      { kind: 'recent', daysAgo: 1 },
      { kind: 'recent', daysAgo: 2 },
      { kind: 'quiet', daysAgo: 5 },
      { kind: 'no-history' },
    ];
    for (const pulse of pulses) {
      const { nudge } = buildWidgetSnapshot('Sam', w({ pulse }));
      for (const banned of ['don’t lose', 'hurry', 'last chance', 'expires', 'disappointed', 'failing']) {
        expect(nudge.toLowerCase()).not.toContain(banned);
      }
    }
  });
});

describe('the water line', () => {
  const recent = w({ pulse: { kind: 'recent', daysAgo: 1 } });

  it('names a partner who is ahead on water today', () => {
    expect(buildWidgetSnapshot('Bea', recent, 0, { theirMl: 1750, myMl: 500 }).nudge).toBe(
      'Bea has had 1.75 L 💧 — your turn',
    );
  });

  it('keeps the training turn first', () => {
    const trained = w({ pulse: { kind: 'trained-today', sharedToday: false } });
    expect(buildWidgetSnapshot('Bea', trained, 0, { theirMl: 1750, myMl: 0 }).nudge).toBe(
      'Your turn — train to make it a shared day',
    );
  });

  /* Not shared today is unknown, not zero; and behind is not "your turn". */
  it('says nothing about water it does not know or that is not a reason', () => {
    const base = buildWidgetSnapshot('Bea', recent, 0).nudge;
    expect(buildWidgetSnapshot('Bea', recent, 0, { theirMl: null, myMl: 0 }).nudge).toBe(base);
    expect(buildWidgetSnapshot('Bea', recent, 0, { theirMl: 500, myMl: 900 }).nudge).toBe(base);
  });
});

describe('the week strip', () => {
  it('carries the strip and a phrased count line', () => {
    const snap = buildWidgetSnapshot('Sam', w());
    expect(snap.strip).toBe('NTMBNTB');
    expect(snap.letters).toBe('FSSMTWT');
    expect(snap.statsLine).toBe('Sam 3 · You 4 · Together 2 🔥');
    expect(buildWidgetSnapshot('Sam', w({ sharedDays: 0 })).statsLine).toBe('Sam 3 · You 4 · Together 0');
  });
});

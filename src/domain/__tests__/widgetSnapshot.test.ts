import {
  WIDGET_SNAPSHOT_KEY,
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

  /* Same for the staleness window: the provider hardcodes it in milliseconds
     because it cannot read the constant either. */
  it('agrees with the provider on the staleness window', () => {
    expect(WIDGET_STALE_AFTER_MS).toBe(12 * 60 * 60 * 1000);
    expect(plugin).toMatch(/12L \* 60L \* 60L \* 1000L/);
  });
});

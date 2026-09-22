import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui';
import { partnerWidget } from '@/domain/coupleExercises';
import { trackerHistory } from '@/domain/coupleTracker';
import { dayKey } from '@/domain/progression';
import { buildWidgetSnapshot } from '@/domain/widgetSnapshot';
import {
  isWidgetSupported,
  placedWidgetCount,
  publishWidgetSnapshot,
} from '@/services/partnerWidget';
import { useCouple } from '@/state/useCouple';
import { useProfileStore } from '@/state/profileStore';
import { font } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

/**
 * Forcing a widget publish from real store state, in dev builds only.
 *
 * The OS widget has been verified end to end except for one link: the app
 * actually calling `setSnapshot`. Every render checked so far was seeded by
 * pushing JSON straight into `SharedPreferences` over adb, which proves the
 * provider draws correctly but says nothing about whether the JS side ever
 * reaches it.
 *
 * That link is hard to exercise by simply using the app, because Home only
 * publishes when `partnerPulse` is non-null — that is, when this athlete is
 * paired *and* the bond has loaded. A single emulator account is never paired,
 * so the effect returns early and the widget stays on whatever adb last wrote.
 * The gap is invisible: the card looks right either way.
 *
 * So this panel runs the same pipeline Home runs, and reports each stage rather
 * than only the outcome. "Not paired" is a real answer here, not a failure —
 * it is the state that silently skips the publish in the first place, and
 * seeing it named is the point.
 *
 * Self-guarding on `__DEV__` like `PoseDebugHud`, so the call site cannot
 * forget and this never reaches an athlete.
 */
export function WidgetPublishDebug() {
  const couple = useCouple();
  const sessions = useProfileStore((s) => s.sessions);
  const [report, setReport] = useState<string | null>(null);

  const run = useCallback(() => {
    const lines: string[] = [];
    const supported = isWidgetSupported();
    lines.push(`native module: ${supported ? 'present' : 'MISSING'}`);

    if (!supported) {
      lines.push('');
      lines.push('Nothing can publish. Either this is not Android, or this');
      lines.push('build predates the widget plugin — run a prebuild.');
      setReport(lines.join('\n'));
      return;
    }

    const uid = couple.me?.uid;
    lines.push(`paired: ${couple.paired}`);
    lines.push(`partner: ${couple.partner?.displayName ?? '—'}`);

    if (!couple.paired || !couple.partner || !uid) {
      lines.push('');
      lines.push('Home would return early here and publish nothing, which is');
      lines.push('why the widget keeps whatever it last had. Pair to test the');
      lines.push('real path; the JSON below is what a paired state would send.');
    }

    /* The same construction Home does, so a divergence here is a real bug and
       not an artefact of the debug panel building its payload differently. */
    const today = dayKey(new Date());
    const history = trackerHistory(couple.couple, uid ?? '', today, 7);
    const widget = partnerWidget(history, sessions, today);
    const snapshot = buildWidgetSnapshot(
      couple.partner?.displayName ?? 'Your partner',
      widget,
    );

    publishWidgetSnapshot(snapshot);
    lines.push('');
    lines.push('published:');
    lines.push(JSON.stringify(snapshot, null, 2));

    /* Read back after the write. The count comes from the AppWidgetManager, so
       a non-zero value means the launcher really is hosting an instance that
       just got the broadcast — the closest thing to a delivery receipt the
       fire-and-forget bridge allows. */
    void placedWidgetCount().then((n) => {
      lines.push('');
      lines.push(
        n > 0
          ? `${n} placed instance${n === 1 ? '' : 's'} broadcast to.`
          : 'No placed instances — nothing redrew. Add the widget first.',
      );
      setReport(lines.join('\n'));
    });

    setReport(lines.join('\n'));
  }, [couple.paired, couple.partner, couple.couple, couple.me?.uid, sessions]);

  if (!__DEV__) return null;

  return (
    <View style={styles.wrap}>
      <PressableScale
        onPress={run}
        accessibilityRole="button"
        accessibilityLabel="Force a widget publish"
        style={styles.button}
      >
        <Text style={styles.buttonText}>DEV · force widget publish</Text>
      </PressableScale>
      {report ? <Text style={styles.report}>{report}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16, marginBottom: 8 },
  button: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: palette.grey600,
    borderRadius: radius.xl,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonText: { ...font('bold', 11, { color: palette.grey600 }), letterSpacing: 0.6 },
  report: {
    ...font('regular', 10, { color: palette.grey600 }),
    fontFamily: 'monospace',
    marginTop: 10,
    lineHeight: 14,
  },
});

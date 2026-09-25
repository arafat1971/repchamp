import { StyleSheet, Text, View } from 'react-native';

import { Capsule, HealthCard, IOS, Metric, PersonRow } from '@/components/home/HealthCard';
import { StepsIcon } from '@/components/home/Icons';
import { PressableScale } from '@/components/ui';
import {
  type StepsState,
  formatSteps,
  isFixableByAthlete,
  stepsProgress,
  stepsUnavailableCopy,
} from '@/domain/steps';
import { font } from '@/theme/typography';

/* The partner wears the same hue, lighter — one metric, two people. */
const PARTNER = 'rgba(255,107,44,0.45)';

/**
 * Today's steps, in the Health app's grammar: the count large, a capsule to
 * the goal under it, and — when paired — the partner's line beneath.
 *
 * Each missing count says why in its own words, and the permission case
 * offers the fix.
 */
export function StepsCard({
  steps,
  onFixSteps,
  partner,
}: {
  steps: StepsState;
  onFixSteps?: () => void;
  me?: { name: string; avatar?: string | null };
  /** Present when paired; `steps` null until they share a count today. */
  partner?: { name: string; avatar?: string | null; steps: number | null } | null;
}) {
  const read = steps.status === 'ready' ? stepsProgress(steps.steps, steps.goal) : null;
  const canFix = steps.status === 'unavailable' && isFixableByAthlete(steps.reason) && !!onFixSteps;
  const note =
    steps.status === 'unavailable'
      ? stepsUnavailableCopy(steps.reason)
      : steps.status === 'loading'
        ? 'Counting…'
        : '';

  const gap = read && partner?.steps != null ? read.steps - partner.steps : null;
  const status = !read
    ? null
    : gap != null && partner
      ? gap === 0
        ? `Level with ${partner.name}`
        : gap > 0
          ? `${formatSteps(gap)} ahead of ${partner.name}`
          : `${formatSteps(-gap)} behind ${partner.name}`
      : read.met
        ? 'Goal reached'
        : `${formatSteps(read.goal - read.steps)} to go`;

  return (
    <HealthCard icon={<StepsIcon size={16} color={IOS.steps} />} title="Steps" tint={IOS.steps} trailing={read ? `Goal ${formatSteps(read.goal)}` : undefined}>
      {read ? (
        <>
          <View style={styles.metricRow}>
            <Metric value={formatSteps(read.steps)} unit="steps" />
            {status ? (
              <Text style={[styles.status, read.met && !partner && { color: IOS.green }]} numberOfLines={1}>
                {status}
              </Text>
            ) : null}
          </View>
          <Capsule fraction={read.percent / 100} color={IOS.steps} />
          {partner ? (
            <View style={styles.partner}>
              <PersonRow
                name={partner.name}
                avatar={partner.avatar}
                color={PARTNER}
                fraction={partner.steps == null ? 0 : partner.steps / read.goal}
                value={partner.steps == null ? 'Not shared yet' : formatSteps(partner.steps)}
                muted={partner.steps == null}
              />
            </View>
          ) : null}
        </>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.note}>{note}</Text>
          {canFix ? (
            <PressableScale
              onPress={onFixSteps}
              accessibilityRole="button"
              accessibilityLabel="Turn on step counting"
              style={styles.fix}
            >
              <Text style={styles.fixText}>Turn On</Text>
            </PressableScale>
          ) : null}
        </View>
      )}
    </HealthCard>
  );
}

const styles = StyleSheet.create({
  metricRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
    marginBottom: 10,
  },
  status: { ...font('medium', 13, { color: IOS.secondary }), flexShrink: 1 },
  partner: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: IOS.separator,
  },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  note: { ...font('medium', 14, { color: IOS.secondary }), flex: 1 },
  fix: {
    backgroundColor: 'rgba(255,107,44,0.12)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  fixText: font('bold', 13.5, { color: IOS.steps }),
});

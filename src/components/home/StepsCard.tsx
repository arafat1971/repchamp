import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { StepsRace } from '@/components/home/StepsRace';
import { StepsTrail } from '@/components/home/StepsTrail';
import { PressableScale } from '@/components/ui';
import {
  type StepsState,
  formatSteps,
  isFixableByAthlete,
  stepsProgress,
  stepsUnavailableCopy,
} from '@/domain/steps';
import { font } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

/**
 * Today's steps: the footprint trail beside the count.
 *
 * Split out of the old Today card so hydration can be a card of its own.
 * Each missing count says why in its own words, and the permission case
 * offers the fix.
 */
export function StepsCard({
  steps,
  onFixSteps,
  me,
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

  /* Paired and counting: the day becomes a race to the flag. */
  if (read && partner && me) {
    const gap = partner.steps == null ? null : read.steps - partner.steps;
    return (
      <LinearGradient colors={['#131a2e', '#0b1120']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.raceCard}>
        <View style={styles.raceHead}>
          <Text style={styles.eyebrow}>👟 TODAY’S RACE</Text>
          <Text style={styles.goalText}>to {formatSteps(read.goal)}</Text>
        </View>
        <StepsRace
          goal={read.goal}
          me={{ ...me, steps: read.steps }}
          partner={partner}
        />
        {gap != null ? (
          <Text style={styles.raceLine}>
            {gap === 0
              ? `Neck and neck with ${partner.name}`
              : gap > 0
                ? `You're ${formatSteps(gap)} steps ahead of ${partner.name}`
                : `${partner.name} is ${formatSteps(-gap)} ahead — go for a walk?`}
          </Text>
        ) : null}
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#131a2e', '#0b1120']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
      <StepsTrail percent={read?.percent ?? null} width={124} height={92} />
      <View style={{ flex: 1 }}>
        <Text style={styles.eyebrow}>👟 STEPS</Text>
        <Text style={styles.count}>
          {read ? formatSteps(read.steps) : '—'}
          {read?.met ? ' ✓' : ''}
        </Text>
        {read ? (
          <Text style={styles.sub}>
            {read.met
              ? `Goal of ${formatSteps(read.goal)} met`
              : `${formatSteps(read.goal - read.steps)} to your ${formatSteps(read.goal)} goal`}
          </Text>
        ) : canFix ? (
          <PressableScale
            onPress={onFixSteps}
            accessibilityRole="button"
            accessibilityLabel="Turn on step counting"
            style={styles.fix}
          >
            <Text style={styles.fixText}>Turn on step counting</Text>
          </PressableScale>
        ) : (
          <Text style={styles.sub}>{note}</Text>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  raceCard: { borderRadius: radius['3xl'], padding: 16, gap: 12 },
  raceHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  goalText: font('semibold', 12, { color: 'rgba(255,255,255,0.5)' }),
  raceLine: { ...font('semibold', 13, { color: 'rgba(253,230,138,0.9)' }), textAlign: 'center' },
  card: { borderRadius: radius['3xl'], padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  eyebrow: { ...font('extrabold', 11.5, { color: 'rgba(253,230,138,0.7)' }), letterSpacing: 1.3 },
  count: { ...font('extrabold', 24, { color: palette.white }), marginTop: 2, letterSpacing: -0.4 },
  sub: { ...font('medium', 12.5, { color: 'rgba(255,255,255,0.6)' }), marginTop: 2 },
  fix: {
    alignSelf: 'flex-start',
    marginTop: 8,
    backgroundColor: '#f59e0b',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  fixText: font('extrabold', 12.5, { color: palette.ink }),
});

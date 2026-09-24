import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

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
export function StepsCard({ steps, onFixSteps }: { steps: StepsState; onFixSteps?: () => void }) {
  const read = steps.status === 'ready' ? stepsProgress(steps.steps, steps.goal) : null;
  const canFix = steps.status === 'unavailable' && isFixableByAthlete(steps.reason) && !!onFixSteps;
  const note =
    steps.status === 'unavailable'
      ? stepsUnavailableCopy(steps.reason)
      : steps.status === 'loading'
        ? 'Counting…'
        : '';

  return (
    <LinearGradient colors={['#2a1a06', '#1a1206']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
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

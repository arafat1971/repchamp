import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Capsule, HealthCard, IOS, Metric } from '@/components/home/HealthCard';
import { TargetIcon } from '@/components/home/Icons';
import { currentWeekDayKeys, weeklyChallengeProgress } from '@/domain/weeklyChallenge';
import { useProfileStore } from '@/state/profileStore';
import { font, scaleForRole } from '@/theme/typography';

/**
 * This week's rotating challenge — a time-boxed goal that pulls athletes back
 * and gives them something to share. Progress + countdown come from the pure
 * `weeklyChallenge` domain; a tap starts the challenge exercise.
 *
 * ## Why `now` is a required prop rather than a clock read in here
 *
 * This memo used to key on `[sessions]` alone while reading `new Date()` twice
 * inside itself — once for the day-set and once for the challenge definition.
 * Two problems followed. The card froze at mount: nothing on the Arena tab
 * refreshes it, so an app left backgrounded over Sunday night kept showing last
 * week's title and target against this week's reps — two contradictory claims
 * about one goal, which is the failure `domain/dailyChallenge` was written to
 * end. And the two reads could straddle midnight, pairing one week's day-set
 * with another week's challenge.
 *
 * One injected instant fixes both: every value on the card is now derived from
 * the same moment, and the moment is the caller's to own and to refresh. The
 * prop is required rather than defaulted because a default would let the next
 * call site quietly reintroduce the frozen clock — the type should force the
 * decision to be made at the screen, where the refresh policy lives.
 */
export function WeeklyChallengeCard({ now }: { now: Date }) {
  const router = useRouter();
  const sessions = useProfileStore((s) => s.sessions);

  const progress = useMemo(() => {
    /* One instant for both: the day-set and the challenge definition must agree
       about which week it is, which two separate `new Date()` calls cannot
       guarantee at a boundary. */
    return weeklyChallengeProgress(sessions, currentWeekDayKeys(now), now);
  }, [sessions, now]);

  const { def, reps, percent, complete, daysLeft } = progress;

  const onStart = () =>
    router.push({ pathname: '/session', params: { exercise: def.exercise, mode: 'practice' } });

  const tint = complete ? '#FF9500' : IOS.green;

  /* A white card like Home's summary cards, rather than a dark gradient slab:
     the duel above is the one coloured block on this tab. Completion turns
     the label and bar amber — a state change worth seeing, once a week. */
  return (
    <HealthCard
      icon={<TargetIcon size={16} color={tint} />}
      title="Weekly challenge"
      tint={tint}
      trailing={complete ? 'Done' : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`}
      onPress={onStart}
      accessibilityLabel={`This week's challenge: ${def.title}, ${reps} of ${def.target} done`}
    >
      <Text style={styles.title} {...scaleForRole('heading')}>
        {def.title}
      </Text>
      <Text style={styles.blurb}>{complete ? 'Done for this week. Extra sets still count.' : def.blurb}</Text>
      <View style={styles.progressRow}>
        <Metric value={String(Math.min(reps, def.target))} unit={`of ${def.target}`} />
        <Text style={[styles.cta, { color: tint }]}>{complete ? 'Keep going' : 'Start'}</Text>
      </View>
      <Capsule fraction={percent} color={tint} />
    </HealthCard>
  );
}

const styles = StyleSheet.create({
  title: { ...font('bold', 20, { color: IOS.label, marginTop: 10 }), letterSpacing: -0.4 },
  blurb: font('medium', 13.5, { color: IOS.secondary, marginTop: 2 }),
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 12,
    marginBottom: 10,
  },
  cta: font('bold', 15),
});

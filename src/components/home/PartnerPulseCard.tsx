import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { PressableScale } from '@/components/ui';
import { getExercise } from '@/vision/exercises';
import type { ExerciseHabit, PartnerWidget } from '@/domain/coupleExercises';
import { font } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

/**
 * A live look at the partner's week, on Home.
 *
 * `CoupleStrip` above this carries the bond's headline — streak, combined
 * reps, a seven-day dot row. It never answers the question a paired athlete
 * actually opens the app to ask: *have they trained today, and how do we
 * compare this week?*
 *
 * Live is literal. `watchMyCouple` holds an `onSnapshot` on the couple
 * document, so a partner finishing a set moves these numbers on this device
 * within seconds, with no refresh and no polling.
 *
 * ## Why the two columns do not match
 *
 * My reps are local and exact. My partner's *days* sync to the bond; their reps
 * per day and their movements never leave their phone. So their column counts
 * days and mine counts reps, and the footnote says which is which. Showing a
 * rep number under their name would mean inventing one.
 */
export function PartnerPulseCard({
  partnerName,
  widget,
  myExercises,
  onPress,
}: {
  partnerName: string;
  widget: PartnerWidget;
  /** My movements this week, strongest first — the fine detail only I have. */
  myExercises: readonly ExerciseHabit[];
  onPress: () => void;
}) {
  const { pulse } = widget;

  const headline =
    pulse.kind === 'trained-today'
      ? pulse.sharedToday
        ? `You and ${partnerName} both trained today`
        : `${partnerName} trained today`
      : pulse.kind === 'recent'
        ? `${partnerName} trained ${pulse.daysAgo === 1 ? 'yesterday' : `${pulse.daysAgo} days ago`}`
        : pulse.kind === 'quiet'
          ? `${partnerName} has been quiet for ${pulse.daysAgo} days`
          : `${partnerName} has not logged a set yet`;

  const accent =
    pulse.kind === 'trained-today'
      ? palette.green500
      : pulse.kind === 'quiet'
        ? palette.amber500
        : palette.purple500;

  return (
    <Animated.View entering={FadeInDown.duration(320)}>
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${headline}. ${widget.sharedDays} shared ${
          widget.sharedDays === 1 ? 'day' : 'days'
        } this week. Open the bond tracker.`}
      >
        <View style={styles.card}>
          <View style={[styles.accent, { backgroundColor: accent }]} />

          <View style={styles.head}>
            <Text style={styles.eyebrow}>PARTNER</Text>
            {/* A live dot, and only when the claim is actually about today. */}
            {pulse.kind === 'trained-today' ? (
              <View style={styles.liveRow}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>TODAY</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.headline} numberOfLines={2}>
            {headline}
          </Text>

          <View style={styles.statRow}>
            <Stat value={widget.theirDays} label={`${partnerName} · days`} tint={palette.purple500} />
            <Stat value={widget.myDays} label="You · days" tint={palette.green600} />
            <Stat value={widget.sharedDays} label="Together" tint={palette.amber800} />
          </View>

          {/* Only my side can be broken down by movement, so only my side is. */}
          {myExercises.length > 0 ? (
            <Text style={styles.mine} numberOfLines={1}>
              You: {myExercises.map((e) => `${getExercise(e.exercise).label} ${e.reps}`).join(' · ')}
            </Text>
          ) : null}

          <Text style={styles.note}>
            {partnerName}’s training days sync live. Their reps stay on their phone.
          </Text>
        </View>
      </PressableScale>
    </Animated.View>
  );
}

function Stat({ value, label, tint }: { value: number; label: string; tint: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: tint }]}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.white,
    borderRadius: radius['4xl'],
    padding: 16,
    paddingLeft: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.border,
  },
  accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { ...font('extrabold', 10, { color: palette.grey600 }), letterSpacing: 1.2 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.green500 },
  liveText: { ...font('extrabold', 9, { color: palette.green700 }), letterSpacing: 0.8 },
  headline: { ...font('extrabold', 16, { color: palette.ink }), marginTop: 6, lineHeight: 21 },
  statRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { ...font('extrabold', 20) },
  statLabel: { ...font('semibold', 9.5, { color: palette.grey600 }), marginTop: 2 },
  mine: { ...font('semibold', 11, { color: palette.purple500 }), marginTop: 12 },
  note: { ...font('semibold', 10, { color: palette.grey500 }), marginTop: 6, lineHeight: 14 },
});

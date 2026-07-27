import { LinearGradient } from 'expo-linear-gradient';
import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { font } from '@/theme/typography';
import { gradients, palette, radius } from '@/theme/tokens';

/**
 * The image card shared after a workout — the outbound growth loop.
 *
 * A visual "beat me" card lands in a friend's chat as a real picture (via
 * `react-native-view-shot` + `expo-sharing`), which pulls installs far better
 * than a text line. Rendered off-screen and captured by ref; never shown inline.
 *
 * The copy is a challenge, not a humble-brag: the whole point is to make the
 * recipient want to try it and send one back.
 */
export const ResultShareCard = forwardRef<View, {
  name: string;
  reps: number;
  exerciseLabel: string;
  streak: number;
}>(function ResultShareCard({ name, reps, exerciseLabel, streak }, ref) {
  return (
    // Solid backdrop so the captured PNG has no transparent corners.
    <View ref={ref} collapsable={false} style={styles.wrap}>
      <LinearGradient colors={gradients.brandStrong} style={styles.card}>
        <Text style={styles.brand}>REPCHAMP</Text>

        <Text style={styles.reps}>{reps}</Text>
        <Text style={styles.repsLabel}>{exerciseLabel.toUpperCase()} IN A SET</Text>

        <View style={styles.divider} />

        <Text style={styles.challenge}>
          {name} just set the bar.{'\n'}Can you beat it?
        </Text>

        {streak > 0 ? (
          <View style={styles.streakPill}>
            <Text style={styles.streakText}>🔥 {streak} DAY STREAK</Text>
          </View>
        ) : null}

        <Text style={styles.cta}>Download RepChamp · repchamp.web.app</Text>
      </LinearGradient>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { backgroundColor: palette.canvas, borderRadius: radius['4xl'], alignSelf: 'flex-start' },
  card: {
    width: 320,
    borderRadius: radius['4xl'],
    paddingVertical: 34,
    paddingHorizontal: 26,
    alignItems: 'center',
  },
  brand: {
    ...font('extrabold', 12, { color: 'rgba(255,255,255,0.75)' }),
    letterSpacing: 4,
    marginBottom: 18,
  },
  reps: { ...font('extrabold', 92, { color: palette.white }), lineHeight: 96 },
  repsLabel: {
    ...font('extrabold', 12, { color: 'rgba(255,255,255,0.85)' }),
    letterSpacing: 2.5,
    marginTop: 2,
  },
  divider: {
    width: 54,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.4)',
    marginVertical: 20,
  },
  challenge: {
    ...font('extrabold', 19, { color: palette.white }),
    textAlign: 'center',
    lineHeight: 25,
  },
  streakPill: {
    marginTop: 18,
    backgroundColor: 'rgba(0,0,0,0.22)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  streakText: { ...font('extrabold', 12, { color: palette.white }), letterSpacing: 1.2 },
  cta: {
    ...font('bold', 11, { color: 'rgba(255,255,255,0.8)' }),
    marginTop: 22,
    letterSpacing: 0.3,
  },
});

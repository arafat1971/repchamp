import { BlurView } from 'expo-blur';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { PressableScale, PrimaryButton } from '@/components/ui';
import {
  EXERCISE_SAFETY_BODY,
  EXERCISE_SAFETY_TITLE,
} from '@/domain/exerciseSafety';
import { font, text } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

/** One coaching pointer shown in the pre-set tutorial. */
const TIPS: readonly { emoji: string; title: string; body: string }[] = [
  {
    emoji: '📱',
    title: 'Prop your phone up',
    body: 'Lean it against a wall or shelf so it stands on its own — hands-free and steady.',
  },
  {
    emoji: '📐',
    title: 'Film side-on',
    body: 'Turn side-on to the camera so it sees the full bend of your arms and legs.',
  },
  {
    emoji: '🧍',
    title: 'Step back into frame',
    body: 'Stand back far enough that your whole body fits — head to feet — inside the brackets.',
  },
  {
    emoji: '💡',
    title: 'Keep the light in front',
    body: 'Face a window or lamp. Backlight turns you into a silhouette the model can’t read.',
  },
  {
    emoji: '❤️',
    title: EXERCISE_SAFETY_TITLE,
    body: EXERCISE_SAFETY_BODY,
  },
];

/**
 * The "how to get a clean read" tutorial, shown over the live camera the first
 * time an athlete reaches a session. It is fully skippable — a rushed user can
 * dismiss it in one tap, and it never returns once seen.
 */
export function CameraTutorial({ onDismiss }: { onDismiss: () => void }) {
  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      exiting={FadeOut.duration(160)}
      style={StyleSheet.absoluteFill}
    >
      {Platform.OS === 'ios' ? (
        <BlurView intensity={38} tint="dark" style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.androidDim]} />
      )}
      <View style={styles.scrim} />

      <View style={styles.body}>
        <PressableScale
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Skip tutorial"
          style={styles.skip}
        >
          <Text style={styles.skipLabel}>Skip ✕</Text>
        </PressableScale>

        <Text style={styles.heroEmoji}>🎥</Text>
        <Text style={styles.title}>Get a clean read</Text>
        <Text style={styles.subtitle}>
          A few seconds of setup and every rep counts. You can skip this anytime.
        </Text>

        <View style={styles.tips}>
          {TIPS.map((tip) => (
            <View key={tip.title} style={styles.tipRow}>
              <Text style={styles.tipEmoji}>{tip.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.tipTitle}>{tip.title}</Text>
                <Text style={styles.tipBody}>{tip.body}</Text>
              </View>
            </View>
          ))}
        </View>

        <PrimaryButton label="I’m ready — let’s go" onPress={onDismiss} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  /** Android BlurView needs a blurTarget; solid dim avoids dimezis spam + jank. */
  androidDim: { backgroundColor: 'rgba(6,10,8,0.82)' },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(6,10,8,0.55)',
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  skip: {
    position: 'absolute',
    top: 54,
    right: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  skipLabel: font('extrabold', 13, { color: palette.white }),
  heroEmoji: { fontSize: 48, textAlign: 'center', marginBottom: 8 },
  title: {
    ...font('extrabold', 26, { color: palette.white }),
    textAlign: 'center',
  },
  subtitle: {
    ...font('semibold', 14, { color: 'rgba(255,255,255,0.75)' }),
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  tips: { gap: 12, marginBottom: 28 },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius['2xl'],
    padding: 12,
  },
  tipEmoji: { fontSize: 26 },
  tipTitle: font('extrabold', 15, { color: palette.white }),
  tipBody: {
    ...text.caption,
    color: 'rgba(255,255,255,0.72)',
    marginTop: 4,
  },
});

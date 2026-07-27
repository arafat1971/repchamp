import { BlurView } from 'expo-blur';
import { Linking, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { PressableScale, PrimaryButton } from '@/components/ui';
import { font, text } from '@/theme/typography';
import { palette, radius } from '@/theme/tokens';

/**
 * Full-screen gate shown when the camera cannot be used at all — the athlete
 * denied the permission, or the OS restricted it (parental controls, MDM).
 *
 * A RepChamp session is nothing without the camera: counting reps against a
 * blank gradient would hand out real XP for no real work. So rather than
 * silently running a fake timed set, we stop and explain — with a one-tap route
 * into system Settings, since a *denied* permission can no longer be requested
 * from inside the app (only `not-determined` can).
 */
export function CameraDenied({
  restricted,
  onBack,
}: {
  /** `true` when the OS restricted the camera and Settings won't help. */
  restricted?: boolean;
  onBack: () => void;
}) {
  return (
    <Animated.View entering={FadeIn.duration(220)} style={StyleSheet.absoluteFill}>
      <BlurView intensity={38} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.scrim} />

      <View style={styles.body}>
        <Text style={styles.heroEmoji}>📷</Text>
        <Text style={styles.title}>Camera access is off</Text>
        <Text style={styles.subtitle}>
          {restricted
            ? 'The camera has been restricted on this device, so RepChamp can’t count your reps. Ask whoever manages this device to allow camera access.'
            : 'RepChamp counts every rep by watching you move, so it needs the camera. Turn it on in Settings and come right back.'}
        </Text>

        {restricted ? null : (
          <View style={styles.steps}>
            <Step index="1" body="Open Settings" />
            <Step index="2" body="Tap Camera" />
            <Step index="3" body="Switch it on for RepChamp" />
          </View>
        )}

        {restricted ? null : (
          <PrimaryButton label="Open Settings" onPress={() => void Linking.openSettings()} />
        )}

        <PressableScale
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.back}
        >
          <Text style={styles.backLabel}>Go back</Text>
        </PressableScale>
      </View>
    </Animated.View>
  );
}

/** One numbered instruction row. */
function Step({ index, body }: { index: string; body: string }) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepNum}>
        <Text style={styles.stepNumLabel}>{index}</Text>
      </View>
      <Text style={styles.stepBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(6,10,8,0.6)',
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 26,
  },
  heroEmoji: { fontSize: 52, textAlign: 'center', marginBottom: 12 },
  title: {
    ...font('extrabold', 26, { color: palette.white }),
    textAlign: 'center',
  },
  subtitle: {
    ...font('semibold', 14, { color: 'rgba(255,255,255,0.75)' }),
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 26,
    paddingHorizontal: 8,
    lineHeight: 21,
  },
  steps: { gap: 12, marginBottom: 28 },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius['2xl'],
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumLabel: font('extrabold', 14, { color: palette.white }),
  stepBody: font('semibold', 15, { color: palette.white }),
  back: {
    marginTop: 18,
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 26,
  },
  backLabel: {
    ...text.button,
    color: 'rgba(255,255,255,0.85)',
  },
});
